from sqlmodel import Session, select

from app.models import Champion, ProcessedMatch


def build_checklist(
    session: Session, account_id: int, season_start_ms: int | None = None
) -> dict:
    """Champion checklist for an account.

    A champion counts as completed when the account has a 1st-place Arena
    finish (subteam_placement == 1) with it. When ``season_start_ms`` is given,
    only wins on/after that timestamp count — this mirrors the in-game Arena God
    challenge, which resets each ranked season. Champion match is by
    ``Champion.id == ProcessedMatch.champion_name`` (the match-v5 championName
    is the Data Dragon string id, e.g. "MonkeyKing").
    """
    win_q = select(
        ProcessedMatch.champion_name,
        ProcessedMatch.match_id,
        ProcessedMatch.game_end_ts,
    ).where(
        ProcessedMatch.watched_account_id == account_id,
        ProcessedMatch.subteam_placement == 1,
    )
    if season_start_ms is not None:
        win_q = win_q.where(ProcessedMatch.game_end_ts >= season_start_ms)

    won: dict[str, tuple[int, str]] = {}  # championName(id) -> (earliest_ts, match_id)
    for name, match_id, ts in session.exec(win_q).all():
        t = ts if ts is not None else 0
        if name not in won or t < won[name][0]:
            won[name] = (t, match_id)

    champions = []
    completed = 0
    version = None
    for champ in session.exec(select(Champion).order_by(Champion.name)).all():
        version = champ.ddragon_version
        win = won.get(champ.id)
        is_done = win is not None
        if is_done:
            completed += 1
        champions.append({
            "key": champ.key,
            "id": champ.id,
            "name": champ.name,
            "image_filename": champ.image_filename,
            "completed": is_done,
            "first_win_match_id": win[1] if win else None,
        })
    return {"total": len(champions), "completed": completed,
            "champions": champions, "version": version,
            "season_start_ms": season_start_ms}
