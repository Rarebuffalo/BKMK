"""Response and request schemas. camelCase on the wire to match the frontend types.

Request models forbid unknown fields, so clients can't mass-assign anything.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Out(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class ErrorOut(Out):
    code: str
    message: str


class AuthorOut(Out):
    handle: str
    name: str


class BookmarkOut(Out):
    id: str
    x_post_id: str
    author: AuthorOut
    text: str
    created_at: datetime | None
    url: str
    links: list[str]
    thread_length: int | None = None
    accessible: bool = True
    topic: str
    topic_confidence: float
    secondary_topics: list[str]
    content_type: str
    content_type_certain: bool
    matched: list[str]
    first_seen_at: datetime


class BookmarkPageOut(Out):
    items: list[BookmarkOut]
    total: int
    offset: int
    limit: int
    facets: dict[str, Any]


class ConnectionOut(Out):
    status: str
    scopes: list[str]
    expires_at: datetime | None


class UserOut(Out):
    handle: str
    display_name: str | None
    profile_image_url: str | None
    last_scan_at: datetime | None


class MeOut(Out):
    authenticated: bool
    x_configured: bool
    live_sync_enabled: bool
    api_mode: Literal["live", "fixture"]
    # Days of inactivity after which stored data is deleted (0 = kept until deleted).
    data_retention_days: int
    # How many of the newest bookmarks a first scan reads (the starter scan).
    scan_limit: int
    user: UserOut | None = None
    connection: ConnectionOut | None = None
    csrf_token: str | None = None


class ScanEventOut(Out):
    type: str
    at: str
    data: dict[str, Any] = Field(default_factory=dict)


class ScanOut(Out):
    id: str
    status: str
    mode: str
    phase: str
    requested_limit: int
    retrieved: int
    new_bookmarks: int
    removed_bookmarks: int
    classified: int
    pages: int
    events: list[dict[str, Any]]
    coverage: str | None
    coverage_note: str | None
    stop_reason: str | None
    error_code: str | None
    error_message: str | None
    api_requests: int
    estimated_cost_usd: float
    started_at: datetime
    completed_at: datetime | None


class ScanCreateIn(In):
    mode: Literal["full", "refresh"] | None = None


class AchievementOut(Out):
    id: str
    earned: bool
    current: int
    target: int
    unlocked_at: datetime | None = None
    rules_version: str | None = None


class ReportOut(Out):
    """Mirrors the frontend's ScanResult, minus the full bookmark list."""

    handle: str
    display_name: str
    is_demo: bool = False
    scanned_at: datetime
    coverage: str
    coverage_note: str | None
    stats: dict[str, Any]
    archetype: dict[str, Any]
    score: dict[str, Any]
    achievements: list[AchievementOut]
    achievements_version: str
    recent: list[BookmarkOut]
    scan: ScanOut | None


class TopicOut(Out):
    id: str
    label: str
    description: str
    count: int
    share: float
    authors: int
    types: dict[str, int]
