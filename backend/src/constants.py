from enum import StrEnum


class Role(StrEnum):
    OPERATOR = 'operator'
    SUPERVISOR = 'supervisor'
    VIEWER = 'viewer'


class ShiftState(StrEnum):
    OPEN = 'open'
    SEALED = 'sealed'


class PlanState(StrEnum):
    QUEUED = 'queued'
    RUNNING = 'running'
    FAILED = 'failed'
    ESTIMATED = 'estimated'
    APPROVED = 'approved'


class ReviewState(StrEnum):
    PENDING = 'pending'
    CLOSED = 'closed'


class SpikeFinding(StrEnum):
    PROCESS_SURGE = 'process_surge'
    INSTRUMENT_SUSPECT = 'instrument_suspect'


class Equipment(StrEnum):
    RETORT = 'RET-01'
    CIP = 'CIP-02'
    BLANCHER = 'BLN-03'


class Line(StrEnum):
    RETORT = 'LINE-A'
    READY_MEALS = 'LINE-B'
