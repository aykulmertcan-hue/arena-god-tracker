# Arena God Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, prod-ready web app that auto-tracks the LoL Arena God challenge — enter a Riot ID, it backfills past Arena 1st-place wins and live-polls for new ones, ticking each champion off a checklist.

**Architecture:** Single FastAPI process serves a REST API + a React static build, and runs an asyncio background poll loop. The loop polls the official Riot Match-V5 API (queue 1700) for each watched account, processes new matches idempotently, and marks a champion complete when `subteamPlacement == 1`. SQLite (WAL) is the only datastore. Champion roster comes from Data Dragon. No AI anywhere.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, httpx (async), SQLModel/SQLAlchemy, pydantic-settings, pytest + pytest-asyncio + respx; React + Vite (frontend); Docker.

## Global Constraints

- **No AI / no LLM calls anywhere** — deterministic Riot API + Data Dragon only.
- **No augment / item win-rate features** — placement (1st-place) tracking only (Riot policy).
- **Riot API key** comes only from env var `RIOT_API_KEY` — never hardcoded.
- **Arena queue** = `1700`, game mode `CHERRY`. 1st place = participant `subteamPlacement == 1`.
- **Champion matching key** = Data Dragon `id` string (e.g. `MonkeyKing`), NOT display name — match-v5 `championName` returns the internal id, which differs from display name for several champions (Wukong→`MonkeyKing`).
- **Regional routing** for account-v1 AND match-v5: `europe` (EUW1/EUN1/TR1/RU), `americas` (NA1/BR1/LA1/LA2/OC1), `asia` (KR/JP1). Default region `europe`.
- **Idempotency**: a match is processed at most once per account, enforced by `UNIQUE(watched_account_id, match_id)`.
- **Rate limits** (dev key): 20 req/s AND 100 req/120s — both honored by one limiter. Honor `Retry-After` on 429.
- **Poll interval** default 90s, configurable via env.
- All file paths below are relative to project root `Arena Tracker/`.

---

### Task 1: Project scaffold, config, dependencies

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_config.py`
- Create: `.gitignore`

**Interfaces:**
- Produces: `app.config.settings` — a `Settings` instance with attributes `riot_api_key: str`, `database_url: str`, `poll_interval_seconds: int`, `default_region: str`, `ddragon_check_interval_hours: int`. Also `Settings` class for test instantiation.

- [ ] **Step 1: Initialize git + scaffold files**

```bash
cd "Arena Tracker"
git init
mkdir -p backend/app backend/tests
```

Create `.gitignore`:
```
__pycache__/
*.pyc
.env
*.db
*.db-wal
*.db-shm
.venv/
node_modules/
frontend/dist/
backend/app/static/
.pytest_cache/
```

Create `backend/pyproject.toml`:
```toml
[project]
name = "arena-god-tracker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "httpx>=0.27",
    "sqlmodel>=0.0.16",
    "pydantic-settings>=2.2",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "respx>=0.21"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
pythonpath = ["."]
```

Create `backend/.env.example`:
```
RIOT_API_KEY=RGAPI-xxxxxxxx-replace-me
DATABASE_URL=sqlite:///./arena.db
POLL_INTERVAL_SECONDS=90
DEFAULT_REGION=europe
DDRAGON_CHECK_INTERVAL_HOURS=24
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_config.py`:
```python
from app.config import Settings


def test_defaults_apply_when_env_absent():
    s = Settings(_env_file=None)
    assert s.database_url == "sqlite:///./arena.db"
    assert s.poll_interval_seconds == 90
    assert s.default_region == "europe"
    assert s.ddragon_check_interval_hours == 24


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "30")
    monkeypatch.setenv("RIOT_API_KEY", "RGAPI-test")
    s = Settings(_env_file=None)
    assert s.poll_interval_seconds == 30
    assert s.riot_api_key == "RGAPI-test"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 4: Write minimal implementation**

Create `backend/app/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    riot_api_key: str = ""
    database_url: str = "sqlite:///./arena.db"
    poll_interval_seconds: int = 90
    default_region: str = "europe"
    ddragon_check_interval_hours: int = 24


settings = Settings()
```

Create `backend/tests/conftest.py`:
```python
# Shared fixtures live here; populated in later tasks.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pip install -e ".[dev]" && python -m pytest tests/test_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold backend project, config, deps"
```

---

### Task 2: Server → routing map

**Files:**
- Create: `backend/app/riot/__init__.py` (empty)
- Create: `backend/app/riot/routing.py`
- Test: `backend/tests/test_routing.py`

**Interfaces:**
- Produces: `app.riot.routing.resolve_routing(server: str) -> tuple[str, str]` returning `(routing, platform)` e.g. `("europe", "tr1")`. Raises `ValueError` on unknown server. Also `SERVER_TO_ROUTING: dict[str, tuple[str, str]]` and `SERVERS: list[str]` (keys, for the UI dropdown).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_routing.py`:
```python
import pytest
from app.riot.routing import resolve_routing, SERVERS


def test_known_servers_map_to_regional_routing():
    assert resolve_routing("TR1") == ("europe", "tr1")
    assert resolve_routing("euw1") == ("europe", "euw1")
    assert resolve_routing("NA1") == ("americas", "na1")
    assert resolve_routing("KR") == ("asia", "kr")


def test_unknown_server_raises():
    with pytest.raises(ValueError):
        resolve_routing("ZZZ")


def test_servers_list_nonempty_and_uppercase():
    assert "TR1" in SERVERS
    assert all(s == s.upper() for s in SERVERS)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_routing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.riot.routing'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/riot/__init__.py` (empty file).

Create `backend/app/riot/routing.py`:
```python
SERVER_TO_ROUTING: dict[str, tuple[str, str]] = {
    "EUW1": ("europe", "euw1"),
    "EUN1": ("europe", "eun1"),
    "TR1": ("europe", "tr1"),
    "RU": ("europe", "ru"),
    "NA1": ("americas", "na1"),
    "BR1": ("americas", "br1"),
    "LA1": ("americas", "la1"),
    "LA2": ("americas", "la2"),
    "OC1": ("americas", "oc1"),
    "KR": ("asia", "kr"),
    "JP1": ("asia", "jp1"),
}

SERVERS: list[str] = list(SERVER_TO_ROUTING.keys())


def resolve_routing(server: str) -> tuple[str, str]:
    key = server.upper()
    if key not in SERVER_TO_ROUTING:
        raise ValueError(f"Unknown server: {server}")
    return SERVER_TO_ROUTING[key]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_routing.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: server-to-regional-routing map"
```

---

### Task 3: Rate limiter (sliding window, two windows)

**Files:**
- Create: `backend/app/riot/rate_limiter.py`
- Test: `backend/tests/test_rate_limiter.py`

**Interfaces:**
- Produces:
  - `SlidingWindowLimiter(limits: list[tuple[int, float]])` — pure/testable core. Methods: `time_until_available(now: float) -> float`, `record(now: float) -> None`.
  - `AsyncRateLimiter(limits, clock=time.monotonic, sleep=asyncio.sleep)` — async wrapper with `async def acquire() -> None` and `async def sleep(seconds: float) -> None` (used by the client for Retry-After).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rate_limiter.py`:
```python
from app.riot.rate_limiter import SlidingWindowLimiter


def test_allows_until_limit_then_requires_wait():
    lim = SlidingWindowLimiter([(2, 10.0)])  # 2 requests per 10s
    assert lim.time_until_available(now=0.0) == 0.0
    lim.record(0.0)
    assert lim.time_until_available(now=0.0) == 0.0
    lim.record(0.0)
    # third request must wait until the first ages out (t=10)
    assert lim.time_until_available(now=0.0) == 10.0


def test_window_slides_as_time_passes():
    lim = SlidingWindowLimiter([(2, 10.0)])
    lim.record(0.0)
    lim.record(0.0)
    # at t=10 the first two have aged out
    assert lim.time_until_available(now=10.0) == 0.0


def test_two_windows_take_the_stricter_wait():
    lim = SlidingWindowLimiter([(20, 1.0), (3, 120.0)])  # 20/s AND 3/120s
    for _ in range(3):
        lim.record(0.0)
    # per-second window is fine, but 3/120s is exhausted -> wait ~120s
    assert lim.time_until_available(now=0.5) == 119.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_rate_limiter.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/riot/rate_limiter.py`:
```python
import asyncio
import time
from collections import deque
from typing import Callable


class SlidingWindowLimiter:
    """Pure, time-injected sliding-window limiter over multiple windows."""

    def __init__(self, limits: list[tuple[int, float]]):
        # limits: list of (max_requests, per_seconds)
        self.limits = limits
        self._timestamps: deque[float] = deque()

    def _prune(self, now: float) -> None:
        max_window = max(per for _, per in self.limits)
        while self._timestamps and self._timestamps[0] <= now - max_window:
            self._timestamps.popleft()

    def time_until_available(self, now: float) -> float:
        self._prune(now)
        wait = 0.0
        for max_req, per in self.limits:
            relevant = [t for t in self._timestamps if t > now - per]
            if len(relevant) >= max_req:
                wait = max(wait, relevant[0] + per - now)
        return wait

    def record(self, now: float) -> None:
        self._timestamps.append(now)


class AsyncRateLimiter:
    """Async wrapper around SlidingWindowLimiter, serialized by a lock."""

    def __init__(
        self,
        limits: list[tuple[int, float]],
        clock: Callable[[], float] = time.monotonic,
        sleep=asyncio.sleep,
    ):
        self._core = SlidingWindowLimiter(limits)
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = self._clock()
                wait = self._core.time_until_available(now)
                if wait <= 0:
                    self._core.record(now)
                    return
                await self._sleep(wait)

    async def sleep(self, seconds: float) -> None:
        await self._sleep(seconds)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_rate_limiter.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dual-window rate limiter"
```

---

### Task 4: Data models + DB init

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/db.py`
- Test: `backend/tests/test_models.py`
- Modify: `backend/tests/conftest.py`

**Interfaces:**
- Produces models: `WatchedAccount`, `Champion`, `ChecklistEntry`, `ProcessedMatch`, `AppState` (SQLModel tables, fields per spec §5).
- Produces `app.db.init_db(engine) -> None` (creates tables + sets WAL) and `app.db.make_engine(url: str)`.
- Produces test fixture `session` (in-memory SQLite Session) in `conftest.py`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_models.py`:
```python
import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from app.models import WatchedAccount, ProcessedMatch


def test_can_insert_and_query_account(session):
    acct = WatchedAccount(
        game_name="Faker", tag_line="KR1", puuid="puuid-1",
        routing="asia", platform="kr",
    )
    session.add(acct)
    session.commit()
    got = session.exec(select(WatchedAccount)).first()
    assert got.puuid == "puuid-1"
    assert got.backfill_status == "none"
    assert got.is_active is True


def test_processed_match_unique_per_account(session):
    session.add(ProcessedMatch(
        watched_account_id=1, match_id="EUW1_1",
        champion_name="Aatrox", subteam_placement=1,
    ))
    session.commit()
    session.add(ProcessedMatch(
        watched_account_id=1, match_id="EUW1_1",
        champion_name="Aatrox", subteam_placement=1,
    ))
    with pytest.raises(IntegrityError):
        session.commit()
```

- [ ] **Step 2: Add the `session` fixture**

Edit `backend/tests/conftest.py` to:
```python
import pytest
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool
import app.models  # noqa: F401  (register tables)


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture
def session(engine):
    with Session(engine) as s:
        yield s
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 4: Write minimal implementation**

Create `backend/app/models.py`:
```python
from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class WatchedAccount(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    game_name: str
    tag_line: str
    puuid: str = Field(index=True, unique=True)
    routing: str
    platform: str
    backfill_status: str = "none"  # none | running | done
    backfill_progress: int = 0
    last_polled_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Champion(SQLModel, table=True):
    key: int = Field(primary_key=True)        # Riot numeric champ id
    id: str = Field(index=True)               # Data Dragon string id e.g. "MonkeyKing"
    name: str                                 # display name e.g. "Wukong"
    image_filename: str
    ddragon_version: str


class ChecklistEntry(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("watched_account_id", "champion_key"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    watched_account_id: int = Field(foreign_key="watchedaccount.id", index=True)
    champion_key: int = Field(foreign_key="champion.key")
    completed: bool = False
    first_win_match_id: Optional[str] = None
    completed_at: Optional[datetime] = None


class ProcessedMatch(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("watched_account_id", "match_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    watched_account_id: int = Field(foreign_key="watchedaccount.id", index=True)
    match_id: str
    champion_name: str
    subteam_placement: int
    game_end_ts: Optional[int] = None
    processed_at: datetime = Field(default_factory=datetime.utcnow)


class AppState(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
```

Create `backend/app/db.py`:
```python
from sqlmodel import SQLModel, create_engine
import app.models  # noqa: F401  (register tables)


def make_engine(url: str):
    return create_engine(url, connect_args={"check_same_thread": False})


def init_db(engine) -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: data models + db init"
```

---

### Task 5: Riot API client

**Files:**
- Create: `backend/app/riot/client.py`
- Test: `backend/tests/test_riot_client.py`

**Interfaces:**
- Produces exceptions: `RiotAPIError`, `AccountNotFound(RiotAPIError)`, `InvalidApiKey(RiotAPIError)`.
- Produces `RiotClient(api_key: str, limiter: AsyncRateLimiter, client: httpx.AsyncClient | None = None)` with:
  - `async get_puuid(game_name, tag_line, routing) -> str`
  - `async get_arena_match_ids(puuid, routing, start=0, count=100) -> list[str]`
  - `async get_match(match_id, routing) -> dict`
- Consumes: `AsyncRateLimiter` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_riot_client.py`:
```python
import httpx
import pytest
import respx
from app.riot.client import RiotClient, AccountNotFound, InvalidApiKey


class NoWaitLimiter:
    async def acquire(self): pass
    async def sleep(self, s): pass


def make_client():
    return RiotClient("RGAPI-test", NoWaitLimiter(), httpx.AsyncClient())


@respx.mock
async def test_get_puuid_returns_puuid():
    respx.get(
        "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Hide on bush/KR1"
    ).mock(return_value=httpx.Response(200, json={"puuid": "PUUID123"}))
    puuid = await make_client().get_puuid("Hide on bush", "KR1", "europe")
    assert puuid == "PUUID123"


@respx.mock
async def test_get_puuid_404_raises_account_not_found():
    respx.get(url__regex=r".*by-riot-id.*").mock(return_value=httpx.Response(404, json={}))
    with pytest.raises(AccountNotFound):
        await make_client().get_puuid("Nope", "XXX", "europe")


@respx.mock
async def test_403_raises_invalid_api_key():
    respx.get(url__regex=r".*by-riot-id.*").mock(return_value=httpx.Response(403, json={}))
    with pytest.raises(InvalidApiKey):
        await make_client().get_puuid("X", "Y", "europe")


@respx.mock
async def test_arena_match_ids_passes_queue_1700():
    route = respx.get(url__regex=r".*/matches/by-puuid/PUUID123/ids.*").mock(
        return_value=httpx.Response(200, json=["EUW1_1", "EUW1_2"])
    )
    ids = await make_client().get_arena_match_ids("PUUID123", "europe", start=0, count=20)
    assert ids == ["EUW1_1", "EUW1_2"]
    assert route.calls.last.request.url.params["queue"] == "1700"


@respx.mock
async def test_429_then_200_retries():
    respx.get(url__regex=r".*/matches/EUW1_1$").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "0"}),
            httpx.Response(200, json={"metadata": {"matchId": "EUW1_1"}}),
        ]
    )
    data = await make_client().get_match("EUW1_1", "europe")
    assert data["metadata"]["matchId"] == "EUW1_1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_riot_client.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/riot/client.py`:
```python
import asyncio

import httpx


class RiotAPIError(Exception):
    pass


class AccountNotFound(RiotAPIError):
    pass


class InvalidApiKey(RiotAPIError):
    pass


class RiotClient:
    def __init__(self, api_key, limiter, client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.limiter = limiter
        self._client = client or httpx.AsyncClient(timeout=10.0)

    async def _get(self, url: str, params: dict | None = None, max_retries: int = 3):
        for attempt in range(max_retries + 1):
            await self.limiter.acquire()
            resp = await self._client.get(
                url, params=params, headers={"X-Riot-Token": self.api_key}
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404:
                raise AccountNotFound(url)
            if resp.status_code in (401, 403):
                raise InvalidApiKey()
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", "1"))
                await self.limiter.sleep(retry_after)
                continue
            if resp.status_code >= 500:
                await asyncio.sleep(min(2 ** attempt, 8))
                continue
            resp.raise_for_status()
        raise RiotAPIError(f"max retries exceeded for {url}")

    async def get_puuid(self, game_name: str, tag_line: str, routing: str) -> str:
        url = (
            f"https://{routing}.api.riotgames.com"
            f"/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        )
        data = await self._get(url)
        return data["puuid"]

    async def get_arena_match_ids(
        self, puuid: str, routing: str, start: int = 0, count: int = 100
    ) -> list[str]:
        url = (
            f"https://{routing}.api.riotgames.com"
            f"/lol/match/v5/matches/by-puuid/{puuid}/ids"
        )
        return await self._get(url, params={"queue": 1700, "start": start, "count": count})

    async def get_match(self, match_id: str, routing: str) -> dict:
        url = f"https://{routing}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        return await self._get(url)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_riot_client.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Riot API client with retry/429 handling"
```

---

### Task 6: Data Dragon sync + checklist seeding

**Files:**
- Create: `backend/app/ddragon.py`
- Test: `backend/tests/test_ddragon.py`

**Interfaces:**
- Produces:
  - `async fetch_latest_version(client: httpx.AsyncClient) -> str`
  - `async fetch_champions(client, version) -> list[dict]` — each dict `{key:int, id:str, name:str, image_filename:str, version:str}`
  - `sync_champions(session, champions: list[dict]) -> int` — upserts `Champion` rows; for any newly-added champion key, inserts an unchecked `ChecklistEntry` for every existing `WatchedAccount`. Returns count of new champions.
  - `seed_checklist(session, account_id: int) -> None` — inserts an unchecked `ChecklistEntry` for every `Champion` for one account (skips existing).
- Consumes: `Champion`, `ChecklistEntry`, `WatchedAccount` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ddragon.py`:
```python
import httpx
import respx
from sqlmodel import select
from app.ddragon import fetch_latest_version, fetch_champions, sync_champions, seed_checklist
from app.models import Champion, ChecklistEntry, WatchedAccount


@respx.mock
async def test_fetch_latest_version():
    respx.get("https://ddragon.leagueoflegends.com/api/versions.json").mock(
        return_value=httpx.Response(200, json=["14.12.1", "14.11.1"])
    )
    async with httpx.AsyncClient() as c:
        assert await fetch_latest_version(c) == "14.12.1"


@respx.mock
async def test_fetch_champions_parses_key_id_name():
    respx.get(url__regex=r".*/champion.json$").mock(return_value=httpx.Response(200, json={
        "data": {
            "MonkeyKing": {"key": "62", "id": "MonkeyKing", "name": "Wukong",
                            "image": {"full": "MonkeyKing.png"}},
        }
    }))
    async with httpx.AsyncClient() as c:
        champs = await fetch_champions(c, "14.12.1")
    assert champs[0] == {"key": 62, "id": "MonkeyKing", "name": "Wukong",
                         "image_filename": "MonkeyKing.png", "version": "14.12.1"}


def test_sync_then_new_champion_backfills_existing_accounts(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="p", routing="europe", platform="euw1")
    session.add(acct); session.commit(); session.refresh(acct)
    seed_checklist(session, acct.id)  # 0 champions yet -> no entries

    new = sync_champions(session, [
        {"key": 266, "id": "Aatrox", "name": "Aatrox", "image_filename": "Aatrox.png", "version": "14.12.1"},
    ])
    assert new == 1
    entries = session.exec(select(ChecklistEntry).where(ChecklistEntry.watched_account_id == acct.id)).all()
    assert len(entries) == 1
    assert entries[0].champion_key == 266
    assert entries[0].completed is False

    # syncing same champion again adds nothing
    assert sync_champions(session, [
        {"key": 266, "id": "Aatrox", "name": "Aatrox", "image_filename": "Aatrox.png", "version": "14.12.1"},
    ]) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ddragon.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/ddragon.py`:
```python
import httpx
from sqlmodel import Session, select

from app.models import Champion, ChecklistEntry, WatchedAccount

DDRAGON_BASE = "https://ddragon.leagueoflegends.com"


async def fetch_latest_version(client: httpx.AsyncClient) -> str:
    resp = await client.get(f"{DDRAGON_BASE}/api/versions.json")
    resp.raise_for_status()
    return resp.json()[0]


async def fetch_champions(client: httpx.AsyncClient, version: str) -> list[dict]:
    resp = await client.get(f"{DDRAGON_BASE}/cdn/{version}/data/en_US/champion.json")
    resp.raise_for_status()
    data = resp.json()["data"]
    out = []
    for c in data.values():
        out.append({
            "key": int(c["key"]),
            "id": c["id"],
            "name": c["name"],
            "image_filename": c["image"]["full"],
            "version": version,
        })
    return out


def _add_entry_for_all_accounts(session: Session, champion_key: int) -> None:
    accounts = session.exec(select(WatchedAccount)).all()
    for acct in accounts:
        exists = session.exec(
            select(ChecklistEntry).where(
                ChecklistEntry.watched_account_id == acct.id,
                ChecklistEntry.champion_key == champion_key,
            )
        ).first()
        if not exists:
            session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=champion_key))


def sync_champions(session: Session, champions: list[dict]) -> int:
    new_count = 0
    for c in champions:
        existing = session.get(Champion, c["key"])
        if existing:
            existing.id = c["id"]
            existing.name = c["name"]
            existing.image_filename = c["image_filename"]
            existing.ddragon_version = c["version"]
        else:
            session.add(Champion(
                key=c["key"], id=c["id"], name=c["name"],
                image_filename=c["image_filename"], ddragon_version=c["version"],
            ))
            new_count += 1
            _add_entry_for_all_accounts(session, c["key"])
    session.commit()
    return new_count


def seed_checklist(session: Session, account_id: int) -> None:
    champions = session.exec(select(Champion)).all()
    for champ in champions:
        exists = session.exec(
            select(ChecklistEntry).where(
                ChecklistEntry.watched_account_id == account_id,
                ChecklistEntry.champion_key == champ.key,
            )
        ).first()
        if not exists:
            session.add(ChecklistEntry(watched_account_id=account_id, champion_key=champ.key))
    session.commit()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ddragon.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Data Dragon sync + checklist seeding"
```

---

### Task 7: Match processing (idempotent) + champion tick

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/matches.py`
- Test: `backend/tests/test_match_processing.py`

**Interfaces:**
- Produces:
  - `extract_result(match_data: dict, puuid: str) -> tuple[str, int] | None` — returns `(championName, subteamPlacement)` for our participant, else `None`.
  - `process_match(session, account: WatchedAccount, match_id: str, match_data: dict) -> bool` — idempotent. Writes `ProcessedMatch`; if `subteamPlacement == 1`, marks the matching `ChecklistEntry` (by `Champion.id == championName`) complete. Returns `True` if a champion was newly marked complete, else `False`. Safe to call twice (UNIQUE guard + pre-check).
- Consumes: models (Task 4).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_match_processing.py`:
```python
from datetime import datetime
from sqlmodel import select
from app.services.matches import extract_result, process_match
from app.models import WatchedAccount, Champion, ChecklistEntry, ProcessedMatch


def _match(puuid, champ_name, placement):
    return {
        "metadata": {"matchId": "EUW1_1"},
        "info": {"gameEndTimestamp": 1700000000000, "participants": [
            {"puuid": "other", "championName": "Zed", "subteamPlacement": 4},
            {"puuid": puuid, "championName": champ_name, "subteamPlacement": placement},
        ]},
    }


def _setup(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="me", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=62, id="MonkeyKing", name="Wukong", image_filename="MonkeyKing.png", ddragon_version="14.12.1"))
    session.commit(); session.refresh(acct)
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=62))
    session.commit()
    return acct


def test_extract_result_finds_our_participant():
    assert extract_result(_match("me", "MonkeyKing", 1), "me") == ("MonkeyKing", 1)
    assert extract_result(_match("me", "MonkeyKing", 1), "ghost") is None


def test_first_place_marks_champion_complete(session):
    acct = _setup(session)
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    assert newly is True
    entry = session.exec(select(ChecklistEntry).where(ChecklistEntry.champion_key == 62)).first()
    assert entry.completed is True
    assert entry.first_win_match_id == "EUW1_1"


def test_non_first_place_records_but_does_not_complete(session):
    acct = _setup(session)
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 3))
    assert newly is False
    entry = session.exec(select(ChecklistEntry).where(ChecklistEntry.champion_key == 62)).first()
    assert entry.completed is False
    assert session.exec(select(ProcessedMatch)).first().subteam_placement == 3


def test_idempotent_second_call_is_noop(session):
    acct = _setup(session)
    process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    assert newly is False
    assert len(session.exec(select(ProcessedMatch)).all()) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_match_processing.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/__init__.py` (empty file).

Create `backend/app/services/matches.py`:
```python
from datetime import datetime

from sqlmodel import Session, select

from app.models import Champion, ChecklistEntry, ProcessedMatch, WatchedAccount


def extract_result(match_data: dict, puuid: str) -> tuple[str, int] | None:
    for p in match_data["info"]["participants"]:
        if p["puuid"] == puuid:
            return p["championName"], p["subteamPlacement"]
    return None


def process_match(
    session: Session, account: WatchedAccount, match_id: str, match_data: dict
) -> bool:
    already = session.exec(
        select(ProcessedMatch).where(
            ProcessedMatch.watched_account_id == account.id,
            ProcessedMatch.match_id == match_id,
        )
    ).first()
    if already:
        return False

    result = extract_result(match_data, account.puuid)
    if result is None:
        return False
    champ_name, placement = result

    session.add(ProcessedMatch(
        watched_account_id=account.id,
        match_id=match_id,
        champion_name=champ_name,
        subteam_placement=placement,
        game_end_ts=match_data["info"].get("gameEndTimestamp"),
    ))

    newly_completed = False
    if placement == 1:
        champ = session.exec(select(Champion).where(Champion.id == champ_name)).first()
        if champ:
            entry = session.exec(
                select(ChecklistEntry).where(
                    ChecklistEntry.watched_account_id == account.id,
                    ChecklistEntry.champion_key == champ.key,
                )
            ).first()
            if entry and not entry.completed:
                entry.completed = True
                entry.first_win_match_id = match_id
                entry.completed_at = datetime.utcnow()
                newly_completed = True

    session.commit()
    return newly_completed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_match_processing.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: idempotent match processing + champion tick"
```

---

### Task 8: Account service (resolve, create, remember)

**Files:**
- Create: `backend/app/services/accounts.py`
- Test: `backend/tests/test_account_service.py`

**Interfaces:**
- Produces:
  - `async create_or_get_account(session, riot_client, game_name, tag_line, server, backfill: bool) -> WatchedAccount` — resolves puuid via account-v1, creates account + seeds checklist if new, sets `backfill_status="running"` when `backfill` is True, records last-used. Returns the account.
  - `set_last_used(session, account_id: int) -> None`
  - `get_last_used(session) -> WatchedAccount | None`
- Consumes: `resolve_routing` (Task 2), `RiotClient` (Task 5), `seed_checklist` (Task 6), models (Task 4).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_account_service.py`:
```python
from sqlmodel import select
from app.services.accounts import create_or_get_account, get_last_used
from app.models import WatchedAccount, Champion, ChecklistEntry


class FakeRiot:
    def __init__(self, puuid): self._puuid = puuid; self.calls = 0
    async def get_puuid(self, g, t, r): self.calls += 1; return self._puuid


def _seed_champions(session):
    session.add(Champion(key=266, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="14.12.1"))
    session.commit()


async def test_create_new_account_resolves_puuid_and_seeds_checklist(session):
    _seed_champions(session)
    acct = await create_or_get_account(session, FakeRiot("PU"), "Bob", "EUW", "EUW1", backfill=True)
    assert acct.puuid == "PU"
    assert acct.routing == "europe" and acct.platform == "euw1"
    assert acct.backfill_status == "running"
    entries = session.exec(select(ChecklistEntry).where(ChecklistEntry.watched_account_id == acct.id)).all()
    assert len(entries) == 1
    assert get_last_used(session).id == acct.id


async def test_existing_account_reused_not_duplicated(session):
    _seed_champions(session)
    riot = FakeRiot("PU")
    a1 = await create_or_get_account(session, riot, "Bob", "EUW", "EUW1", backfill=False)
    a2 = await create_or_get_account(session, riot, "Bob", "EUW", "EUW1", backfill=False)
    assert a1.id == a2.id
    assert len(session.exec(select(WatchedAccount)).all()) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_account_service.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/accounts.py`:
```python
from sqlmodel import Session, select

from app.ddragon import seed_checklist
from app.models import AppState, WatchedAccount
from app.riot.routing import resolve_routing

LAST_USED_KEY = "last_used_account_id"


def set_last_used(session: Session, account_id: int) -> None:
    row = session.get(AppState, LAST_USED_KEY)
    if row:
        row.value = str(account_id)
    else:
        session.add(AppState(key=LAST_USED_KEY, value=str(account_id)))
    session.commit()


def get_last_used(session: Session) -> WatchedAccount | None:
    row = session.get(AppState, LAST_USED_KEY)
    if not row:
        return None
    return session.get(WatchedAccount, int(row.value))


async def create_or_get_account(
    session: Session, riot_client, game_name: str, tag_line: str, server: str, backfill: bool
) -> WatchedAccount:
    routing, platform = resolve_routing(server)
    puuid = await riot_client.get_puuid(game_name, tag_line, routing)

    acct = session.exec(
        select(WatchedAccount).where(WatchedAccount.puuid == puuid)
    ).first()

    if not acct:
        acct = WatchedAccount(
            game_name=game_name, tag_line=tag_line, puuid=puuid,
            routing=routing, platform=platform,
        )
        session.add(acct)
        session.commit()
        session.refresh(acct)
        seed_checklist(session, acct.id)

    if backfill and acct.backfill_status != "running":
        acct.backfill_status = "running"
        session.commit()

    set_last_used(session, acct.id)
    return acct
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_account_service.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: account service — resolve, create, remember"
```

---

### Task 9: Checklist view + poll/backfill orchestration

**Files:**
- Create: `backend/app/services/checklist.py`
- Create: `backend/app/services/poller.py`
- Test: `backend/tests/test_checklist_view.py`
- Test: `backend/tests/test_poller.py`

**Interfaces:**
- Produces (`checklist.py`):
  - `build_checklist(session, account_id: int) -> dict` — `{"total": int, "completed": int, "champions": [{key, id, name, image_filename, completed, first_win_match_id}], "version": str|None}` sorted by champion name.
- Produces (`poller.py`):
  - `async poll_account(session, riot_client, account_id: int) -> int` — fetches recent ids (count 20), processes unprocessed ones, updates `last_polled_at`. Returns number of newly completed champions.
  - `async run_backfill(session, riot_client, account_id: int, page_size: int = 100) -> int` — paginates all queue=1700 ids, processes unprocessed, sets `backfill_status="done"`, updates `backfill_progress`. Returns total newly completed.
- Consumes: `RiotClient` (Task 5), `process_match` (Task 7), models.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_checklist_view.py`:
```python
from app.services.checklist import build_checklist
from app.models import WatchedAccount, Champion, ChecklistEntry


def test_build_checklist_reports_totals_and_sorted(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="p", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=2, id="Zac", name="Zac", image_filename="Zac.png", ddragon_version="v"))
    session.add(Champion(key=1, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
    session.commit(); session.refresh(acct)
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=1, completed=True, first_win_match_id="M1"))
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=2, completed=False))
    session.commit()

    view = build_checklist(session, acct.id)
    assert view["total"] == 2
    assert view["completed"] == 1
    assert [c["name"] for c in view["champions"]] == ["Aatrox", "Zac"]
    assert view["champions"][0]["completed"] is True
    assert view["champions"][0]["first_win_match_id"] == "M1"
```

Create `backend/tests/test_poller.py`:
```python
from sqlmodel import select
from app.services.poller import poll_account, run_backfill
from app.models import WatchedAccount, Champion, ChecklistEntry, ProcessedMatch


class FakeRiot:
    def __init__(self, ids_pages, matches):
        self._ids_pages = ids_pages  # list of pages (lists of ids)
        self._matches = matches      # dict match_id -> match_data
        self._page = 0

    async def get_arena_match_ids(self, puuid, routing, start=0, count=100):
        # serve pages sequentially regardless of start (test helper)
        if self._page >= len(self._ids_pages):
            return []
        page = self._ids_pages[self._page]; self._page += 1
        return page

    async def get_match(self, match_id, routing):
        return self._matches[match_id]


def _win(mid, puuid, champ):
    return {"metadata": {"matchId": mid},
            "info": {"gameEndTimestamp": 1, "participants": [
                {"puuid": puuid, "championName": champ, "subteamPlacement": 1}]}}


def _setup(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="me", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=266, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
    session.commit(); session.refresh(acct)
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=266))
    session.commit()
    return acct


async def test_poll_account_processes_new_match(session):
    acct = _setup(session)
    riot = FakeRiot([["EUW1_1"]], {"EUW1_1": _win("EUW1_1", "me", "Aatrox")})
    newly = await poll_account(session, riot, acct.id)
    assert newly == 1
    entry = session.exec(select(ChecklistEntry)).first()
    assert entry.completed is True
    session.refresh(acct)
    assert acct.last_polled_at is not None


async def test_run_backfill_paginates_then_marks_done(session):
    acct = _setup(session)
    riot = FakeRiot([["EUW1_1"], []], {"EUW1_1": _win("EUW1_1", "me", "Aatrox")})
    total = await run_backfill(session, riot, acct.id, page_size=100)
    assert total == 1
    session.refresh(acct)
    assert acct.backfill_status == "done"
    assert len(session.exec(select(ProcessedMatch)).all()) == 1


async def test_backfill_empty_history_marks_done(session):
    acct = _setup(session)
    riot = FakeRiot([[]], {})
    total = await run_backfill(session, riot, acct.id)
    assert total == 0
    session.refresh(acct)
    assert acct.backfill_status == "done"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_checklist_view.py tests/test_poller.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/checklist.py`:
```python
from sqlmodel import Session, select

from app.models import Champion, ChecklistEntry


def build_checklist(session: Session, account_id: int) -> dict:
    rows = session.exec(
        select(Champion, ChecklistEntry)
        .join(ChecklistEntry, ChecklistEntry.champion_key == Champion.key)
        .where(ChecklistEntry.watched_account_id == account_id)
        .order_by(Champion.name)
    ).all()
    champions = []
    completed = 0
    version = None
    for champ, entry in rows:
        version = champ.ddragon_version
        if entry.completed:
            completed += 1
        champions.append({
            "key": champ.key,
            "id": champ.id,
            "name": champ.name,
            "image_filename": champ.image_filename,
            "completed": entry.completed,
            "first_win_match_id": entry.first_win_match_id,
        })
    return {"total": len(champions), "completed": completed,
            "champions": champions, "version": version}
```

Create `backend/app/services/poller.py`:
```python
from datetime import datetime

from sqlmodel import Session, select

from app.models import ProcessedMatch, WatchedAccount
from app.services.matches import process_match


def _unprocessed(session: Session, account_id: int, ids: list[str]) -> list[str]:
    if not ids:
        return []
    seen = set(session.exec(
        select(ProcessedMatch.match_id).where(
            ProcessedMatch.watched_account_id == account_id,
            ProcessedMatch.match_id.in_(ids),
        )
    ).all())
    return [m for m in ids if m not in seen]


async def poll_account(session: Session, riot_client, account_id: int) -> int:
    account = session.get(WatchedAccount, account_id)
    ids = await riot_client.get_arena_match_ids(account.puuid, account.routing, start=0, count=20)
    newly = 0
    for match_id in _unprocessed(session, account_id, ids):
        data = await riot_client.get_match(match_id, account.routing)
        if process_match(session, account, match_id, data):
            newly += 1
    account.last_polled_at = datetime.utcnow()
    session.commit()
    return newly


async def run_backfill(session: Session, riot_client, account_id: int, page_size: int = 100) -> int:
    account = session.get(WatchedAccount, account_id)
    account.backfill_status = "running"
    session.commit()
    start = 0
    total_newly = 0
    while True:
        ids = await riot_client.get_arena_match_ids(
            account.puuid, account.routing, start=start, count=page_size
        )
        if not ids:
            break
        for match_id in _unprocessed(session, account_id, ids):
            data = await riot_client.get_match(match_id, account.routing)
            if process_match(session, account, match_id, data):
                total_newly += 1
            account.backfill_progress += 1
        session.commit()
        start += page_size
    account.backfill_status = "done"
    account.last_polled_at = datetime.utcnow()
    session.commit()
    return total_newly
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_checklist_view.py tests/test_poller.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: checklist view + poll/backfill orchestration"
```

---

### Task 10: FastAPI app, dependencies, REST routes

**Files:**
- Create: `backend/app/deps.py`
- Create: `backend/app/api/__init__.py` (empty)
- Create: `backend/app/api/routes.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Produces app factory `app.main.create_app() -> FastAPI` mounting router at `/api`.
- Routes (all JSON):
  - `GET /api/servers` → `{"servers": [...], "default": "EUW1"}`
  - `POST /api/accounts` body `{game_name, tag_line, server, backfill}` → account summary `{id, game_name, tag_line, server, backfill_status}`
  - `GET /api/accounts/current` → account summary or `204`
  - `GET /api/accounts/{id}/checklist` → `build_checklist` output
  - `GET /api/accounts/{id}/status` → `{backfill_status, backfill_progress, last_polled_at}`
- Produces `app.deps.get_session` (FastAPI dependency) and `app.deps.get_riot_client(app)`.
- Consumes: account service (Task 8), checklist (Task 9), routing (Task 2), client+limiter (Tasks 3,5).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_api.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.main import create_app
from app.deps import get_session, get_riot_client
from app.models import Champion


class FakeRiot:
    async def get_puuid(self, g, t, r): return "PU-" + g


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Champion(key=266, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
        s.commit()

    app = create_app(start_worker=False)

    def _session_override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _session_override
    app.dependency_overrides[get_riot_client] = lambda: FakeRiot()
    return TestClient(app)


def test_servers_endpoint(client):
    r = client.get("/api/servers")
    assert r.status_code == 200
    assert "EUW1" in r.json()["servers"]


def test_create_account_then_current_then_checklist(client):
    r = client.post("/api/accounts", json={
        "game_name": "Bob", "tag_line": "EUW", "server": "EUW1", "backfill": False})
    assert r.status_code == 200
    acct_id = r.json()["id"]

    cur = client.get("/api/accounts/current")
    assert cur.status_code == 200 and cur.json()["id"] == acct_id

    cl = client.get(f"/api/accounts/{acct_id}/checklist")
    assert cl.status_code == 200
    assert cl.json()["total"] == 1
    assert cl.json()["champions"][0]["name"] == "Aatrox"


def test_current_returns_204_when_none(client):
    assert client.get("/api/accounts/current").status_code == 204
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/deps.py`:
```python
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
```

Create `backend/app/api/__init__.py` (empty file).

Create `backend/app/api/routes.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session

from app.deps import get_session, get_riot_client
from app.config import settings
from app.riot.routing import SERVERS, resolve_routing
from app.riot.client import AccountNotFound, InvalidApiKey
from app.services.accounts import create_or_get_account, get_last_used
from app.services.checklist import build_checklist
from app.models import WatchedAccount

router = APIRouter()


class CreateAccountBody(BaseModel):
    game_name: str
    tag_line: str
    server: str
    backfill: bool = True


def _summary(acct: WatchedAccount) -> dict:
    return {
        "id": acct.id, "game_name": acct.game_name, "tag_line": acct.tag_line,
        "server": acct.platform.upper(), "backfill_status": acct.backfill_status,
    }


@router.get("/servers")
def servers():
    default = "EUW1" if settings.default_region == "europe" else SERVERS[0]
    return {"servers": SERVERS, "default": default}


@router.post("/accounts")
async def create_account(
    body: CreateAccountBody,
    session: Session = Depends(get_session),
    riot=Depends(get_riot_client),
):
    try:
        resolve_routing(body.server)
    except ValueError:
        raise HTTPException(400, f"Unknown server: {body.server}")
    try:
        acct = await create_or_get_account(
            session, riot, body.game_name, body.tag_line, body.server, body.backfill
        )
    except AccountNotFound:
        raise HTTPException(404, "Riot ID not found")
    except InvalidApiKey:
        raise HTTPException(502, "Riot API key invalid or expired")
    return _summary(acct)


@router.get("/accounts/current")
def current(session: Session = Depends(get_session)):
    acct = get_last_used(session)
    if not acct:
        return Response(status_code=204)
    return _summary(acct)


@router.get("/accounts/{account_id}/checklist")
def checklist(account_id: int, session: Session = Depends(get_session)):
    if not session.get(WatchedAccount, account_id):
        raise HTTPException(404, "account not found")
    return build_checklist(session, account_id)


@router.get("/accounts/{account_id}/status")
def status(account_id: int, session: Session = Depends(get_session)):
    acct = session.get(WatchedAccount, account_id)
    if not acct:
        raise HTTPException(404, "account not found")
    return {
        "backfill_status": acct.backfill_status,
        "backfill_progress": acct.backfill_progress,
        "last_polled_at": acct.last_polled_at,
    }
```

Create `backend/app/main.py`:
```python
from fastapi import FastAPI

from app.api.routes import router


def create_app(start_worker: bool = True) -> FastAPI:
    app = FastAPI(title="Arena God Tracker")
    app.include_router(router, prefix="/api")
    # DB init, Data Dragon sync, and worker startup are wired in Task 11.
    app.state.start_worker = start_worker
    return app


app = create_app()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_api.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: FastAPI app + REST routes"
```

---

### Task 11: Background worker + startup wiring

**Files:**
- Create: `backend/app/worker.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_worker.py`

**Interfaces:**
- Produces:
  - `async poll_cycle(session_factory, riot_client) -> None` — for each active account: if `backfill_status == "running"` run backfill, else poll. Swallows `InvalidApiKey`/`RiotAPIError` per-account (logs), so one bad account doesn't kill the loop.
  - `async poll_loop(session_factory, riot_client, interval: float, stop_event: asyncio.Event) -> None`
- Modify `main.py`: on startup → `init_db`, Data Dragon sync, build `AsyncRateLimiter([(20,1.0),(100,120.0)])` + `RiotClient`, store on `app.state`, override `get_riot_client`, launch `poll_loop` task when `start_worker`. On shutdown → set stop event, cancel task.
- Consumes: poller (Task 9), client/limiter (Tasks 3,5), ddragon (Task 6).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_worker.py`:
```python
from contextlib import contextmanager
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app.worker import poll_cycle
from app.models import WatchedAccount, Champion, ChecklistEntry
from app.riot.client import RiotAPIError


class FakeRiot:
    def __init__(self, fail=False):
        self.fail = fail
    async def get_arena_match_ids(self, puuid, routing, start=0, count=100):
        if self.fail:
            raise RiotAPIError("boom")
        return ["EUW1_1"] if start == 0 else []
    async def get_match(self, match_id, routing):
        return {"metadata": {"matchId": match_id}, "info": {"gameEndTimestamp": 1, "participants": [
            {"puuid": "me", "championName": "Aatrox", "subteamPlacement": 1}]}}


def _factory(engine):
    @contextmanager
    def f():
        with Session(engine) as s:
            yield s
    return f


def _engine_with_account(backfill_status="done"):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        acct = WatchedAccount(game_name="A", tag_line="B", puuid="me", routing="europe",
                              platform="euw1", backfill_status=backfill_status)
        s.add(acct)
        s.add(Champion(key=266, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
        s.commit(); s.refresh(acct)
        s.add(ChecklistEntry(watched_account_id=acct.id, champion_key=266))
        s.commit()
    return engine


async def test_poll_cycle_completes_champion():
    engine = _engine_with_account()
    await poll_cycle(_factory(engine), FakeRiot())
    with Session(engine) as s:
        assert s.exec(select(ChecklistEntry)).first().completed is True


async def test_poll_cycle_swallows_api_errors():
    engine = _engine_with_account()
    # should not raise
    await poll_cycle(_factory(engine), FakeRiot(fail=True))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_worker.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.worker'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/worker.py`:
```python
import asyncio
import logging

from sqlmodel import select

from app.models import WatchedAccount
from app.riot.client import RiotAPIError
from app.services.poller import poll_account, run_backfill

log = logging.getLogger("arena.worker")


async def poll_cycle(session_factory, riot_client) -> None:
    with session_factory() as session:
        account_ids = session.exec(
            select(WatchedAccount.id).where(WatchedAccount.is_active == True)  # noqa: E712
        ).all()
        statuses = {
            a.id: a.backfill_status
            for a in session.exec(select(WatchedAccount)).all()
        }

    for account_id in account_ids:
        try:
            with session_factory() as session:
                if statuses.get(account_id) == "running":
                    await run_backfill(session, riot_client, account_id)
                else:
                    await poll_account(session, riot_client, account_id)
        except RiotAPIError as e:
            log.warning("account %s poll failed: %s", account_id, e)
        except Exception as e:  # noqa: BLE001
            log.exception("account %s unexpected error: %s", account_id, e)


async def poll_loop(session_factory, riot_client, interval: float, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        await poll_cycle(session_factory, riot_client)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_worker.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Wire startup/shutdown into main.py**

Replace `backend/app/main.py` with:
```python
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
        await http.aclose()


def create_app(start_worker: bool = True) -> FastAPI:
    app = FastAPI(title="Arena God Tracker", lifespan=lifespan)
    app.state.start_worker = start_worker
    app.include_router(router, prefix="/api")
    return app


app = create_app()
```

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all tests green)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: background poll worker + startup wiring"
```

---

### Task 12: Frontend — React + Vite checklist UI

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/api.js`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/components/AccountForm.jsx`
- Create: `frontend/src/components/ChecklistGrid.jsx`
- Create: `frontend/src/styles.css`

**Interfaces:**
- Consumes backend REST (Task 10): `GET /api/servers`, `POST /api/accounts`, `GET /api/accounts/current`, `GET /api/accounts/{id}/checklist`, `GET /api/accounts/{id}/status`.
- Champion portraits: `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{image_filename}`.

> Frontend is verified by running it against the backend (Step 7), not unit tests.

- [ ] **Step 1: Scaffold Vite config + entry**

Create `frontend/package.json`:
```json
{
  "name": "arena-god-tracker-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.0"
  }
}
```

Create `frontend/vite.config.js`:
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // build into the backend's static dir so FastAPI serves it in prod
  build: { outDir: "../backend/app/static", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8000" } },
});
```

Create `frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arena God Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

Create `frontend/src/main.jsx`:
```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

- [ ] **Step 2: API helper**

Create `frontend/src/api.js`:
```js
const j = async (res) => {
  if (res.status === 204) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
};

export const getServers = () => fetch("/api/servers").then(j);
export const getCurrent = () => fetch("/api/accounts/current").then(j);
export const createAccount = (body) =>
  fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);
export const getChecklist = (id) => fetch(`/api/accounts/${id}/checklist`).then(j);
export const getStatus = (id) => fetch(`/api/accounts/${id}/status`).then(j);
```

- [ ] **Step 3: AccountForm component**

Create `frontend/src/components/AccountForm.jsx`:
```jsx
import React, { useEffect, useState } from "react";
import { getServers, createAccount } from "../api.js";

export default function AccountForm({ onCreated }) {
  const [servers, setServers] = useState([]);
  const [server, setServer] = useState("EUW1");
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [backfill, setBackfill] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getServers().then((d) => { setServers(d.servers); setServer(d.default); });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const acct = await createAccount({ game_name: gameName, tag_line: tagLine, server, backfill });
      onCreated(acct);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="account-form" onSubmit={submit}>
      <h1>Arena God Tracker</h1>
      <div className="riot-id">
        <input placeholder="Game name" value={gameName} onChange={(e) => setGameName(e.target.value)} required />
        <span>#</span>
        <input placeholder="TAG" value={tagLine} onChange={(e) => setTagLine(e.target.value)} required />
      </div>
      <select value={server} onChange={(e) => setServer(e.target.value)}>
        {servers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="backfill">
        <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} />
        Scan match history (backfill)
      </label>
      <button disabled={busy}>{busy ? "Resolving…" : "Track"}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: ChecklistGrid component**

Create `frontend/src/components/ChecklistGrid.jsx`:
```jsx
import React from "react";

export default function ChecklistGrid({ data }) {
  if (!data) return null;
  const portrait = (c) =>
    `https://ddragon.leagueoflegends.com/cdn/${data.version}/img/champion/${c.image_filename}`;
  const pct = data.total ? Math.round((data.completed / data.total) * 100) : 0;
  return (
    <div className="checklist">
      <div className="progress">
        <strong>{data.completed} / {data.total}</strong> champions ({pct}%)
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="grid">
        {data.champions.map((c) => (
          <div key={c.key} className={`champ ${c.completed ? "done" : "todo"}`} title={c.name}>
            <img src={portrait(c)} alt={c.name} loading="lazy" />
            <span>{c.name}</span>
            {c.completed && <div className="check">✓</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: App shell with remember + polling**

Create `frontend/src/App.jsx`:
```jsx
import React, { useEffect, useState, useCallback } from "react";
import AccountForm from "./components/AccountForm.jsx";
import ChecklistGrid from "./components/ChecklistGrid.jsx";
import { getCurrent, getChecklist, getStatus } from "./api.js";

export default function App() {
  const [account, setAccount] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [status, setStatus] = useState(null);

  // remember: on load, ask backend for the last-used account
  useEffect(() => { getCurrent().then((a) => a && setAccount(a)); }, []);

  const refresh = useCallback(async (id) => {
    setChecklist(await getChecklist(id));
    setStatus(await getStatus(id));
  }, []);

  useEffect(() => {
    if (!account) return;
    refresh(account.id);
    const t = setInterval(() => refresh(account.id), 10000);
    return () => clearInterval(t);
  }, [account, refresh]);

  if (!account) return <AccountForm onCreated={setAccount} />;

  return (
    <div className="app">
      <header>
        <span>{account.game_name}#{account.tag_line} · {account.server}</span>
        <button onClick={() => setAccount(null)}>Change account</button>
      </header>
      {status?.backfill_status === "running" && (
        <p className="banner">Scanning history… {status.backfill_progress} matches processed</p>
      )}
      <ChecklistGrid data={checklist} />
    </div>
  );
}
```

- [ ] **Step 6: Styles**

Create `frontend/src/styles.css`:
```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0e1015; color: #e8eaed; font-family: system-ui, sans-serif; }
.account-form { max-width: 420px; margin: 12vh auto; display: flex; flex-direction: column; gap: 12px; padding: 0 16px; }
.account-form h1 { text-align: center; }
.riot-id { display: flex; align-items: center; gap: 8px; }
.riot-id input, select, button { padding: 10px; border-radius: 8px; border: 1px solid #2a2e38; background: #161922; color: inherit; }
.backfill { display: flex; gap: 8px; align-items: center; font-size: 14px; }
button { cursor: pointer; }
.error { color: #ff6b6b; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.app header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.banner { background: #1d2530; padding: 8px 12px; border-radius: 8px; }
.progress { margin-bottom: 16px; }
.bar { height: 8px; background: #1d212b; border-radius: 999px; margin-top: 6px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #c89b3c, #f0e6d2); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; }
.champ { position: relative; text-align: center; font-size: 11px; opacity: 0.35; filter: grayscale(1); transition: 0.15s; }
.champ.done { opacity: 1; filter: none; }
.champ img { width: 100%; border-radius: 8px; display: block; }
.champ .check { position: absolute; top: 4px; right: 4px; background: #2ecc71; color: #07210f; border-radius: 50%; width: 18px; height: 18px; font-size: 12px; line-height: 18px; }
```

- [ ] **Step 7: Build + manual verification against backend**

```bash
# Terminal A — backend (needs a valid dev key in backend/.env)
cd backend && cp -n .env.example .env  # then edit RIOT_API_KEY
python -m uvicorn app.main:app --reload

# Terminal B — frontend dev server (proxies /api to :8000)
cd frontend && npm install && npm run dev
```
Open the printed Vite URL. Enter a real Riot ID + server, submit. Expected:
- Account resolves; checklist grid renders all champions greyed out.
- If backfill checked, "Scanning history…" banner appears and champions you've won with light up within a poll cycle.
- Reload the page → it remembers the account (skips the form) and reopens the checklist.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: React + Vite checklist UI with remember + live refresh"
```

---

### Task 13: Production packaging (Docker) + README

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Produces a single container image: builds the frontend, copies the static bundle into the backend, serves API + static from uvicorn. `docker compose up` runs the whole app with a persisted SQLite volume.
- Modify `backend/app/main.py`: mount static files if `app/static` exists (added below).

- [ ] **Step 1: Serve the built frontend from FastAPI**

Add to the END of `create_app()` in `backend/app/main.py`, just before `return app`:
```python
    import os
    from fastapi.staticfiles import StaticFiles
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
```

- [ ] **Step 2: Multi-stage Dockerfile**

Create `backend/Dockerfile`:
```dockerfile
# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build   # outputs to ../backend/app/static via vite.config.js

# --- Stage 2: backend ---
FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .
COPY backend/app ./app
# bring in the built static bundle
COPY --from=frontend /backend/app/static ./app/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> Note: the Dockerfile build context must be the project root so both `frontend/` and `backend/` are visible. The frontend stage writes to `/backend/app/static`; adjust `WORKDIR`/paths only if you change the repo layout.

Because `vite.config.js` writes to `../backend/app/static`, set the frontend stage up so that path resolves. Use this corrected layout for the frontend stage:
```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /src
COPY frontend ./frontend
COPY backend ./backend
WORKDIR /src/frontend
RUN npm install && npm run build   # writes to /src/backend/app/static
```
And in stage 2 copy with:
```dockerfile
COPY --from=frontend /src/backend/app/static ./app/static
```

- [ ] **Step 3: docker-compose with persistent DB volume**

Create `docker-compose.yml`:
```yaml
services:
  arena:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    environment:
      RIOT_API_KEY: ${RIOT_API_KEY}
      DATABASE_URL: sqlite:////data/arena.db
      POLL_INTERVAL_SECONDS: "90"
      DEFAULT_REGION: europe
    volumes:
      - arena-data:/data

volumes:
  arena-data:
```

- [ ] **Step 4: README**

Create `README.md`:
```markdown
# Arena God Tracker

Auto-tracks the League of Legends Arena God challenge. Enter a Riot ID; it
backfills past Arena (queue 1700) 1st-place finishes and live-polls for new
ones, ticking each champion off a checklist. No AI, no scraping — official
Riot Match-V5 API + Data Dragon only.

## Local dev

Backend (needs a dev key from https://developer.riotgames.com):
```
cd backend
cp .env.example .env        # set RIOT_API_KEY
pip install -e ".[dev]"
python -m pytest            # run tests
uvicorn app.main:app --reload
```
Frontend (proxies /api to :8000):
```
cd frontend && npm install && npm run dev
```

## Production (single container)
```
RIOT_API_KEY=RGAPI-... docker compose up --build
```
App at http://localhost:8000 . SQLite persists in the `arena-data` volume.

## Notes
- Dev keys expire every 24h — regenerate from the Riot developer portal and
  restart (or update `.env`).
- For a shared/hosted deploy, apply for a production key.
- Default region is `europe` (EUW/EUNE/TR); pick your server in the UI.
```

- [ ] **Step 5: Verify the container build + run**

```bash
cd "Arena Tracker"
RIOT_API_KEY=$(grep RIOT_API_KEY backend/.env | cut -d= -f2) docker compose up --build -d
curl -s localhost:8000/api/servers
```
Expected: JSON with the servers list. Open http://localhost:8000 → the UI loads and the account-remember flow works end to end.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Docker packaging + README"
```

---

## Self-Review

- **Spec coverage:** §3 stack (Tasks 1,5,10,12,13) · §4 architecture/poll/idempotency (Tasks 7,9,11) · §5 data model (Task 4) · §6 Riot integration + routing + rate limit + retry (Tasks 2,3,5) · §7 Data Dragon + new-champion growth (Task 6) · §8 API surface (Task 10) · §2 remember account (Tasks 8,10,12) · §2 backfill→live fallback (Task 9: empty history → `backfill_status="done"`, then poll) · §2 local-first + prod-ready (Task 13) · §10 policy: no augment/winrate (never built). All covered.
- **No-AI constraint:** no LLM/SDK anywhere in the plan. ✓
- **Type consistency:** `resolve_routing → (routing, platform)` used consistently; `process_match(...) -> bool` consumed by poller; `build_checklist` shape matches frontend consumption (`version`, `champions[].image_filename`, `completed`, `first_win_match_id`). ✓
- **Champion-name gotcha:** match by `Champion.id == championName` (Task 7), seeded/synced consistently (Task 6). ✓
- **Open assumptions (from spec §11):** poll 90s, backfill exhausts history, no auth, 10s UI refresh — all reflected.
