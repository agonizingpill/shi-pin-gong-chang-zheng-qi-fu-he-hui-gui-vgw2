import json
import logging
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from .config import ARTIFACT_DIR, QUEUE, Session, redis, utc_now
from .constants import PlanState
from .models import LoadPlan
from .shift_work import audit
from .steam_model import estimate, fingerprint

log = logging.getLogger('steam.worker')


def claim():
    with Session.begin() as db:
        plan = db.scalar(select(LoadPlan).where(
            (LoadPlan.state == PlanState.QUEUED) |
            ((LoadPlan.state == PlanState.RUNNING) & (LoadPlan.lease_until < utc_now())),
        ).order_by(LoadPlan.id).limit(1).with_for_update(skip_locked=True))
        if plan is None:
            return None
        plan.state, plan.claim_token = PlanState.RUNNING, uuid4().hex
        plan.lease_until = utc_now() + timedelta(seconds=90)
        plan.attempts += 1
        return plan


def write_evidence(name, data):
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ARTIFACT_DIR / f'.{name}.tmp'
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(ARTIFACT_DIR / name)


def execute(claimed):
    result, error = None, None
    try:
        if fingerprint(claimed.input_snapshot) != claimed.input_sha256:
            raise ValueError('输入快照校验失败，请建立新修订')
        result = estimate(claimed.input_snapshot)
        result['input_sha256'] = claimed.input_sha256
    except Exception as exc:
        log.exception('plan %s estimation failed', claimed.id)
        error = (str(exc) or type(exc).__name__)[:240]
    with Session.begin() as db:
        plan = db.get(LoadPlan, claimed.id, with_for_update=True)
        if plan.claim_token != claimed.claim_token or plan.state != PlanState.RUNNING:
            return
        if error is None:
            name = f'plan-{plan.id}-{plan.claim_token}.json'
            write_evidence(name, result)
            plan.result, plan.evidence_file, plan.state = result, name, PlanState.ESTIMATED
            audit(db, 'worker', 'plan.estimated', plan.id, fingerprint=plan.input_sha256,
                  spike_count=len(result['spikes']))
        else:
            plan.error, plan.state = error, PlanState.FAILED
            audit(db, 'worker', 'plan.failed', plan.id, reason=error)
        plan.lease_until, plan.claim_token = None, None


def main():
    logging.basicConfig(level=logging.INFO)
    heartbeat = Path('/tmp/steam-worker')
    while True:
        try:
            plan = claim()
            if plan:
                execute(plan)
            heartbeat.touch()
        except (SQLAlchemyError, OSError):
            log.exception('worker persistence failed')
        try:
            redis.blpop(QUEUE, timeout=1)
        except RedisError:
            from time import sleep
            sleep(1)


if __name__ == '__main__':
    main()
