from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session

from app.deps import get_session, get_riot_client
from app.config import settings
from app.riot.routing import SERVERS, resolve_routing
from app.riot.client import AccountNotFound, InvalidApiKey
from app.services.accounts import create_or_get_account, get_last_used
from app.services.checklist import build_checklist
from app.models import WatchedAccount

router = APIRouter()


class CreateAccountBody(BaseModel):
    game_name: str
    tag_line: str
    server: str
    backfill: bool = True


def _summary(acct: WatchedAccount) -> dict:
    return {
        "id": acct.id, "game_name": acct.game_name, "tag_line": acct.tag_line,
        "server": acct.platform.upper(), "backfill_status": acct.backfill_status,
    }


@router.get("/servers")
def servers():
    default = "EUW1" if settings.default_region == "europe" else SERVERS[0]
    return {"servers": SERVERS, "default": default}


@router.post("/accounts")
async def create_account(
    body: CreateAccountBody,
    session: Session = Depends(get_session),
    riot=Depends(get_riot_client),
):
    try:
        resolve_routing(body.server)
    except ValueError:
        raise HTTPException(400, f"Unknown server: {body.server}")
    try:
        acct = await create_or_get_account(
            session, riot, body.game_name, body.tag_line, body.server, body.backfill
        )
    except AccountNotFound:
        raise HTTPException(404, "Riot ID not found")
    except InvalidApiKey:
        raise HTTPException(502, "Riot API key invalid or expired")
    return _summary(acct)


@router.get("/accounts/current")
def current(session: Session = Depends(get_session)):
    acct = get_last_used(session)
    if not acct:
        return Response(status_code=204)
    return _summary(acct)


@router.get("/accounts/{account_id}/checklist")
def checklist(account_id: int, session: Session = Depends(get_session)):
    if not session.get(WatchedAccount, account_id):
        raise HTTPException(404, "account not found")
    return build_checklist(session, account_id, season_start_ms=settings.season_start_ms)


@router.get("/accounts/{account_id}/status")
def status(account_id: int, session: Session = Depends(get_session)):
    acct = session.get(WatchedAccount, account_id)
    if not acct:
        raise HTTPException(404, "account not found")
    return {
        "backfill_status": acct.backfill_status,
        "backfill_progress": acct.backfill_progress,
        "last_polled_at": acct.last_polled_at,
    }
