import os
from datetime import UTC, datetime
from pathlib import Path

from redis import Redis
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    URL.create('mysql+pymysql',
               username=os.getenv('DB_USER', 'steam'),
               password=os.getenv('DB_PASSWORD', 'steam-demo-db'),
               host=os.getenv('DB_HOST', '127.0.0.1'),
               port=int(os.getenv('DB_PORT', '3306')),
               database=os.getenv('DB_NAME', 'steam'), query={'charset': 'utf8mb4'}),
    isolation_level='READ COMMITTED', pool_pre_ping=True,
)
Session = sessionmaker(engine, expire_on_commit=False)
redis = Redis.from_url(os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0'), socket_timeout=5)
QUEUE = 'steam:load-plan:ready'
JWT_SECRET = os.getenv('JWT_SECRET', 'local-steam-board-secret-change-before-deploy')
ARTIFACT_DIR = Path(os.getenv('ARTIFACT_DIR', './artifacts'))


def utc_now():
    return datetime.now(UTC).replace(tzinfo=None)
