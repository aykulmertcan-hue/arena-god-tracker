from app.config import Settings


def test_defaults_apply_when_env_absent():
    s = Settings(_env_file=None)
    assert s.database_url == "sqlite:///./arena.db"
    assert s.poll_interval_seconds == 90
    assert s.default_region == "europe"
    assert s.ddragon_check_interval_hours == 24


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "30")
    monkeypatch.setenv("RIOT_API_KEY", "RGAPI-test")
    s = Settings(_env_file=None)
    assert s.poll_interval_seconds == 30
    assert s.riot_api_key == "RGAPI-test"
