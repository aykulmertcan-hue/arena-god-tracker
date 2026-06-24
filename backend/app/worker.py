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
