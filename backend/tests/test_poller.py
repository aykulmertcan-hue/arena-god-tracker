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
