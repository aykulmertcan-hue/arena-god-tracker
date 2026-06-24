from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class WatchedAccount(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    game_name: str
    tag_line: str
    puuid: str = Field(index=True, unique=True)
    routing: str
    platform: str
    backfill_status: str = "none"  # none | running | done
    backfill_progress: int = 0
    last_polled_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Champion(SQLModel, table=True):
    key: int = Field(primary_key=True)        # Riot numeric champ id
    id: str = Field(index=True)               # Data Dragon string id e.g. "MonkeyKing"
    name: str                                 # display name e.g. "Wukong"
    image_filename: str
    ddragon_version: str


class ChecklistEntry(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("watched_account_id", "champion_key"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    watched_account_id: int = Field(foreign_key="watchedaccount.id", index=True)
    champion_key: int = Field(foreign_key="champion.key")
    completed: bool = False
    first_win_match_id: Optional[str] = None
    completed_at: Optional[datetime] = None


class ProcessedMatch(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("watched_account_id", "match_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    watched_account_id: int = Field(foreign_key="watchedaccount.id", index=True)
    match_id: str
    champion_name: str
    subteam_placement: int
    game_end_ts: Optional[int] = None
    processed_at: datetime = Field(default_factory=datetime.utcnow)


class AppState(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
