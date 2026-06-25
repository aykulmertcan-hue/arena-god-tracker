from sqlmodel import select
from app.services.poller import poll_account, run_backfill
from app.models import WatchedAccount, Champion, ChecklistEntry, ProcessedMatch


class FakeRiot:
    def __init__(self, pages_by_queue, matches):
        # pages_by_queue: dict queue_id -> list of pages (each page a list of ids).
        # Queues not present return [] immediately. Pages served sequentially per
        # queue, regardless of the start offset (test helper).
        self._pages = pages_by_queue
        self._matches = matches
        self._idx = {}  # queue -> next page index

    async def get_arena_match_ids(self, puuid, routing, queue, start=0, count=100):
        pages = self._pages.get(queue, [])
        i = self._idx.get(queue, 0)
        if i >= len(pages):
            return []
        self._idx[queue] = i + 1
        return pages[i]

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
    riot = FakeRiot({1700: [["EUW1_1"]]}, {"EUW1_1": _win("EUW1_1", "me", "Aatrox")})
    newly = await poll_account(session, riot, acct.id)
    assert newly == 1
    entry = session.exec(select(ChecklistEntry)).first()
    assert entry.completed is True
    session.refresh(acct)
    assert acct.last_polled_at is not None


async def test_run_backfill_paginates_then_marks_done(session):
    acct = _setup(session)
    riot = FakeRiot({1700: [["EUW1_1"], []]}, {"EUW1_1": _win("EUW1_1", "me", "Aatrox")})
    total = await run_backfill(session, riot, acct.id, page_size=100)
    assert total == 1
    session.refresh(acct)
    assert acct.backfill_status == "done"
    assert len(session.exec(select(ProcessedMatch)).all()) == 1


async def test_backfill_scans_current_arena_queue_1750(session):
    # Regression: Arena moved from queue 1700 to 1750. A win that only exists
    # under queue 1750 must still be found.
    acct = _setup(session)
    riot = FakeRiot({1750: [["TR1_2"]]}, {"TR1_2": _win("TR1_2", "me", "Aatrox")})
    total = await run_backfill(session, riot, acct.id)
    assert total == 1
    entry = session.exec(select(ChecklistEntry)).first()
    assert entry.completed is True


async def test_backfill_empty_history_marks_done(session):
    acct = _setup(session)
    riot = FakeRiot({}, {})
    total = await run_backfill(session, riot, acct.id)
    assert total == 0
    session.refresh(acct)
    assert acct.backfill_status == "done"
