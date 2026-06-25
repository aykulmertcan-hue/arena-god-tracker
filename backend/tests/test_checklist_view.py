from app.services.checklist import build_checklist
from app.models import WatchedAccount, Champion, ProcessedMatch


def _setup(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="me", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=2, id="Zac", name="Zac", image_filename="Zac.png", ddragon_version="v"))
    session.add(Champion(key=1, id="Aatrox", name="Aatrox", image_filename="Aatrox.png", ddragon_version="v"))
    session.commit(); session.refresh(acct)
    return acct


def test_all_time_counts_every_first_place_sorted(session):
    acct = _setup(session)
    # Aatrox won (ts 2000), Zac won (ts 500); both 1st place
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_A", champion_name="Aatrox", subteam_placement=1, game_end_ts=2000))
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_Z", champion_name="Zac", subteam_placement=1, game_end_ts=500))
    session.commit()

    view = build_checklist(session, acct.id)  # no season -> all-time
    assert view["total"] == 2
    assert view["completed"] == 2
    assert [c["name"] for c in view["champions"]] == ["Aatrox", "Zac"]  # sorted by name
    assert view["champions"][0]["first_win_match_id"] == "M_A"


def test_season_filter_excludes_pre_season_wins(session):
    acct = _setup(session)
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_A", champion_name="Aatrox", subteam_placement=1, game_end_ts=2000))  # in season
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_Z", champion_name="Zac", subteam_placement=1, game_end_ts=500))     # pre season
    session.commit()

    view = build_checklist(session, acct.id, season_start_ms=1000)
    assert view["completed"] == 1
    aatrox = next(c for c in view["champions"] if c["name"] == "Aatrox")
    zac = next(c for c in view["champions"] if c["name"] == "Zac")
    assert aatrox["completed"] is True and aatrox["first_win_match_id"] == "M_A"
    assert zac["completed"] is False and zac["first_win_match_id"] is None


def test_non_first_place_does_not_count(session):
    acct = _setup(session)
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_A", champion_name="Aatrox", subteam_placement=2, game_end_ts=2000))
    session.commit()
    view = build_checklist(session, acct.id)
    assert view["completed"] == 0


def test_earliest_in_window_win_is_reported(session):
    acct = _setup(session)
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_LATE", champion_name="Aatrox", subteam_placement=1, game_end_ts=3000))
    session.add(ProcessedMatch(watched_account_id=acct.id, match_id="M_EARLY", champion_name="Aatrox", subteam_placement=1, game_end_ts=1500))
    session.commit()
    view = build_checklist(session, acct.id, season_start_ms=1000)
    aatrox = next(c for c in view["champions"] if c["name"] == "Aatrox")
    assert aatrox["first_win_match_id"] == "M_EARLY"
