"""Add can_submit to users, migrate admin/doctor → hospital roles

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-14

"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('can_submit', sa.Boolean(),
                  server_default=sa.text('true'), nullable=False))

    op.execute("UPDATE users SET role='hospital', can_submit=1 WHERE role='admin'")
    op.execute("UPDATE users SET role='hospital', can_submit=0 WHERE role='doctor'")


def downgrade() -> None:
    op.execute("UPDATE users SET role='doctor' WHERE role='hospital'")
    op.drop_column('users', 'can_submit')
