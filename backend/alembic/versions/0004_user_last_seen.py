"""user last_seen_at for the retention policy

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-29 03:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))
    # Existing accounts start their retention clock from their last known activity.
    op.execute("UPDATE users SET last_seen_at = COALESCE(last_scan_at, updated_at, created_at)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_seen_at')
