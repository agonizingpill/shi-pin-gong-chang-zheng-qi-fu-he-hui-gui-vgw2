import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from .config import JWT_SECRET, Session
from .models import User

bearer = HTTPBearer(auto_error=False)


class DomainError(Exception):
    def __init__(self, code, message, status=409, **context):
        self.code, self.message, self.status, self.context = code, message, status, context


def password_hash(password, salt=None):
    salt = salt if salt is not None else os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f'{salt.hex()}:{digest.hex()}'


DUMMY_HASH = password_hash('unused', bytes(16))


def login(username, password):
    with Session() as db:
        user = db.scalar(select(User).where(User.username == username))
    stored = user.password_hash if user else DUMMY_HASH
    if not hmac.compare_digest(stored, password_hash(password, bytes.fromhex(stored.split(':')[0]))) or not user:
        raise DomainError('bad_login', '账号或口令有误', 401)
    token = jwt.encode({'sub': str(user.id), 'iss': 'food-steam-load',
                        'exp': datetime.now(UTC) + timedelta(hours=8)}, JWT_SECRET, algorithm='HS256')
    return token, user


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    user = None
    if credentials:
        try:
            decoded = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=['HS256'],
                                 issuer='food-steam-load', options={'require': ['exp', 'sub', 'iss']})
            with Session() as db:
                user = db.get(User, int(decoded['sub']))
        except (jwt.InvalidTokenError, ValueError):
            pass
    if user is None:
        raise DomainError('login_required', '请重新登录', 401)
    request.state.actor = user.username
    return user


def allow(*roles):
    def authorized(user: User = Depends(current_user)):
        if user.role not in roles:
            raise DomainError('forbidden', '当前角色没有此操作权限', 403)
        return user
    return authorized
