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
