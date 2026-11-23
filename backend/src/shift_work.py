from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from .auth import DomainError
from .config import utc_now
from .constants import Equipment, ShiftState
from .models import AuditEntry, EquipmentRun, ProductionShift, SteamMeter

HOUR = timedelta(hours=1)


def audit(db, actor, action, ref, **details):
    db.add(AuditEntry(actor=actor, action=action, object_ref=str(ref), details=details))


def get_shift(db, shift_id, lock=False):
    query = select(ProductionShift).where(ProductionShift.id == shift_id)
    if lock:
        query = query.with_for_update()
    shift = db.scalar(query)
    if not shift:
        raise DomainError('shift_not_found', '找不到班次', 404)
    return shift


def get_readings(db, shift_id):
    return list(db.scalars(select(SteamMeter).where(SteamMeter.shift_id == shift_id).order_by(SteamMeter.reading_at)))


def get_runs(db, shift_id):
    return list(db.scalars(select(EquipmentRun).where(EquipmentRun.shift_id == shift_id)
                           .order_by(EquipmentRun.asset, EquipmentRun.starts_at, EquipmentRun.id)))


def boundaries(shift):
    count = (shift.ends_at - shift.starts_at) // HOUR
    return [shift.starts_at + index * HOUR for index in range(count + 1)]


def create_shift(db, data, user):
    duration = data.ends_at - data.starts_at
    if not HOUR <= duration <= 12 * HOUR or duration % HOUR:
        raise DomainError('invalid_shift_window', '班次须为 1 至 12 个整小时')
    duplicate = db.scalar(select(ProductionShift.id).where(
        (ProductionShift.code == data.code) |
        ((ProductionShift.line == data.line) & (ProductionShift.starts_at < data.ends_at) &
         (ProductionShift.ends_at > data.starts_at))))
    if duplicate:
        raise DomainError('shift_slot_taken', '班次编号已使用，或该产线已有交叠班次')
    shift = ProductionShift(**data.model_dump(), opened_by=user.id)
    db.add(shift)
    db.flush()
    audit(db, user.username, 'shift.opened', shift.code, line=shift.line, batch=shift.batch_code)
    return shift


def require_open(shift):
    if shift.state != ShiftState.OPEN:
        raise DomainError('shift_sealed', '班次已交接封账，现场记录已冻结')


def add_reading(db, shift, data, user):
    require_open(shift)
    if data.reading_at not in boundaries(shift):
        raise DomainError('reading_outside_slots', '抄表时间须为班初至班末的小时边界')
    readings = get_readings(db, shift.id)
    for previous in readings:
        if previous.reading_at == data.reading_at:
            raise DomainError('reading_exists', '该时点已有原始读数')
        if ((previous.reading_at < data.reading_at and previous.cumulative_kg > data.cumulative_kg) or
                (previous.reading_at > data.reading_at and previous.cumulative_kg < data.cumulative_kg)):
            raise DomainError('meter_reversed', '累计读数与相邻读数倒挂，请核对现场表盘')
    row = SteamMeter(shift_id=shift.id, **data.model_dump(), recorded_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user.username, 'meter.recorded', shift.code, reading_id=row.id, source=row.source_ref)
    return row


def validate_window(shift, data, runs, ignore_id=None):
    if not shift.starts_at <= data.starts_at < data.ends_at <= shift.ends_at:
        raise DomainError('equipment_outside_shift', '启停时间必须在班次内，且停机晚于开机')
    for other in runs:
        if (other.id != ignore_id and other.asset == data.asset and
                data.starts_at < other.ends_at and data.ends_at > other.starts_at):
            raise DomainError('equipment_overlap', f'{data.asset} 与已有启停区间重叠',
                              run_id=other.id, asset=data.asset,
                              starts_at=other.starts_at.isoformat(), ends_at=other.ends_at.isoformat())


def save_run(db, shift, data, user, run_id=None):
    require_open(shift)
    rows = get_runs(db, shift.id)
    existing = next((row for row in rows if row.id == run_id), None)
    if run_id is not None and existing is None:
        raise DomainError('run_not_found', '找不到该条启停记录', 404)
    validate_window(shift, data, rows, run_id)
    values = data.model_dump(exclude={'reason'})
    if existing:
        before = [existing.asset, existing.starts_at.isoformat(), existing.ends_at.isoformat()]
        for key, value in values.items():
            setattr(existing, key, value)
        audit(db, user.username, 'equipment.corrected', shift.code, run_id=existing.id,
              reason=data.reason, before=before,
              after=[data.asset, data.starts_at.isoformat(), data.ends_at.isoformat()])
        return existing
    row = EquipmentRun(shift_id=shift.id, **values, logged_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user.username, 'equipment.recorded', shift.code, run_id=row.id, asset=row.asset)
    return row


def capture_rows(db, shift):
    reads = {row.reading_at: row for row in get_readings(db, shift.id)}
    times = boundaries(shift)
    missing = [slot.isoformat(timespec='minutes') for slot in times if slot not in reads]
    if missing:
        raise DomainError('missing_meter', f'{shift.code} 缺少 {len(missing)} 个时点的蒸汽读数', missing=missing)
    runs = get_runs(db, shift.id)
    if not runs:
        raise DomainError('missing_equipment', f'{shift.code} 尚未录入任何启停区间')
    checked = []
    for row in runs:
        validate_window(shift, row, checked)
        checked.append(row)
    rows = []
    for index, (start, end) in enumerate(zip(times, times[1:])):
        left, right = reads[start], reads[end]
        delta = right.cumulative_kg - left.cumulative_kg
        if delta < Decimal(0):
            raise DomainError('meter_reversed', f'{shift.code} 小时差分为负', reading_id=right.id)
        runtime = {asset: 0.0 for asset in Equipment}
        for run in runs:
            overlap = min(end, run.ends_at) - max(start, run.starts_at)
            runtime[run.asset] += max(0, overlap.total_seconds() / 60)
        starts = sum(start <= item.starts_at < end for item in runs)
        rows.append({'shift': shift.code, 'start': start.isoformat(timespec='minutes'),
                     'start_read_id': left.id, 'end_read_id': right.id, 'kg': float(delta),
                     'features': [runtime[Equipment.RETORT], runtime[Equipment.CIP],
                                  runtime[Equipment.BLANCHER], starts, float(shift.ambient_c), index]})
    return rows


def seal_shift(db, shift, user):
    require_open(shift)
    capture_rows(db, shift)
    shift.state = ShiftState.SEALED
    shift.sealed_at = utc_now()
    audit(db, user.username, 'shift.sealed', shift.code)
    return shift
