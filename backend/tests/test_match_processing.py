from datetime import datetime
from sqlmodel import select
from app.services.matches import extract_result, process_match
from app.models import WatchedAccount, Champion, ChecklistEntry, ProcessedMatch


def _match(puuid, champ_name, placement):
    return {
        "metadata": {"matchId": "EUW1_1"},
        "info": {"gameEndTimestamp": 1700000000000, "participants": [
            {"puuid": "other", "championName": "Zed", "subteamPlacement": 4},
            {"puuid": puuid, "championName": champ_name, "subteamPlacement": placement},
        ]},
    }


def _setup(session):
    acct = WatchedAccount(game_name="A", tag_line="B", puuid="me", routing="europe", platform="euw1")
    session.add(acct)
    session.add(Champion(key=62, id="MonkeyKing", name="Wukong", image_filename="MonkeyKing.png", ddragon_version="14.12.1"))
    session.commit(); session.refresh(acct)
    session.add(ChecklistEntry(watched_account_id=acct.id, champion_key=62))
    session.commit()
    return acct


def test_extract_result_finds_our_participant():
    assert extract_result(_match("me", "MonkeyKing", 1), "me") == ("MonkeyKing", 1)
    assert extract_result(_match("me", "MonkeyKing", 1), "ghost") is None


def test_first_place_marks_champion_complete(session):
    acct = _setup(session)
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    assert newly is True
    entry = session.exec(select(ChecklistEntry).where(ChecklistEntry.champion_key == 62)).first()
    assert entry.completed is True
    assert entry.first_win_match_id == "EUW1_1"


def test_non_first_place_records_but_does_not_complete(session):
    acct = _setup(session)
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 3))
    assert newly is False
    entry = session.exec(select(ChecklistEntry).where(ChecklistEntry.champion_key == 62)).first()
    assert entry.completed is False
    assert session.exec(select(ProcessedMatch)).first().subteam_placement == 3


def test_idempotent_second_call_is_noop(session):
    acct = _setup(session)
    process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    newly = process_match(session, acct, "EUW1_1", _match("me", "MonkeyKing", 1))
    assert newly is False
    assert len(session.exec(select(ProcessedMatch)).all()) == 1
