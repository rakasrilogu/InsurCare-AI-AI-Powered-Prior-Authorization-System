"""Add payment & dispute columns to pa_requests

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-14

"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pa_requests', sa.Column('payment_status',
                  sa.String(30), nullable=False,
                  server_default='not_applicable'))
    op.add_column('pa_requests', sa.Column('transaction_id',
                  sa.String(50), nullable=True))
    op.add_column('pa_requests', sa.Column('disbursed_amount_inr',
                  sa.Float(), nullable=True))
    op.add_column('pa_requests', sa.Column('paid_at',
                  sa.DateTime(timezone=True), nullable=True))
    op.add_column('pa_requests', sa.Column('disputed',
                  sa.Boolean(), nullable=False,
                  server_default=sa.text('false')))
    op.add_column('pa_requests', sa.Column('dispute_reason',
                  sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pa_requests', 'dispute_reason')
    op.drop_column('pa_requests', 'disputed')
    op.drop_column('pa_requests', 'paid_at')
    op.drop_column('pa_requests', 'disbursed_amount_inr')
    op.drop_column('pa_requests', 'transaction_id')
    op.drop_column('pa_requests', 'payment_status')
