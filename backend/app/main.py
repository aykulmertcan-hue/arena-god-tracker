from fastapi import FastAPI

from app.api.routes import router


def create_app(start_worker: bool = True) -> FastAPI:
    app = FastAPI(title="Arena God Tracker")
    app.include_router(router, prefix="/api")
    # DB init, Data Dragon sync, and worker startup are wired in Task 11.
    app.state.start_worker = start_worker
    return app


app = create_app()
