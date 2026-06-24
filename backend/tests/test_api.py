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
