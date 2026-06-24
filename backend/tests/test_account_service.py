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
