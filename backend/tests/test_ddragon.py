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
