"""The scan pipeline: retrieve → upsert → classify → stats → score → archetype → achievements.

Idempotent by construction: bookmarks upsert on (user_id, x_post_id) and
achievements insert-once on (user_id, key, rules_version). Progress is written
to the scan row after every page so the UI can poll real numbers.
"""

import hashlib
import logging
import time
import uuid
from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..config import Settings
from ..integrations.x_client import XApiError, XClient, XPost, XUser
from ..models import Bookmark, BookmarkTag, ProfileStats, Scan, User, UserAchievement, utcnow
from ..rules.classifier import CLASSIFIER_VERSION, ClassifierInput, classify
from ..rules.report import (
    ACHIEVEMENTS_VERSION,
    StatItem,
    compute_score,
    compute_stats,
    derive_archetype,
    evaluate_achievements,
    rules_version,
)
from .tokens import cipher_for, valid_access_token

log = logging.getLogger("bkmk.scan")
ACTIVE = ("queued", "running")
MAX_PAGES = 20  # hard safety stop independent of X's behaviour


# ── creation ────────────────────────────────────────────────────────────────


def create_scan(db: Session, user: User, settings: Settings, mode: str | None) -> tuple[Scan, bool]:
    """Returns (scan, created). An active scan is reused instead of starting a second one."""
    active = db.scalar(select(Scan).where(Scan.user_id == user.id, Scan.status.in_(ACTIVE)))
    if active:
        return active, False
    if user.oauth_account is None or user.oauth_account.status == "revoked":
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail={"code": "not_connected", "message": "Connect your X account first."}
        )

    last = db.scalar(select(Scan).where(Scan.user_id == user.id).order_by(Scan.started_at.desc()).limit(1))
    if last and last.status in ("completed", "partial") and settings.scan_cooldown_seconds > 0:
        wait = (last.started_at + timedelta(seconds=settings.scan_cooldown_seconds) - utcnow()).total_seconds()
        if wait > 0:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "scan_cooldown",
                    "message": f"You can scan again in {int(wait // 60) + 1} min.",
                    "retryAfter": int(wait),
                },
            )
    has_bookmarks = db.scalar(select(Bookmark.id).where(Bookmark.user_id == user.id).limit(1)) is not None
    resolved = mode if mode in ("full", "refresh") else ("refresh" if has_bookmarks else "full")
    scan = Scan(
        user_id=user.id,
        status="queued",
        mode=resolved,
        requested_limit=settings.scan_max_bookmarks,
        rules_version=rules_version(),
        events=[],
    )
    db.add(scan)
    db.commit()
    return scan, True


def fail_interrupted_scans(db: Session) -> int:
    """Scans can't survive a process restart; mark them failed so users can retry."""
    result = db.execute(
        update(Scan)
        .where(Scan.status.in_(ACTIVE))
        .values(
            status="failed",
            error_code="interrupted",
            error_message="The scan was interrupted. Start it again.",
            completed_at=utcnow(),
        )
    )
    db.commit()
    return result.rowcount or 0


# ── pipeline ────────────────────────────────────────────────────────────────


class _Run:
    def __init__(self, db: Session, scan: Scan, user: User, settings: Settings, client: XClient):
        self.db, self.scan, self.user, self.s, self.client = db, scan, user, settings, client
        self.posts_read = 0
        self.users_read = 0
        self.unavailable = 0

    def event(self, type_: str, **data: object) -> None:
        # Reassign so SQLAlchemy sees the JSON change.
        self.scan.events = [*self.scan.events, {"type": type_, "at": utcnow().isoformat(), **data}][-60:]

    def phase(self, name: str, event: str) -> None:
        self.scan.phase = name
        self.event(event)
        self.db.commit()

    def account_usage(self, posts: int, users: int, requests: int = 1) -> None:
        self.scan.api_requests += requests
        self.posts_read += posts
        self.users_read += users
        self.scan.api_posts_read = self.posts_read
        self.scan.api_users_read = self.users_read
        self.scan.estimated_cost_usd = (
            Decimal(self.posts_read) * self.s.x_price_post_read + Decimal(self.users_read) * self.s.x_price_user_read
        ).quantize(Decimal("0.0001"))


def _content_hash(post: XPost) -> str:
    return hashlib.sha256(f"{post.text}\x00{'|'.join(post.links)}".encode()).hexdigest()


def _apply_classification(b: Bookmark) -> None:
    c = classify(
        ClassifierInput(
            b.text, list(b.links), is_conversation_root=b.conversation_id == b.x_post_id, is_long_form=b.long_form
        )
    )
    b.primary_category_id = c.topic
    b.topic_confidence = c.confidence
    b.matched_keywords = c.matched
    b.content_type = c.content_type
    b.content_type_certain = c.content_type_certain
    b.thread_hint = c.thread_hint
    b.classification_status = c.status
    b.rules_version = CLASSIFIER_VERSION
    # Update tags in place: replacing the collection would delete and re-insert
    # the same (bookmark_id, category_id) key in one flush.
    wanted = dict(c.secondary)
    for tag in list(b.tags):
        if tag.category_id in wanted:
            tag.confidence = wanted.pop(tag.category_id)
        else:
            b.tags.remove(tag)
    for tid, conf in wanted.items():
        b.tags.append(BookmarkTag(category_id=tid, confidence=conf))


def _upsert_page(run: _Run, posts: list[XPost], users: dict[str, XUser]) -> tuple[int, int]:
    """Returns (new, already_known)."""
    db, user, scan = run.db, run.user, run.scan
    existing = {
        b.x_post_id: b
        for b in db.scalars(
            select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.x_post_id.in_([p.id for p in posts]))
        )
    }
    new = known = 0
    now = utcnow()
    for post in posts:
        author = users.get(post.author_id)
        digest = _content_hash(post)
        b = existing.get(post.id)
        if b is None:
            b = Bookmark(user_id=user.id, x_post_id=post.id, first_seen_at=now)
            db.add(b)
            new += 1
        else:
            known += 1
        b.last_seen_at = now
        b.last_seen_scan_id = scan.id
        if author:
            b.author_handle, b.author_name = author.username, author.name
        b.author_x_id = post.author_id
        b.url = f"https://x.com/{b.author_handle or 'i'}/status/{post.id}"
        b.x_created_at = post.created_at
        b.conversation_id = post.conversation_id
        if b.content_hash != digest or b.rules_version != CLASSIFIER_VERSION:
            b.text, b.links, b.content_hash, b.long_form = post.text, post.links, digest, post.is_long_form
            _apply_classification(b)
            scan.classified += 1
    return new, known


def _finish_with_error(run: _Run, exc: XApiError) -> None:
    scan = run.scan
    run.db.rollback()
    retrieved_any = scan.retrieved > 0
    scan.error_code = exc.code
    scan.error_message = exc.message
    if retrieved_any:
        # Keep what we have, but never call it complete.
        _compute_report(run, coverage="partial", note=f"Scan stopped after {scan.retrieved} bookmarks: {exc.message}")
        scan.status = "partial"
        run.event("scan_partial", code=exc.code)
    else:
        scan.status = "failed"
        run.event("scan_failed", code=exc.code)
    scan.completed_at = utcnow()
    if exc.code == "auth_expired" and run.user.oauth_account:
        run.user.oauth_account.status = "expired"
    run.db.commit()


def _compute_report(run: _Run, *, coverage: str, note: str | None) -> list[str]:
    db, user, scan = run.db, run.user, run.scan
    rows = db.execute(
        select(
            Bookmark.primary_category_id,
            Bookmark.content_type,
            Bookmark.author_handle,
            Bookmark.author_name,
            Bookmark.x_created_at,
        ).where(Bookmark.user_id == user.id)
    ).all()
    items = [StatItem(t, ct, h or "unknown", n or h or "unknown", d) for t, ct, h, n, d in rows]
    stats = compute_stats(items)
    stats["inaccessible"] = run.unavailable
    stats["retrieved"] = stats["accessible"] + run.unavailable
    score = compute_score(stats)
    archetype = derive_archetype(stats, provisional=coverage != "complete")
    scan.coverage, scan.coverage_note = coverage, note

    profile = db.get(ProfileStats, user.id) or ProfileStats(user_id=user.id)
    profile.scan_id, profile.stats, profile.score, profile.archetype = scan.id, stats, score, archetype
    profile.rules_version, profile.computed_at = scan.rules_version, utcnow()
    db.add(profile)
    db.flush()

    # Insert-once achievements. ON CONFLICT makes re-scans and retries no-ops.
    unlocked: list[str] = []
    for a in evaluate_achievements(stats):
        if not a["earned"]:
            continue
        stmt = (
            pg_insert(UserAchievement)
            .values(
                id=uuid.uuid4(),
                user_id=user.id,
                achievement_key=a["id"],
                rules_version=ACHIEVEMENTS_VERSION,
                scan_id=scan.id,
                unlocked_at=utcnow(),
                evidence={"current": a["current"], "target": a["target"]},
            )
            .on_conflict_do_nothing(constraint="uq_achievement_once")
            .returning(UserAchievement.achievement_key)
        )
        if db.scalar(stmt):
            unlocked.append(a["id"])
    return unlocked


def run_scan(
    scan_id: uuid.UUID,
    session_factory: Callable[[], Session],
    settings: Settings,
    client_factory: Callable[[], XClient],
) -> None:
    started = time.monotonic()
    db = session_factory()
    client = client_factory()
    try:
        scan = db.get(Scan, scan_id)
        if scan is None or scan.status != "queued":
            return
        user = db.get(User, scan.user_id)
        assert user is not None
        run = _Run(db, scan, user, settings, client)
        scan.status = "running"
        run.phase("connect", "scan_started")
        log.info("scan started", extra={"scan_id": str(scan.id), "mode": scan.mode})

        cipher = cipher_for(settings)
        try:
            token = valid_access_token(db, user, client, cipher)
            _retrieve(run, token, cipher)
        except XApiError as exc:
            log.warning("scan stopped", extra={"scan_id": str(scan.id), "code": exc.code, "status": exc.status})
            _finish_with_error(run, exc)
            return

        # Reclassify anything stored under an older rules version.
        run.phase("topics", "normalizing")
        stale = db.scalars(
            select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.rules_version != CLASSIFIER_VERSION)
        ).all()
        for b in stale:
            _apply_classification(b)
            scan.classified += 1
        run.phase("classify", "classifying")

        complete = scan.stop_reason in ("end_of_collection", "caught_up")
        if scan.mode == "full" and scan.stop_reason == "end_of_collection":
            # Everything X still returns was seen; anything else was unbookmarked,
            # deleted or made private and must not be kept (X Developer Policy).
            removed = db.execute(
                delete(Bookmark).where(Bookmark.user_id == user.id, Bookmark.last_seen_scan_id != scan.id)
            )
            scan.removed_bookmarks = removed.rowcount or 0
        run.phase("stats", "calculating_stats")

        note = None
        if scan.stop_reason == "scan_limit":
            note = f"Stopped at the scan limit of {scan.requested_limit} bookmarks. Older bookmarks were not analysed."
        elif complete and scan.mode == "full":
            note = "Includes every bookmark X made available to this app (X returns up to your most recent ~800)."
        unlocked = _compute_report(run, coverage="complete" if complete else "partial", note=note)
        run.phase("achievements", "evaluating_achievements")
        for key in unlocked:
            run.event("achievement_unlocked", id=key)

        scan.status = "completed" if complete else "partial"
        scan.completed_at = utcnow()
        user.last_scan_at = scan.completed_at
        run.scan.phase = "report"
        run.event("scan_completed" if complete else "scan_partial", durationMs=int((time.monotonic() - started) * 1000))
        db.commit()
        log.info(
            "scan finished",
            extra={
                "scan_id": str(scan.id),
                "status": scan.status,
                "retrieved": scan.retrieved,
                "requests": scan.api_requests,
                "cost_usd": str(scan.estimated_cost_usd),
            },
        )
    except SQLAlchemyError:
        db.rollback()
        log.exception("scan database error", extra={"scan_id": str(scan_id)})
        _mark_failed(session_factory, scan_id, "database_error", "We couldn't save your scan. Try again shortly.")
    except Exception:
        db.rollback()
        log.exception("scan crashed", extra={"scan_id": str(scan_id)})
        _mark_failed(session_factory, scan_id, "internal_error", "Something went wrong during the scan. Try again.")
    finally:
        db.close()
        client.close()


def _retrieve(run: _Run, token: str, cipher) -> None:
    db, scan, s = run.db, run.scan, run.s
    run.phase("retrieve", "retrieving_page")
    page_size = s.scan_page_size if scan.mode == "full" else s.scan_refresh_page_size
    cursor: str | None = None
    refreshed = False
    seen_authors: set[str] = set()
    for page_no in range(1, MAX_PAGES + 1):
        remaining = scan.requested_limit - scan.retrieved
        if remaining <= 0:
            scan.stop_reason = "scan_limit"
            return
        try:
            page = run.client.get_bookmarks_page(
                token,
                run.user.x_user_id,
                max_results=min(page_size, remaining),
                pagination_token=cursor,
                expand_authors=s.x_expand_authors,
            )
        except XApiError as exc:
            if exc.code == "auth_expired" and not refreshed:
                refreshed = True
                token = valid_access_token(db, run.user, run.client, cipher, force_refresh=True)
                continue
            raise
        new_authors = set(page.users) - seen_authors
        seen_authors |= new_authors
        run.account_usage(len(page.posts), len(new_authors))
        run.unavailable += page.unavailable
        scan.rate_limit_remaining = page.rate_limit_remaining
        new, known = _upsert_page(run, page.posts, page.users)
        scan.retrieved += len(page.posts)
        scan.new_bookmarks += new
        scan.pages = page_no
        run.event("bookmarks_received", page=page_no, count=len(page.posts), total=scan.retrieved, new=new)
        db.commit()

        if scan.mode == "refresh" and known > 0:
            scan.stop_reason = "caught_up"
            return
        if not page.next_token or len(page.posts) == 0:
            scan.stop_reason = "end_of_collection"
            return
        cursor = page.next_token
        run.event("retrieving_page", page=page_no + 1)
    scan.stop_reason = "page_budget"


def _mark_failed(session_factory: Callable[[], Session], scan_id: uuid.UUID, code: str, message: str) -> None:
    db = session_factory()
    try:
        scan = db.get(Scan, scan_id)
        if scan and scan.status in ACTIVE:
            scan.status, scan.error_code, scan.error_message, scan.completed_at = "failed", code, message, utcnow()
            db.commit()
    finally:
        db.close()
