import datetime

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    riot_api_key: str = ""
    database_url: str = "sqlite:///./arena.db"
    poll_interval_seconds: int = 90
    default_region: str = "europe"
    ddragon_check_interval_hours: int = 24
    # Arena God resets each ranked season/split. The checklist counts only
    # 1st-places on/after this date. LoL 2026 Season 2 (Act: Pandemonium)
    # started 2026-04-29 (Patch 26.09). Update when the next season begins.
    # Set to empty string to count all-time instead.
    season_start: str = "2026-04-29"

    @property
    def season_start_ms(self) -> int | None:
        if not self.season_start:
            return None
        dt = datetime.datetime.fromisoformat(self.season_start).replace(
            tzinfo=datetime.timezone.utc
        )
        return int(dt.timestamp() * 1000)


settings = Settings()
