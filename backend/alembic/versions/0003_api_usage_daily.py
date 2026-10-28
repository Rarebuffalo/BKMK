"""daily X API usage ledger

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-29 03:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'api_usage_daily',
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('requests', sa.Integer(), nullable=False),
        sa.Column('posts_read', sa.Integer(), nullable=False),
        sa.Column('users_read', sa.Integer(), nullable=False),
        sa.Column('estimated_cost_usd', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.PrimaryKeyConstraint('day'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('api_usage_daily')
