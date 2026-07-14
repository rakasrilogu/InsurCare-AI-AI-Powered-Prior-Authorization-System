"""Initial schema — users, pa_requests, agent_runs

Revision ID: 0001
Revises: 
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id',              sa.Integer(),     primary_key=True),
        sa.Column('email',           sa.String(255),   nullable=False),
        sa.Column('full_name',       sa.String(255),   nullable=False),
        sa.Column('role',            sa.String(50),    nullable=False, server_default='doctor'),
        sa.Column('hospital',        sa.String(255),   nullable=True),
        sa.Column('company_name',    sa.String(255),   nullable=True),
        sa.Column('specialization',  sa.String(255),   nullable=True),
        sa.Column('hashed_password', sa.String(255),   nullable=False),
        sa.Column('created_at',      sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
    )
    op.create_index('ix_users_id',    'users', ['id'],    unique=False)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # ── pa_requests ────────────────────────────────────────────────────────────
    op.create_table(
        'pa_requests',
        sa.Column('id',                    sa.Integer(),   primary_key=True),
        sa.Column('request_code',          sa.String(50),  nullable=False),
        sa.Column('user_id',               sa.Integer(),   sa.ForeignKey('users.id'), nullable=False),
        # Patient
        sa.Column('patient_name',          sa.String(255), nullable=False),
        sa.Column('patient_id',            sa.String(100), nullable=False),
        sa.Column('patient_age',           sa.Integer(),   nullable=False),
        sa.Column('patient_gender',        sa.String(20),  nullable=False),
        # Insurance
        sa.Column('insurance_provider',    sa.String(100), nullable=False),
        sa.Column('policy_number',         sa.String(100), nullable=False),
        sa.Column('plan_name',             sa.String(255), nullable=True),
        sa.Column('sum_insured',           sa.Float(),     nullable=True),
        sa.Column('deductible',            sa.Float(),     nullable=True),
        sa.Column('coverage_pct',          sa.Float(),     nullable=True),
        sa.Column('valid_until',           sa.String(20),  nullable=True),
        # Procedure
        sa.Column('procedure_name',        sa.String(255), nullable=False),
        sa.Column('procedure_code',        sa.String(100), nullable=False),
        sa.Column('diagnosis',             sa.String(255), nullable=True),
        sa.Column('clinical_justification',sa.Text(),      nullable=False),
        sa.Column('documents',             postgresql.JSON(astext_type=sa.Text()), nullable=True),
        # Pipeline results
        sa.Column('status',                sa.String(50),  nullable=False, server_default='pending'),
        sa.Column('decision',              sa.String(50),  nullable=True),
        sa.Column('confidence_score',      sa.Float(),     nullable=True),
        sa.Column('risk_score',            sa.Float(),     nullable=True),
        sa.Column('final_summary',         sa.Text(),      nullable=True),
        # Explainability
        sa.Column('approved_amount_inr',   sa.Float(),     nullable=True),
        sa.Column('coverage_percentage',   sa.Float(),     nullable=True),
        sa.Column('approval_reasons',      postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('denial_reasons',        postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('policy_clauses_cited',  postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('next_steps',            postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('appeal_pathway',        sa.Text(),      nullable=True),
        sa.Column('doctor_recommendation', sa.Text(),      nullable=True),
        sa.Column('plain_english_summary', sa.Text(),      nullable=True),
        sa.Column('created_at',            sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at',            sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
    )
    op.create_index('ix_pa_requests_id',           'pa_requests', ['id'],           unique=False)
    op.create_index('ix_pa_requests_request_code', 'pa_requests', ['request_code'], unique=True)

    # ── agent_runs ─────────────────────────────────────────────────────────────
    op.create_table(
        'agent_runs',
        sa.Column('id',           sa.Integer(),  primary_key=True),
        sa.Column('request_id',   sa.Integer(),
                  sa.ForeignKey('pa_requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('agent_id',     sa.String(50),  nullable=False),
        sa.Column('status',       sa.String(50),  nullable=True, server_default='idle'),
        sa.Column('output',       sa.Text(),       nullable=True),
        sa.Column('details',      postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('confidence',   sa.Float(),      nullable=True),
        sa.Column('duration_ms',  sa.Integer(),    nullable=True),
        sa.Column('started_at',   sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_agent_runs_id', 'agent_runs', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('agent_runs')
    op.drop_table('pa_requests')
    op.drop_table('users')
