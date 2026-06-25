# Arena God Overlay

Cross-platform (Mac + Windows) champ-select overlay that shows which champions
you still need a 1st place with **this Arena season**. Reads your logged-in
account from the local League client (LCU) automatically, scans your Arena
match history via the official Riot API, and pops a transparent always-on-top
window during Arena champ select.

No AI. No scraping. Official Riot Match-V5 API + Data Dragon only. Placement
(1st-place) tracking only — no augment/item win-rate (Riot policy).

## How it works

1. **LCU auto-detect** — finds the running League client, reads your puuid +
   region (no Riot ID typing) and watches the gameflow phase.
2. **Scan engine** — backfills your Arena history (queues **1700 + 1750**),
   then incrementally fetches only new matches. A champion counts as done when
   `subteamPlacement == 1`. Season filter (`seasonStart`, default 2026-04-29 =
   LoL 2026 Season 2) mirrors the in-game Arena God challenge, which resets each
   season.
3. **Overlay** — during Arena champ select it shows the still-needed champions.

## Setup (your own Riot dev key, for now)

You need a Riot **development key** from https://developer.riotgames.com
(free; expires every 24h — regenerate daily).

```
cd overlay
npm install
npm run dev          # launches the overlay (League client should be running)
```

On first launch, paste your `RGAPI-...` key in the window. It's stored locally
in Electron's userData (`store.json`), never committed.

For development you can also set `RIOT_API_KEY` in the environment, and
`OVERLAY_ALWAYS_SHOW=1` to keep the window visible without being in champ select.

## Verify the scan engine without the GUI

```
RIOT_API_KEY=RGAPI-... RIOT_ID="Name#TAG" SERVER=TR1 npm run scan
```
Prints the season + all-time counts and the still-needed champions — proves the
engine against the real API.

## Tests

```
npm test          # vitest: routing, rate limiter, scanner, season filter, LCU parsers
npm run typecheck
```

## Build / package

```
npm run build     # bundles main + preload + renderer
npm run package   # electron-builder -> dmg (Mac) / nsis (Windows)
```

## Config

`store.json` `settings`: `riotApiKey`, `seasonStart` (ISO date; empty = all-time).

## Notes / limits

- Match-V5 retains ~2 years / ~1000 matches per queue, so very old wins may be
  beyond the API. The in-client cumulative count (Challenges-V1 `602002`) can be
  slightly higher.
- LCU is an unofficial, unsupported API — it can change on patches. KR players
  are not permitted to use LCU-based apps. Overlays must be Vanguard-compatible.
- Distribution to friends without per-user dev keys needs a hosted backend +
  production key (future phase).
