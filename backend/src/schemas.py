from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from .constants import Equipment, Line, SpikeFinding


def local_time(value: datetime) -> datetime:
    if value.tzinfo or value.second or value.microsecond or not 2000 <= value.year <= 2100:
        raise ValueError('请使用厂区本地时间（北京时间），精确到分钟')
    return value


LocalTime = Annotated[datetime, AfterValidator(local_time)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=500)]


class Form(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')


class Login(Form):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class OpenShift(Form):
    code: str = Field(pattern=r'^[A-Z0-9][A-Z0-9-]{2,31}$')
    line: Line
    product: str = Field(min_length=2, max_length=60)
    batch_code: str = Field(min_length=2, max_length=40)
    starts_at: LocalTime
    ends_at: LocalTime
    ambient_c: Decimal = Field(ge=-10, le=55, max_digits=4, decimal_places=1)


class RecordReading(Form):
    reading_at: LocalTime
    cumulative_kg: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    source_ref: str = Field(min_length=3, max_length=100)


class RecordRun(Form):
    asset: Equipment
    starts_at: LocalTime
    ends_at: LocalTime


class CorrectRun(RecordRun):
    reason: Reason


class RequestPlan(Form):
    shift_id: int = Field(gt=0)
    title: str = Field(min_length=4, max_length=80)


class VerifySpike(Form):
    finding: SpikeFinding
    note: Reason


class CloseReview(Form):
    conclusion: Reason
    follow_up: Reason
