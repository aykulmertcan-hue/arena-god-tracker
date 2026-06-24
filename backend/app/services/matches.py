from datetime import datetime

from sqlmodel import Session, select

from app.models import Champion, ChecklistEntry, ProcessedMatch, WatchedAccount


def extract_result(match_data: dict, puuid: str) -> tuple[str, int] | None:
    for p in match_data["info"]["participants"]:
        if p["puuid"] == puuid:
            return p["championName"], p["subteamPlacement"]
    return None


def process_match(
    session: Session, account: WatchedAccount, match_id: str, match_data: dict
) -> bool:
    already = session.exec(
        select(ProcessedMatch).where(
            ProcessedMatch.watched_account_id == account.id,
            ProcessedMatch.match_id == match_id,
        )
    ).first()
    if already:
        return False

    result = extract_result(match_data, account.puuid)
    if result is None:
        return False
    champ_name, placement = result

    session.add(ProcessedMatch(
        watched_account_id=account.id,
        match_id=match_id,
        champion_name=champ_name,
        subteam_placement=placement,
        game_end_ts=match_data["info"].get("gameEndTimestamp"),
    ))

    newly_completed = False
    if placement == 1:
        champ = session.exec(select(Champion).where(Champion.id == champ_name)).first()
        if champ:
            entry = session.exec(
                select(ChecklistEntry).where(
                    ChecklistEntry.watched_account_id == account.id,
                    ChecklistEntry.champion_key == champ.key,
                )
            ).first()
            if entry and not entry.completed:
                entry.completed = True
                entry.first_win_match_id = match_id
                entry.completed_at = datetime.utcnow()
                newly_completed = True

    session.commit()
    return newly_completed
