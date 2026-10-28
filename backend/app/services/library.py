"""Read side: reports, bookmark queries, achievements, export, deletion.

Every function takes the current user and filters by user_id. Nothing here
accepts a user id from the client.
"""

import logging
from datetime import timedelta
from typing import Literal

from sqlalchemy import Select, and_, delete, func, or_, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..integrations.x_client import XClient
from ..models import Bookmark, Category, OAuthAccount, ProfileStats, Scan, User, UserAchievement, utcnow
from ..rules.report import ACHIEVEMENTS, ACHIEVEMENTS_VERSION, evaluate_achievements
from ..rules.topics import CONTENT_TYPES, TOPIC_IDS
from ..schemas import AchievementOut, AuthorOut, BookmarkOut, ReportOut, ScanOut
from .tokens import cipher_for, decrypt_tokens

log = logging.getLogger("bkmk.library")

SortKey = Literal["newest", "oldest", "author", "longest"]
DateRange = Literal["any", "30d", "6m", "1y", "older"]
RANGE_DAYS = {"30d": 30, "6m": 182, "1y": 365}


def bookmark_out(b: Bookmark) -> BookmarkOut:
    return BookmarkOut(
        id=str(b.id),
        x_post_id=b.x_post_id,
        author=AuthorOut(handle=b.author_handle or "unknown", name=b.author_name or b.author_handle or "Unknown"),
        text=b.text,
        created_at=b.x_created_at,
        url=b.url,
        links=list(b.links or []),
        topic=b.primary_category_id,
        topic_confidence=b.topic_confidence,
        secondary_topics=[t.category_id for t in b.tags],
        content_type=b.content_type,
        content_type_certain=b.content_type_certain,
        matched=list(b.matched_keywords or []),
        first_seen_at=b.first_seen_at,
    )


def scan_out(s: Scan) -> ScanOut:
    return ScanOut(
        id=str(s.id),
        status=s.status,
        mode=s.mode,
        phase=s.phase,
        requested_limit=s.requested_limit,
        retrieved=s.retrieved,
        new_bookmarks=s.new_bookmarks,
        removed_bookmarks=s.removed_bookmarks,
        classified=s.classified,
        pages=s.pages,
        events=list(s.events or []),
        coverage=s.coverage,
        coverage_note=s.coverage_note,
        stop_reason=s.stop_reason,
        error_code=s.error_code,
        error_message=s.error_message,
        api_requests=s.api_requests,
        estimated_cost_usd=float(s.estimated_cost_usd or 0),
        started_at=s.started_at,
        completed_at=s.completed_at,
    )


def latest_scan(db: Session, user: User) -> Scan | None:
    return db.scalar(select(Scan).where(Scan.user_id == user.id).order_by(Scan.started_at.desc()).limit(1))


def achievements_for(db: Session, user: User, stats: dict) -> list[AchievementOut]:
    """Persisted unlocks win: a badge, once earned under this rules version, stays earned."""
    persisted = {
        a.achievement_key: a
        for a in db.scalars(
            select(UserAchievement).where(
                UserAchievement.user_id == user.id, UserAchievement.rules_version == ACHIEVEMENTS_VERSION
            )
        )
    }
    out = []
    for p in evaluate_achievements(stats):
        row = persisted.get(p["id"])
        earned = p["earned"] or row is not None
        out.append(
            AchievementOut(
                id=p["id"],
                earned=earned,
                current=p["target"] if earned else p["current"],
                target=p["target"],
                unlocked_at=row.unlocked_at if row else None,
                rules_version=ACHIEVEMENTS_VERSION if earned else None,
            )
        )
    return out


def build_report(db: Session, user: User) -> ReportOut | None:
    profile = db.get(ProfileStats, user.id)
    if profile is None:
        return None
    scan = db.get(Scan, profile.scan_id) if profile.scan_id else None
    recent = db.scalars(
        select(Bookmark)
        .where(Bookmark.user_id == user.id)
        .order_by(Bookmark.x_created_at.desc().nulls_last(), Bookmark.id)
        .limit(5)
    ).all()
    return ReportOut(
        handle=user.handle,
        display_name=user.display_name or user.handle,
        scanned_at=scan.completed_at or scan.started_at if scan else profile.computed_at,
        coverage=scan.coverage if scan and scan.coverage else "partial",
        coverage_note=scan.coverage_note if scan else None,
        stats=profile.stats,
        archetype=profile.archetype,
        score=profile.score,
        achievements=achievements_for(db, user, profile.stats),
        achievements_version=ACHIEVEMENTS_VERSION,
        recent=[bookmark_out(b) for b in recent],
        scan=scan_out(scan) if scan else None,
    )


# ── library queries ─────────────────────────────────────────────────────────


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def query_bookmarks(
    db: Session,
    user: User,
    *,
    q: str = "",
    topics: list[str] | None = None,
    types: list[str] | None = None,
    author: str = "",
    date: DateRange = "any",
    sort: SortKey = "newest",
    offset: int = 0,
    limit: int = 30,
) -> tuple[list[Bookmark], int, dict]:
    topics = [t for t in (topics or []) if t in TOPIC_IDS]
    types = [t for t in (types or []) if t in CONTENT_TYPES]
    scope = [Bookmark.user_id == user.id]
    if len(topics) == 1:
        # A single topic defines the page's scope (topic detail): facets stay within it.
        scope.append(Bookmark.primary_category_id == topics[0])
    filters = list(scope)
    if topics:
        filters.append(Bookmark.primary_category_id.in_(topics))
    if types:
        filters.append(Bookmark.content_type.in_(types))
    if author:
        filters.append(Bookmark.author_handle == author)
    if date != "any":
        cutoff = utcnow() - timedelta(days=RANGE_DAYS.get(date, 365))
        filters.append(Bookmark.x_created_at < cutoff if date == "older" else Bookmark.x_created_at >= cutoff)
    for term in q.lower().split()[:8]:
        like = f"%{_escape_like(term[:64])}%"
        filters.append(
            or_(
                func.lower(Bookmark.text).like(like, escape="\\"),
                func.lower(Bookmark.author_handle).like(like, escape="\\"),
                func.lower(Bookmark.author_name).like(like, escape="\\"),
            )
        )

    order = {
        "newest": (Bookmark.x_created_at.desc().nulls_last(), Bookmark.id),
        "oldest": (Bookmark.x_created_at.asc().nulls_last(), Bookmark.id),
        "author": (Bookmark.author_handle.asc(), Bookmark.x_created_at.desc().nulls_last(), Bookmark.id),
        "longest": (Bookmark.content_type != "thread", Bookmark.x_created_at.desc().nulls_last(), Bookmark.id),
    }[sort]
    stmt: Select = select(Bookmark).where(and_(*filters)).order_by(*order).offset(offset).limit(limit)
    total = db.scalar(select(func.count()).select_from(Bookmark).where(and_(*filters))) or 0
    items = list(db.scalars(stmt))

    facets = {
        "types": dict(
            db.execute(
                select(Bookmark.content_type, func.count()).where(and_(*scope)).group_by(Bookmark.content_type)
            ).all()
        ),
        "topics": dict(
            db.execute(
                select(Bookmark.primary_category_id, func.count())
                .where(Bookmark.user_id == user.id)
                .group_by(Bookmark.primary_category_id)
            ).all()
        ),
        "authors": [
            {"handle": h, "count": n}
            for h, n in db.execute(
                select(Bookmark.author_handle, func.count())
                .where(and_(*scope))
                .group_by(Bookmark.author_handle)
                .order_by(func.count().desc(), Bookmark.author_handle)
                .limit(200)
            ).all()
            if h
        ],
    }
    return items, total, facets


def topic_summaries(db: Session, user: User) -> list[dict]:
    profile = db.get(ProfileStats, user.id)
    if profile is None:
        return []
    stats = profile.stats
    cats = {c.id: c for c in db.scalars(select(Category))}
    out = []
    for tid in TOPIC_IDS:
        count = stats["topicCounts"].get(tid, 0)
        if not count:
            continue
        b = stats.get("topicBreakdown", {}).get(tid, {})
        out.append(
            {
                "id": tid,
                "label": cats[tid].label if tid in cats else tid,
                "description": cats[tid].description if tid in cats else "",
                "count": count,
                "share": count / stats["accessible"] if stats["accessible"] else 0,
                "authors": b.get("authors", 0),
                "types": b.get("types", {}),
            }
        )
    return out


# ── export and deletion ─────────────────────────────────────────────────────


def export_payload(db: Session, user: User) -> dict:
    report = build_report(db, user)
    rows = db.scalars(
        select(Bookmark)
        .where(Bookmark.user_id == user.id)
        .order_by(Bookmark.x_created_at.desc().nulls_last(), Bookmark.id)
    )
    return {
        "exportedAt": utcnow().isoformat(),
        "account": {
            "handle": user.handle,
            "displayName": user.display_name,
            "lastScanAt": user.last_scan_at.isoformat() if user.last_scan_at else None,
        },
        "report": report.model_dump(mode="json", by_alias=True, exclude={"recent"}) if report else None,
        "bookmarks": [bookmark_out(b).model_dump(mode="json", by_alias=True) for b in rows],
        "note": "Bookmarks as returned by the X API to BKMK.exe. Classification is rules-based.",
    }


def delete_account(db: Session, user: User, settings: Settings, client: XClient | None) -> bool:
    """Revoke tokens at X (best effort) then delete every row owned by the user."""
    revoked = False
    acct: OAuthAccount | None = user.oauth_account
    if acct is not None and client is not None:
        try:
            access, refresh = decrypt_tokens(user, cipher_for(settings))
            # Revoking the refresh token invalidates the grant; revoke both to be safe.
            results = [client.revoke(t) for t in (refresh, access) if t]
            revoked = any(results)
        except Exception:  # noqa: BLE001 - deletion must proceed even if X is unreachable
            log.warning("revocation failed; deleting local data anyway", extra={"user_id": str(user.id)})
    uid = user.id
    db.execute(delete(Bookmark).where(Bookmark.user_id == uid))
    db.delete(user)  # cascades to sessions, oauth account, scans, achievements, stats
    db.commit()
    log.info("account deleted", extra={"user_id": str(uid), "revoked": revoked})
    return revoked


def achievement_keys() -> list[str]:
    return [a.id for a in ACHIEVEMENTS]


def parse_csv(value: str | None) -> list[str]:
    return [v for v in (value or "").split(",") if v][:20]
