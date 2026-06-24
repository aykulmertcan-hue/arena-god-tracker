from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    riot_api_key: str = ""
    database_url: str = "sqlite:///./arena.db"
    poll_interval_seconds: int = 90
    default_region: str = "europe"
    ddragon_check_interval_hours: int = 24


settings = Settings()
