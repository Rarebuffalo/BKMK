"""Global daily cap on X API spend.

X bills per resource read, and anyone with an X account can sign in, so the
per-user cooldown alone doesn't bound cost. Usage is recorded per UTC day in a
ledger that outlives account deletion; scans check it before every page.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import ApiUsageDaily


def today() -> date:
    return datetime.now(UTC).date()


def seconds_until_reset() -> int:
    now = datetime.now(UTC)
    midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), UTC)
    return int((midnight - now).total_seconds()) + 1


def spent_today(db: Session) -> Decimal:
    return db.scalar(select(ApiUsageDaily.estimated_cost_usd).where(ApiUsageDaily.day == today())) or Decimal("0")


def worst_case_page_cost(settings: Settings, posts: int) -> Decimal:
    # With author expansion, a page of n posts can also bring up to n distinct authors.
    per_post = settings.x_price_post_read + (settings.x_price_user_read if settings.x_expand_authors else 0)
    return Decimal(posts) * per_post


def can_afford(db: Session, settings: Settings, posts: int) -> bool:
    return can_afford_cost(db, settings, worst_case_page_cost(settings, posts))


def can_afford_cost(db: Session, settings: Settings, cost: Decimal) -> bool:
    return spent_today(db) + cost <= settings.x_daily_budget_usd


def record_usage(db: Session, settings: Settings, *, requests: int, posts: int, users: int) -> None:
    cost = Decimal(posts) * settings.x_price_post_read + Decimal(users) * settings.x_price_user_read
    stmt = insert(ApiUsageDaily).values(
        day=today(), requests=requests, posts_read=posts, users_read=users, estimated_cost_usd=cost
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=[ApiUsageDaily.day],
            set_={
                "requests": ApiUsageDaily.requests + stmt.excluded.requests,
                "posts_read": ApiUsageDaily.posts_read + stmt.excluded.posts_read,
                "users_read": ApiUsageDaily.users_read + stmt.excluded.users_read,
                "estimated_cost_usd": ApiUsageDaily.estimated_cost_usd + stmt.excluded.estimated_cost_usd,
            },
        )
    )
