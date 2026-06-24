import asyncio
import logging
from contextlib import asynccontextmanager, contextmanager

import httpx
from fastapi import FastAPI
from sqlmodel import Session

from app.api.routes import router
from app.config import settings
from app.db import init_db, make_engine
from app.ddragon import fetch_champions, fetch_latest_version, sync_champions
from app.deps import get_engine, get_riot_client
from app.riot.client import RiotClient
from app.riot.rate_limiter import AsyncRateLimiter
from app.worker import poll_loop

log = logging.getLogger("arena.main")


def _session_factory(engine):
    @contextmanager
    def factory():
        with Session(engine) as session:
            yield session
    return factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    init_db(engine)

    async with httpx.AsyncClient(timeout=15.0) as dd:
        try:
            version = await fetch_latest_version(dd)
            champions = await fetch_champions(dd, version)
            with Session(engine) as s:
                added = sync_champions(s, champions)
            log.info("Data Dragon synced: version=%s new_champions=%s", version, added)
        except Exception as e:  # noqa: BLE001
            log.warning("Data Dragon sync failed at startup: %s", e)

    limiter = AsyncRateLimiter([(20, 1.0), (100, 120.0)])
    http = httpx.AsyncClient(timeout=10.0)
    riot = RiotClient(settings.riot_api_key, limiter, http)
    app.state.riot = riot
    app.dependency_overrides[get_riot_client] = lambda: riot

    stop_event = asyncio.Event()
    task = None
    if getattr(app.state, "start_worker", True):
        task = asyncio.create_task(
            poll_loop(_session_factory(engine), riot, settings.poll_interval_seconds, stop_event)
        )

    try:
        yield
    finally:
        stop_event.set()
        if task:
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        await http.aclose()


def create_app(start_worker: bool = True) -> FastAPI:
    app = FastAPI(title="Arena God Tracker", lifespan=lifespan)
    app.state.start_worker = start_worker
    app.include_router(router, prefix="/api")
    return app


app = create_app()
