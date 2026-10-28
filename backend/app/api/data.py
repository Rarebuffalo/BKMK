"""Dashboard, topics, bookmarks, achievements, export and account deletion."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..integrations import make_x_client
from ..models import Bookmark, ProfileStats
from ..rules.topics import TOPIC_IDS
from ..schemas import AchievementOut, BookmarkOut, BookmarkPageOut, ReportOut, TopicOut
from ..services.library import (
    achievements_for,
    bookmark_out,
    build_report,
    delete_account,
    export_payload,
    parse_csv,
    query_bookmarks,
    topic_summaries,
)
from ..sessions import CurrentSession, clear_session_cookie, require_csrf, require_session

router = APIRouter(prefix="/api", tags=["data"])

NO_SCAN = {"code": "no_scan", "message": "No scan yet. Run your first scan to see your Bookmark DNA."}


@router.get("/dashboard", response_model=ReportOut)
def dashboard(current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)) -> ReportOut:
    report = build_report(db, current.user)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NO_SCAN)
    return report


@router.get("/topics", response_model=list[TopicOut])
def topics(current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)) -> list[dict]:
    return topic_summaries(db, current.user)


def _page(db: Session, current: CurrentSession, topic_list: list[str], **kw) -> BookmarkPageOut:
    items, total, facets = query_bookmarks(db, current.user, topics=topic_list, **kw)
    return BookmarkPageOut(
        items=[bookmark_out(b) for b in items], total=total, offset=kw["offset"], limit=kw["limit"], facets=facets
    )


@router.get("/bookmarks", response_model=BookmarkPageOut)
def bookmarks(
    q: str = Query(default="", max_length=200),
    topic: str | None = Query(default=None, max_length=200),
    type_: str | None = Query(default=None, alias="type", max_length=200),
    author: str = Query(default="", max_length=32),
    date: str = Query(default="any", pattern="^(any|30d|6m|1y|older)$"),
    sort: str = Query(default="newest", pattern="^(newest|oldest|author|longest)$"),
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=30, ge=1, le=100),
    current: CurrentSession = Depends(require_session),
    db: Session = Depends(get_db),
) -> BookmarkPageOut:
    return _page(
        db,
        current,
        parse_csv(topic),
        q=q,
        types=parse_csv(type_),
        author=author,
        date=date,
        sort=sort,
        offset=offset,
        limit=limit,
    )  # type: ignore[arg-type]


@router.get("/topics/{topic_id}/bookmarks", response_model=BookmarkPageOut)
def topic_bookmarks(
    topic_id: str,
    q: str = Query(default="", max_length=200),
    offset: int = Query(default=0, ge=0, le=100_000),
    limit: int = Query(default=30, ge=1, le=100),
    current: CurrentSession = Depends(require_session),
    db: Session = Depends(get_db),
) -> BookmarkPageOut:
    if topic_id not in TOPIC_IDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Unknown topic."})
    return _page(db, current, [topic_id], q=q, offset=offset, limit=limit)


@router.get("/bookmarks/{bookmark_id}", response_model=BookmarkOut)
def bookmark(
    bookmark_id: uuid.UUID, current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)
) -> BookmarkOut:
    b = db.scalar(select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == current.user.id))
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Bookmark not found."})
    return bookmark_out(b)


@router.get("/achievements", response_model=list[AchievementOut])
def achievements(
    current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)
) -> list[AchievementOut]:
    profile = db.get(ProfileStats, current.user.id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NO_SCAN)
    return achievements_for(db, current.user, profile.stats)


@router.get("/export")
def export(current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)) -> Response:
    payload = export_payload(db, current.user)
    return Response(
        json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="bkmk-export-{current.user.handle}.json"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("/account")
def account_delete(
    response: Response,
    current: CurrentSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    client = make_x_client(settings)
    try:
        revoked = delete_account(db, current.user, settings, client)
    finally:
        client.close()
    clear_session_cookie(response, settings)
    return {"deleted": True, "revoked": revoked}
