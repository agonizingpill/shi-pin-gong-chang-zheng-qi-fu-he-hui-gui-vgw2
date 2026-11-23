from redis.exceptions import RedisError
from sqlalchemy import select

from .auth import DomainError
from .config import QUEUE, redis, utc_now
from .constants import PlanState, ReviewState, ShiftState
from .models import EnergyReview, LoadPlan, ProductionShift, ReviewSpike
from .shift_work import audit, capture_rows, get_shift
from .steam_model import fingerprint


def queue_hint(plan_id):
    try:
        redis.rpush(QUEUE, str(plan_id))
    except RedisError:
        # Worker also polls committed SQL rows when delivery is unavailable.
        return


def request_plan(db, shift_id, title, user):
    shift = get_shift(db, shift_id, lock=True)
    target = capture_rows(db, shift)
    if shift.state != ShiftState.SEALED:
        raise DomainError('handover_required', '请先完成班次封账，再建立负荷方案')
    latest = db.scalar(select(LoadPlan).where(LoadPlan.shift_id == shift.id).order_by(LoadPlan.revision.desc()).limit(1))
    if latest and latest.state != PlanState.FAILED:
        raise DomainError('plan_exists', '这个班次已有进行中或已获批的负荷方案', plan_id=latest.id)
    windows = list(db.scalars(select(ProductionShift).where(
        ProductionShift.line == shift.line, ProductionShift.state == ShiftState.SEALED,
        ProductionShift.ends_at <= shift.starts_at,
    ).order_by(ProductionShift.starts_at.desc()).limit(12)))
    historical_windows = [capture_rows(db, item) for item in reversed(windows)]
    if len(historical_windows) < 2 or sum(map(len, historical_windows[:-1])) < 12:
        raise DomainError('insufficient_history', '同线历史不足：至少需要两个封账班次，并留出最近一班评估')
    if len(historical_windows[-1]) < 2:
        raise DomainError('holdout_too_short', '最近封账班次不足两小时，无法用作留出评估')
    snapshot = {'line': shift.line, 'target': target, 'history': [row for window in historical_windows for row in window]}
    plan = LoadPlan(shift_id=shift.id, title=title, revision=latest.revision + 1 if latest else 1,
                    requested_by=user.id, input_snapshot=snapshot, input_sha256=fingerprint(snapshot))
    db.add(plan)
    db.flush()
    audit(db, user.username, 'plan.queued', plan.id, shift=shift.code, fingerprint=plan.input_sha256)
    return plan


def get_plan(db, plan_id, lock=False):
    query = select(LoadPlan).where(LoadPlan.id == plan_id)
    if lock:
        query = query.with_for_update()
    plan = db.scalar(query)
    if plan is None:
        raise DomainError('plan_not_found', '找不到负荷方案', 404)
    return plan


def approve_plan(db, plan, user):
    if plan.state != PlanState.ESTIMATED:
        raise DomainError('plan_not_estimated', '只有完成估计的方案可以审批')
    plan.state, plan.approved_by, plan.approved_at = PlanState.APPROVED, user.id, utc_now()
    review = EnergyReview(plan_id=plan.id)
    db.add(review)
    db.flush()
    for flag in plan.result['spikes']:
        db.add(ReviewSpike(review_id=review.id, sample_scope=flag['scope'],
                           **{key: flag[key] for key in ('start_read_id', 'end_read_id', 'observed_kg', 'baseline_kg')}))
    audit(db, user.username, 'plan.approved', plan.id, review_id=review.id, spike_count=len(plan.result['spikes']))
    return review


def get_review(db, review_id, lock=False):
    query = select(EnergyReview).where(EnergyReview.id == review_id)
    if lock:
        query = query.with_for_update()
    review = db.scalar(query)
    if review is None:
        raise DomainError('review_not_found', '找不到节能复核单', 404)
    return review


def get_spikes(db, review_id):
    return list(db.scalars(select(ReviewSpike).where(ReviewSpike.review_id == review_id).order_by(ReviewSpike.id)))


def require_pending(review):
    if review.state != ReviewState.PENDING:
        raise DomainError('review_closed', '复核单已结案')


def verify_spike(db, review, spike_id, data, user):
    require_pending(review)
    spike = db.get(ReviewSpike, spike_id)
    if spike is None or spike.review_id != review.id:
        raise DomainError('spike_not_found', '找不到该复核单上的尖峰', 404)
    previous = {'finding': spike.finding, 'note': spike.findings_note}
    spike.finding = data.finding
    spike.findings_note = data.note
    spike.verified_by, spike.verified_at = user.id, utc_now()
    audit(db, user.username, 'review.spike_verified', review.id, spike_id=spike_id,
          finding=data.finding, reason=data.note, previous=previous)
    return spike


def close_review(db, review, data, user):
    require_pending(review)
    pending = [spike.id for spike in get_spikes(db, review.id) if spike.finding is None]
    if pending:
        raise DomainError('spikes_unverified', '先核验所有尖峰记录，才能关闭节能复核单', spike_ids=pending)
    review.state, review.closed_at, review.closed_by = ReviewState.CLOSED, utc_now(), user.id
    review.conclusion, review.follow_up = data.conclusion, data.follow_up
    audit(db, user.username, 'review.closed', review.id, conclusion=data.conclusion, follow_up=data.follow_up)
    return review
