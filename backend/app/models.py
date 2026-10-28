"""Persistence model. Every user-owned row carries user_id and is deleted with the user."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Stable identity. Handles change; this does not.
    x_user_id: Mapped[str] = mapped_column(String(32), unique=True)
    handle: Mapped[str] = mapped_column(String(32))
    display_name: Mapped[str | None] = mapped_column(String(100))
    profile_image_url: Mapped[str | None] = mapped_column(String(500))
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    oauth_account: Mapped["OAuthAccount | None"] = relationship(back_populates="user", cascade="all, delete-orphan")


class OAuthAccount(TimestampMixin, Base):
    __tablename__ = "oauth_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(16), default="x")
    # AES-256-GCM ciphertexts (nonce || ciphertext || tag). Never returned by the API.
    access_token_enc: Mapped[bytes] = mapped_column(LargeBinary)
    refresh_token_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scopes: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | expired | revoked

    user: Mapped[User] = relationship(back_populates="oauth_account")


class AppSession(Base):
    __tablename__ = "sessions"

    # HMAC-SHA256 of the cookie value; the raw session id is never stored.
    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class OAuthState(Base):
    """Pending authorization. Single use, expires in minutes."""

    __tablename__ = "oauth_states"

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    code_verifier_enc: Mapped[bytes] = mapped_column(LargeBinary)
    requested_handle: Mapped[str | None] = mapped_column(String(32))
    return_to: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(255))
    family: Mapped[str] = mapped_column(String(16))
    rules_version: Mapped[str] = mapped_column(String(32))


class Scan(Base):
    __tablename__ = "scans"
    __table_args__ = (Index("ix_scans_user_started", "user_id", "started_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|completed|partial|failed
    mode: Mapped[str] = mapped_column(String(16), default="full")  # full | refresh
    phase: Mapped[str] = mapped_column(String(32), default="connect")
    requested_limit: Mapped[int] = mapped_column(Integer)
    retrieved: Mapped[int] = mapped_column(Integer, default=0)
    new_bookmarks: Mapped[int] = mapped_column(Integer, default=0)
    removed_bookmarks: Mapped[int] = mapped_column(Integer, default=0)
    classified: Mapped[int] = mapped_column(Integer, default=0)
    pages: Mapped[int] = mapped_column(Integer, default=0)
    # Ordered progress events: [{"type": ..., "at": iso, ...}]. Small and bounded.
    events: Mapped[list] = mapped_column(JSON, default=list)
    coverage: Mapped[str | None] = mapped_column(String(16))  # complete | partial
    stop_reason: Mapped[str | None] = mapped_column(String(32))
    coverage_note: Mapped[str | None] = mapped_column(String(300))
    error_code: Mapped[str | None] = mapped_column(String(32))
    error_message: Mapped[str | None] = mapped_column(String(300))
    api_requests: Mapped[int] = mapped_column(Integer, default=0)
    api_posts_read: Mapped[int] = mapped_column(Integer, default=0)
    api_users_read: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    rate_limit_remaining: Mapped[int | None] = mapped_column(Integer)
    rules_version: Mapped[str] = mapped_column(String(128))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "x_post_id", name="uq_bookmarks_user_post"),
        Index("ix_bookmarks_user_created", "user_id", "x_created_at"),
        Index("ix_bookmarks_user_topic", "user_id", "primary_category_id"),
        Index("ix_bookmarks_user_type", "user_id", "content_type"),
        Index("ix_bookmarks_user_author", "user_id", "author_handle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    x_post_id: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    author_x_id: Mapped[str] = mapped_column(String(32))
    author_handle: Mapped[str | None] = mapped_column(String(32))
    author_name: Mapped[str | None] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(300))
    links: Mapped[list] = mapped_column(JSON, default=list)
    x_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    conversation_id: Mapped[str | None] = mapped_column(String(32))
    thread_hint: Mapped[bool] = mapped_column(Boolean, default=False)
    # X note_tweet: a long-form post. Kept so reclassification doesn't need X again.
    long_form: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))
    # Classification (rules-based, versioned)
    primary_category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"), default="other")
    topic_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    content_type: Mapped[str] = mapped_column(String(16), default="post")
    content_type_certain: Mapped[bool] = mapped_column(Boolean, default=True)
    matched_keywords: Mapped[list] = mapped_column(JSON, default=list)
    classification_status: Mapped[str] = mapped_column(String(16), default="unclassified")
    rules_version: Mapped[str | None] = mapped_column(String(32))
    content_hash: Mapped[str] = mapped_column(String(64))

    tags: Mapped[list["BookmarkTag"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class BookmarkTag(Base):
    """Secondary categories for a bookmark (primary lives on the bookmark row)."""

    __tablename__ = "bookmark_tags"

    bookmark_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookmarks.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"), primary_key=True)
    confidence: Mapped[float] = mapped_column(Float)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_key", "rules_version", name="uq_achievement_once"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    achievement_key: Mapped[str] = mapped_column(String(48))
    rules_version: Mapped[str] = mapped_column(String(48))
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)


class ProfileStats(Base):
    """Cached derived report for the dashboard. Recomputed after each scan."""

    __tablename__ = "profile_stats"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))
    stats: Mapped[dict] = mapped_column(JSON)
    score: Mapped[dict] = mapped_column(JSON)
    archetype: Mapped[dict] = mapped_column(JSON)
    rules_version: Mapped[str] = mapped_column(String(128))
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ApiUsageDaily(Base):
    """X API spend per UTC day, across all users. Not tied to accounts, so deleting
    an account and reconnecting can't reset it. Holds counts only, no user data."""

    __tablename__ = "api_usage_daily"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    requests: Mapped[int] = mapped_column(Integer, default=0)
    posts_read: Mapped[int] = mapped_column(Integer, default=0)
    users_read: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
