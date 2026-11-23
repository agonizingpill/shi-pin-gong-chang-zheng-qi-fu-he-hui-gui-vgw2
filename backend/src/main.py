import logging
import os
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from migrations.initial import upgrade
from .auth import DomainError
from .config import Session
from .routes import router
from .shift_work import audit

log = logging.getLogger('uvicorn.error')


@asynccontextmanager
async def lifespan(_app):
    upgrade()
    if os.getenv('SEED_DEMO', 'false').lower() == 'true':
        try:
            from scripts.seed_demo import seed
            seed()
        except Exception:
            log.exception('Demo seed failed; API is available for recovery')
    yield


app = FastAPI(title='食品工厂蒸汽负荷回归', lifespan=lifespan)
app.include_router(router)


@app.middleware('http')
async def request_trace(request, call_next):
    request.state.request_id = uuid4().hex[:12]
    start = perf_counter()
    response = await call_next(request)
    response.headers['X-Request-Id'] = request.state.request_id
    response.headers['X-Response-Time-Ms'] = f'{(perf_counter() - start) * 1000:.1f}'
    return response


@app.middleware('http')
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


def error(status, code, message, **details):
    return JSONResponse(status_code=status, content={'code': code, 'message': message, **details})


@app.exception_handler(DomainError)
def domain_error(request: Request, exc: DomainError):
    actor = getattr(request.state, 'actor', None)
    if actor and request.method in {'POST', 'PATCH'}:
        try:
            with Session.begin() as db:
                audit(db, actor, 'operation.rejected', request.url.path, code=exc.code,
                      reason=exc.message, context=exc.context, request_id=request.state.request_id)
        except SQLAlchemyError:
            log.exception('Failed to persist denial audit')
    return error(exc.status, exc.code, exc.message, **exc.context)


@app.exception_handler(RequestValidationError)
def invalid_form(_request, exc):
    fields = [{'field': str(item['loc'][-1]), 'error': item['msg']} for item in exc.errors()]
    return error(422, 'invalid_form', '请检查输入格式与范围', fields=fields)


@app.exception_handler(IntegrityError)
def constraint_conflict(_request, _exc):
    return error(409, 'duplicate_record', '记录与现有数据冲突，请刷新后核对')


@app.exception_handler(SQLAlchemyError)
def database_failure(_request, exc):
    log.error('DB request failed', exc_info=exc)
    return error(503, 'store_unavailable', '蒸汽台账暂不可用，请稍后重试')
