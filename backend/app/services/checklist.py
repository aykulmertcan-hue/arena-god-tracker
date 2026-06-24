from sqlmodel import Session, select

from app.models import Champion, ChecklistEntry


def build_checklist(session: Session, account_id: int) -> dict:
    rows = session.exec(
        select(Champion, ChecklistEntry)
        .join(ChecklistEntry, ChecklistEntry.champion_key == Champion.key)
        .where(ChecklistEntry.watched_account_id == account_id)
        .order_by(Champion.name)
    ).all()
    champions = []
    completed = 0
    version = None
    for champ, entry in rows:
        version = champ.ddragon_version
        if entry.completed:
            completed += 1
        champions.append({
            "key": champ.key,
            "id": champ.id,
            "name": champ.name,
            "image_filename": champ.image_filename,
            "completed": entry.completed,
            "first_win_match_id": entry.first_win_match_id,
        })
    return {"total": len(champions), "completed": completed,
            "champions": champions, "version": version}
