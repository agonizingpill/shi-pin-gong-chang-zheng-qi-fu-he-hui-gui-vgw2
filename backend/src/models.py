from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import utc_now
from .constants import Equipment, Line, PlanState, ReviewState, Role, ShiftState, SpikeFinding


class Base(DeclarativeBase):
    pass


def choices(field, values):
    allowed = ', '.join(f"'{item.value}'" for item in values)
    return CheckConstraint(f'{field} IN ({allowed})')


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (choices('role', Role),)
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    display_name: Mapped[str] = mapped_column(String(48))
    role: Mapped[str] = mapped_column(String(18))
    password_hash: Mapped[str] = mapped_column(String(200))


class ProductionShift(Base):
    __tablename__ = 'production_shifts'
    __table_args__ = (
        UniqueConstraint('line', 'starts_at'), CheckConstraint('ends_at > starts_at'),
        CheckConstraint('ambient_c BETWEEN -10 AND 55'), choices('line', Line), choices('state', ShiftState),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    line: Mapped[str] = mapped_column(String(12))
    batch_code: Mapped[str] = mapped_column(String(40))
    product: Mapped[str] = mapped_column(String(60))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    ambient_c: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    state: Mapped[str] = mapped_column(String(12), default=ShiftState.OPEN)
    opened_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    sealed_at: Mapped[datetime | None]


class SteamMeter(Base):
    __tablename__ = 'steam_meter_reads'
    __table_args__ = (
        UniqueConstraint('shift_id', 'reading_at'), CheckConstraint('cumulative_kg >= 0'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey('production_shifts.id'))
    reading_at: Mapped[datetime]
    cumulative_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    source_ref: Mapped[str] = mapped_column(String(100))
    recorded_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    recorded_at: Mapped[datetime] = mapped_column(default=utc_now)


class EquipmentRun(Base):
    __tablename__ = 'equipment_runs'
    __table_args__ = (
        Index('ix_runs_shift_asset_start', 'shift_id', 'asset', 'starts_at'),
        CheckConstraint('ends_at > starts_at'), choices('asset', Equipment),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey('production_shifts.id'))
    asset: Mapped[str] = mapped_column(String(12))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    logged_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class LoadPlan(Base):
    __tablename__ = 'load_plans'
    __table_args__ = (
        UniqueConstraint('shift_id', 'revision'), choices('state', PlanState),
        Index('ix_plan_job_poll', 'state', 'lease_until'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey('production_shifts.id'))
    revision: Mapped[int]
    state: Mapped[str] = mapped_column(String(12), default=PlanState.QUEUED)
    title: Mapped[str] = mapped_column(String(80))
    requested_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    requested_at: Mapped[datetime] = mapped_column(default=utc_now)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'))
    approved_at: Mapped[datetime | None]
    input_sha256: Mapped[str] = mapped_column(String(64))
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence_file: Mapped[str | None] = mapped_column(String(100))
    error: Mapped[str | None] = mapped_column(String(240))
    lease_until: Mapped[datetime | None]
    claim_token: Mapped[str | None] = mapped_column(String(32))
    attempts: Mapped[int] = mapped_column(default=0)


class EnergyReview(Base):
    __tablename__ = 'energy_reviews'
    __table_args__ = (choices('state', ReviewState),)
    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey('load_plans.id'), unique=True)
    state: Mapped[str] = mapped_column(String(12), default=ReviewState.PENDING)
    opened_at: Mapped[datetime] = mapped_column(default=utc_now)
    closed_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'))
    closed_at: Mapped[datetime | None]
    conclusion: Mapped[str | None] = mapped_column(Text)
    follow_up: Mapped[str | None] = mapped_column(Text)


class ReviewSpike(Base):
    __tablename__ = 'review_spikes'
    __table_args__ = (
        UniqueConstraint('review_id', 'end_read_id'), choices('finding', SpikeFinding),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey('energy_reviews.id'))
    start_read_id: Mapped[int] = mapped_column(ForeignKey('steam_meter_reads.id'))
    end_read_id: Mapped[int] = mapped_column(ForeignKey('steam_meter_reads.id'))
    observed_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    baseline_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    sample_scope: Mapped[str] = mapped_column(String(12))
    finding: Mapped[str | None] = mapped_column(String(24))
    findings_note: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'))
    verified_at: Mapped[datetime | None]


class AuditEntry(Base):
    __tablename__ = 'audit_entries'
    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(80))
    object_ref: Mapped[str] = mapped_column(String(128))
    details: Mapped[dict] = mapped_column(JSON)
    at: Mapped[datetime] = mapped_column(default=utc_now)
