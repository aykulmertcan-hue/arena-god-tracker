from app.services.checklist import build_checklist
from app.models import WatchedAccount, Champion, ChecklistEntry


def test_build_checklist_reports_totals_and_sorted(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="p", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=2, id="Zac", name="Zac", image_filename="Zac.png", ddragon_version="v"))
    session.add(Champion(key=1, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
    session.commit(); session.refresh(acct)
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=1, completed=True, first_win_match_id="M1"))
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=2, completed=False))
    session.commit()

    view = build_checklist(session, acct.id)
    assert view["total"] == 2
    assert view["completed"] == 1
    assert [c["name"] for c in view["champions"]] == ["Aatrox", "Zac"]
    assert view["champions"][0]["completed"] is True
    assert view["champions"][0]["first_win_match_id"] == "M1"
