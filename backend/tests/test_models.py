import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from app.models import WatchedAccount, ProcessedMatch


def test_can_insert_and_query_account(session):
    acct = WatchedAccount(
        game_name="Faker", tag_line="KR1", puuid="puuid-1",
        routing="asia", platform="kr",
    )
    session.add(acct)
    session.commit()
    got = session.exec(select(WatchedAccount)).first()
    assert got.puuid == "puuid-1"
    assert got.backfill_status == "none"
    assert got.is_active is True


def test_processed_match_unique_per_account(session):
    session.add(ProcessedMatch(
        watched_account_id=1, match_id="EUW1_1",
        champion_name="Aatrox", subteam_placement=1,
    ))
    session.commit()
    session.add(ProcessedMatch(
        watched_account_id=1, match_id="EUW1_1",
        champion_name="Aatrox", subteam_placement=1,
    ))
    with pytest.raises(IntegrityError):
        session.commit()
