# Arena God Tracker

Auto-tracks the League of Legends Arena God challenge. Enter a Riot ID; it
backfills past Arena (queue 1700) 1st-place finishes and live-polls for new
ones, ticking each champion off a checklist. No AI, no scraping — official
Riot Match-V5 API + Data Dragon only.

## Local dev

Backend (needs a dev key from https://developer.riotgames.com):

```
cd backend
cp .env.example .env        # set RIOT_API_KEY
pip install -e ".[dev]"
python -m pytest            # run tests
uvicorn app.main:app --reload
```

Frontend (proxies /api to :8000):

```
cd frontend && npm install && npm run dev
```

## Production (single container)

```
RIOT_API_KEY=RGAPI-... docker compose up --build
```

App at http://localhost:8000 . SQLite persists in the `arena-data` volume.

## Notes

- Dev keys expire every 24h — regenerate from the Riot developer portal and
  restart (or update `.env`).
- For a shared/hosted deploy, apply for a production key.
- Default region is `europe` (EUW/EUNE/TR); pick your server in the UI.
