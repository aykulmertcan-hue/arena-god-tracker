from sqlmodel import Session

from app.db import make_engine
from app.config import settings

_engine = make_engine(settings.database_url)


def get_engine():
    return _engine


def get_session():
    with Session(_engine) as session:
        yield session


def get_riot_client():
    # Overridden in tests; real instance attached to app.state at startup.
    raise RuntimeError("riot client not configured")
