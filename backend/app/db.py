from sqlmodel import SQLModel, create_engine
import app.models  # noqa: F401  (register tables)


def make_engine(url: str):
    return create_engine(url, connect_args={"check_same_thread": False})


def init_db(engine) -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
