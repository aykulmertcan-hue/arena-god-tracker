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
