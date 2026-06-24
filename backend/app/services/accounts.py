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
