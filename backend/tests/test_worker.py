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
