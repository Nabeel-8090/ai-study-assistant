"""email verification, terms, otp codes

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03 12:42:18.757190

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('otp_codes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('purpose', sa.String(length=20), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("purpose IN ('verify_email', 'reset_password')", name=op.f('ck_otp_codes_purpose_valid')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_otp_codes_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_otp_codes'))
    )
    op.create_index('ix_otp_codes_user_id_purpose', 'otp_codes', ['user_id', 'purpose'], unique=False)
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('terms_version', sa.String(length=20), nullable=True))
    # Accounts created before this version had no verification step. Treat them as verified
    # so existing users are not locked out. New signups must enter the emailed code.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'terms_version')
    op.drop_column('users', 'terms_accepted_at')
    op.drop_column('users', 'email_verified_at')
    op.drop_index('ix_otp_codes_user_id_purpose', table_name='otp_codes')
    op.drop_table('otp_codes')
