# Riot API Reference — Arena God Tracker

A comprehensive reference for every Riot API surface used (or evaluated) by this app: Account-V1, Match-V5, Challenges-V1, and Data Dragon. All facts verified against official sources and authoritative community docs; ambiguities are explicitly flagged.

---

## Quick Reference Tables

### Endpoints the App Calls

| Purpose | API | Routing | Endpoint |
|---|---|---|---|
| Resolve Riot ID → PUUID | Account-V1 | Regional | `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` |
| Backfill Arena match IDs | Match-V5 | Regional | `GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1700&count=100` |
| Fetch match detail | Match-V5 | Regional | `GET /lol/match/v5/matches/{matchId}` |
| (Evaluation) Player challenge progress | Challenges-V1 | Platform | `GET /lol/challenges/v1/player-data/{puuid}` |
| Champion list + images | Data Dragon | CDN (no auth) | `GET /cdn/{version}/data/en_US/champion.json` |

### Routing Map

| Platform | Regional Cluster | Notes |
|---|---|---|
| NA1 | americas | North America |
| BR1 | americas | Brazil |
| LA1 | americas | Latin America North |
| LA2 | americas | Latin America South |
| EUW1 | europe | EU West |
| EUN1 | europe | EU Nordic & East |
| TR1 | europe | Turkey |
| RU | europe | Russia |
| ME1 | europe | Middle East |
| KR | asia | Korea |
| JP1 | asia | Japan |
| OC1 | sea | Oceania |
| PH2 | sea | Philippines |
| SG2 | sea | Singapore |
| TH2 | sea | Thailand |
| TW2 | sea | Taiwan |
| VN2 | sea | Vietnam |

**Account-V1 note**: Only `americas`, `asia`, and `europe` are supported. SEA is not available for Account-V1. (Source: GitHub developer-relations issue #394)

### Rate Limits Summary

| Key Type | App Limit | Notes |
|---|---|---|
| Development | 20 req/s + 100 req/2 min | Expires every 24h; per-region |
| Personal | 20 req/s + 100 req/2 min | Non-expiring; same limits as dev |
| Production | 500 req/10s + 30,000 req/10min | Expandable; requires approval |

---

## 1. Authentication & API Keys

Source: https://developer.riotgames.com/docs/portal | https://hextechdocs.dev/getting-started-with-the-riot-games-api/

### Key in Requests

Pass your key in the `X-Riot-Token` request header (preferred). Alternatively append `?api_key=YOUR_KEY` as a query parameter, but the header form is the documented standard.

```
X-Riot-Token: RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Key Types

**Development Key**
- Automatically generated at https://developer.riotgames.com when you log in.
- Expires every 24 hours — you must manually regenerate it.
- Rate limits: 20 requests/second and 100 requests/2 minutes, per region.
- Intended for local prototyping only. Using a dev key in production is against policy.

**Personal Key**
- Applied for at https://developer.riotgames.com (register a product).
- Does not expire. Approval process is lighter than production (no prototype required).
- Same rate limits as development keys (20/s, 100/2min) — no increases available.
- Allowed uses: personal bots, displaying your own stats, private community tools, research.
- Not for public-facing apps or open beta.

**Production Key**
- Requires a working prototype and formal review by Riot's DevRel team.
- Approval takes roughly 20 business days (per community sources).
- Default limits: 500 requests/10 seconds and 30,000 requests/10 minutes, per region.
- Limits can be expanded for established apps demonstrating community benefit.
- Submit at https://developer.riotgames.com; communicate through the portal's Messages tab.

### Obtaining a Key

1. Log in at https://developer.riotgames.com with your Riot account.
2. A development key is auto-displayed. Click "Regenerate API Key" when it expires.
3. For personal/production: click "Register Product" and fill in the application form.
4. Riot evaluates whether the product benefits the ecosystem and complies with policy.

---

## 2. Rate Limits

Source: https://hextechdocs.dev/rate-limiting/ | https://developer.riotgames.com/docs/portal

### Three Types of Rate Limits

| Type | Scope | Enforced By |
|---|---|---|
| Application | All requests for your API key in a region | API edge infrastructure |
| Method | Per endpoint, per key, per region | API edge infrastructure |
| Service | Across all apps hitting a backend service | Riot's backend (not your key) |

All limits are **per-region** — each regional cluster (americas, europe, asia, sea) has independent counters.

### Response Headers (Always Read These)

| Header | Content |
|---|---|
| `X-App-Rate-Limit` | Your key's app-level limits, format: `calls:windowSeconds,...` |
| `X-App-Rate-Limit-Count` | How many app-level calls you've made in each window |
| `X-Method-Rate-Limit` | Per-endpoint limits for this specific endpoint |
| `X-Method-Rate-Limit-Count` | How many method-level calls you've made in each window |
| `X-Rate-Limit-Type` | On a 429: `application`, `method`, or `service` |
| `Retry-After` | On a 429: seconds to wait before retrying |

Example header pair:
```
X-App-Rate-Limit: 20:1,100:120
X-App-Rate-Limit-Count: 5:1,32:120
```
This means: limit is 20/1s and 100/120s; you've made 5 and 32 calls respectively.

### Handling 429 (Rate Limit Exceeded)

- **If `X-Rate-Limit-Type` and `Retry-After` are present**: Honor the `Retry-After` value (in seconds) before retrying. Do not hardcode wait times — read the header.
- **If no `X-Rate-Limit-Type` header** (service-level enforcement): Use exponential backoff, starting at ~1 second. Riot's backend enforced this regardless of your key's limits.
- **Never loop-retry without delay** — Riot permanently blacklists keys that abuse the API. All requests from a blacklisted key return 403, even after regeneration.

### Development Key Limits (confirmed)

20 requests per second AND 100 requests per 2 minutes, per region. These are separate rolling windows enforced simultaneously — the stricter one applies at any moment.

---

## 3. Routing

Source: https://darkintaqt.com/blog/routing | https://developer.riotgames.com/docs/lol

### Two Routing Levels

**Platform routing** — specific server instance. Used by: Summoner-V4, League-V4, Challenges-V1, and most LoL-specific endpoints.
- Host format: `{platform}.api.riotgames.com`
- Example: `https://na1.api.riotgames.com/lol/challenges/v1/player-data/{puuid}`

**Regional routing** — continent cluster. Used by: Account-V1, Match-V5.
- Host format: `{region}.api.riotgames.com`
- Example: `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids`

### Which API Uses Which Routing

| API | Routing Level | Values |
|---|---|---|
| Account-V1 | Regional | americas, asia, europe (NO sea) |
| Match-V5 | Regional | americas, asia, europe, sea |
| Challenges-V1 | Platform | na1, euw1, kr, jp1, etc. |
| Summoner-V4 | Platform | na1, euw1, kr, jp1, etc. |
| League-V4 | Platform | na1, euw1, kr, jp1, etc. |

For an NA player: Account-V1 and Match-V5 both use `americas.api.riotgames.com`. Challenges-V1 uses `na1.api.riotgames.com`.

---

## 4. Account-V1

Source: https://developer.riotgames.com/api-details/account-v1

**Routing**: Regional (`americas`, `asia`, `europe` only — no `sea`)

### Endpoints

#### Get account by Riot ID
```
GET https://{region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}
```

#### Get account by PUUID
```
GET https://{region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/{puuid}
```

### Response Shape (AccountDto)

```json
{
  "puuid": "...",        // Exactly 78 characters, encrypted
  "gameName": "Mertcan", // May be absent if account has no game name
  "tagLine": "TR1"       // May be absent if account has no tag line
}
```

### Key Notes

- **PUUID is the stable identifier** — use it for all downstream calls (Match-V5, Challenges-V1). Never rely on summoner IDs, which are scoped to a region and deprecated for cross-region lookups.
- **URL encoding**: `gameName` and `tagLine` must be percent-encoded in the URL path. In Python: `urllib.parse.quote(game_name)`. Spaces become `%20`. Example: `Riot%20Games` and `NA1`.
- **Regional selection**: Pick the cluster nearest to your user for lowest latency. For a Turkish player use `europe.api.riotgames.com`. For backfill jobs, any cluster works.
- **SEA gap**: If you ever need to look up a VN2/PH2/etc. account, you cannot use Account-V1 against the SEA cluster. Use `asia` or `europe` instead — Account-V1 data is replicated and accessible from any of the three supported regions.

---

## 5. Match-V5

Source: https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/MatchApiV5.html | https://github.com/RiotGames/developer-relations/issues/921 | https://github.com/RiotGames/developer-relations/issues/754 | https://pkg.go.dev/github.com/f1w/equinox/v2/clients/lol

**Routing**: Regional (`americas`, `asia`, `europe`, `sea`)

### 5.1 Get Match IDs by PUUID

```
GET https://{region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids
```

#### Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `queue` | int | (none) | Filter by queue ID. Use `1700` (or `1710`) for Arena. |
| `type` | string | (none) | Filter by match type: `ranked`, `normal`, `tourney`, `tutorial`. For Arena, use `"cherry"` OR leave unset and filter by queue. |
| `start` | int | 0 | Pagination offset. Start=0 returns first N, start=100 returns next N, etc. |
| `count` | int | 20 | Number of match IDs to return. **Max: 100.** |
| `startTime` | long | (none) | Epoch timestamp in seconds. Only matches AFTER this time. Earliest valid: June 16, 2021. |
| `endTime` | long | (none) | Epoch timestamp in seconds. Upper bound. |

**Returns**: `List[string]` — a list of match ID strings.

#### Arena-specific usage

```
GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1700&start=0&count=100
```

Paginate with `start=0`, `start=100`, `start=200`, etc., until fewer than `count` IDs are returned (or an empty array).

**Known limit**: Pagination beyond approximately start=990 returns empty. Match history is effectively limited to the most recent ~1000 matches AND the 2-year retention window (whichever is more restrictive). See §5.3.

**Type + Queue filter behavior**: The `type` and `queue` filters are mutually inclusive — a match must satisfy both if both are specified. For Arena, do NOT rely on a single queue id — see the verified Queue IDs table below (the id changed 1700 → 1750). Query each known Arena queue id, or filter by `gameMode == "CHERRY"` on match detail.

### 5.2 Get Match Detail

```
GET https://{region}.api.riotgames.com/lol/match/v5/matches/{matchId}
```

Returns a `MatchDto` containing `metadata` and `info`.

#### Arena-Relevant Info Fields (MatchDto.info)

| Field | Type | Notes |
|---|---|---|
| `queueId` | int | `1700` (legacy Arena) or `1750` (current Arena, 2026) — both `gameMode=CHERRY` |
| `gameMode` | string | `"CHERRY"` — the Arena game mode string |
| `gameDuration` | int | Seconds (for matches after patch 11.20). For older matches: milliseconds. Check for `gameEndTimestamp` to know which unit. |
| `gameEndTimestamp` | long | Unix ms timestamp when the match ended on the game server. Added patch 11.20 (Oct 2021). Use `gameStartTimestamp + max(timePlayed)` if more precise. |
| `endOfGameResult` | string | `"GameComplete"` for normal completions; `"Abort_Unexpected"` for crashes/abandoned games. Filter these out for the checklist. |

#### Arena-Relevant Participant Fields (MatchDto.info.participants[])

| Field | Type | Notes |
|---|---|---|
| `puuid` | string | Use to identify the target player |
| `championName` | string | The champion's string `id` from Data Dragon (e.g., `"MonkeyKing"` for Wukong) |
| `subteamPlacement` | int | **The field to use for Arena God tracking.** 1 = 1st place team. Range: 1–8 for an 8-team game. |
| `placement` | int | Individual placement within the subteam. Usually same as subteamPlacement in 2v2v2v2. |
| `playerSubteamId` | int | Which subteam the player was on (1–8). |
| `win` | bool | `true` if the player's team won. In Arena this may be `true` only for subteamPlacement==1. **Do not rely on this alone** — verify against subteamPlacement. |
| `gameEndedInEarlySurrender` | bool | `true` for remakes (game ended very early). **Exclude these from the checklist** — they don't count as valid Arena completions. |
| `playerAugment1`–`playerAugment6` | int | Augment IDs chosen by the player. Do not display win rates for these (see §8 Policy). |

**Important**: `subteamPlacement`, `placement`, `playerSubteamId`, and `playerAugment*` are **undocumented in the official schema** but confirmed present in Arena match responses. They were tracked in GitHub issue #754 (opened against developer-relations). They appear as `omitempty` fields and will be absent in non-Arena matches.

**Arena 1st place condition**: `participant.subteamPlacement == 1`

#### Queue IDs for Arena — VERIFIED live (TR, 2026-06-25)

⚠️ **The Arena queue ID changed over time. Filtering by a single queue silently misses matches.** Confirmed by live data on a TR account: matches up to 2026-05-04 were `queueId=1700`; matches from then through 2026-06-25 are `queueId=1750`. Both have `gameMode == "CHERRY"`.

| Queue ID | Description |
|---|---|
| 1700 | Legacy Arena (used through ~early/mid 2026). |
| 1750 | **Current Arena** (in use 2026-06, verified live). |
| 1710 | Sometimes cited for an 8-team Arena variant — NOT observed in this account's data; treat as unconfirmed. |

**Implication for the tracker:** scan **all** Arena queue ids, not just one. The app uses `ARENA_QUEUE_IDS = (1700, 1750)` and queries each. The most future-proof alternative is to drop the `queue` filter and keep any match whose detail has `gameMode == "CHERRY"` (costs more match-detail calls). When Riot rotates the queue id again, add the new id here. Always cross-check against Challenges-V1 `602002` (official all-time count) — if the scan is far below it, a queue id is probably missing.

### 5.3 Match History Retention

Source: https://www.riotgames.com/en/DevRel/match-history-retention-Change

Riot documented a rolling **2-year retention window** for match data (effective August 7, 2019). Match IDs and match details older than 2 years are deleted on a rolling basis.

**Practical implication for this app (as of mid-2026)**: Matches from before approximately June 2024 may no longer be accessible via Match-V5. The API does not return an error for unavailable matches — the match ID simply won't appear in the matchlist endpoint, and fetching a deleted match ID returns 404.

- `startTime` filter only works for matches after **June 16, 2021** (the Match-V5 launch date). Passing an earlier epoch is ignored.
- Additionally, pagination beyond `start=990` is known to return empty results regardless of retention.
- **Conclusion**: Backfill depth is bounded by the 2-year window. Communicate this limit to the user in the UI.

---

## 6. Challenges-V1

Source: https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/ChallengesApiV1.html | https://pkg.go.dev/github.com/f1w/equinox/v2/clients/lol | https://github.com/RiotGames/developer-relations/issues/633

**Routing**: Platform (`na1`, `euw1`, `kr`, etc.)

### 6.1 Endpoints

#### Get player challenge data (primary endpoint)
```
GET https://{platform}.api.riotgames.com/lol/challenges/v1/player-data/{puuid}
```

#### Get all challenge configs
```
GET https://{platform}.api.riotgames.com/lol/challenges/v1/challenges/config
```

#### Get config for one challenge
```
GET https://{platform}.api.riotgames.com/lol/challenges/v1/challenges/{challengeId}/config
```

#### Get percentiles for all challenges
```
GET https://{platform}.api.riotgames.com/lol/challenges/v1/challenges/percentiles
```

#### Get percentiles for one challenge
```
GET https://{platform}.api.riotgames.com/lol/challenges/v1/challenges/{challengeId}/percentiles
```

### 6.2 Player Data Response Shape

```json
{
  "totalPoints": {
    "level": "GOLD",
    "current": 1234,
    "max": 9999,
    "percentile": 0.45
  },
  "categoryPoints": {
    "TEAMWORK": { "level": "SILVER", "current": 200, "max": 1000, "percentile": 0.6 }
  },
  "challenges": [
    {
      "challengeId": 602002,
      "value": 80.0,
      "level": "SILVER",
      "percentile": 0.12,
      "achievedTime": 1717000000000,
      "position": 1500,
      "playersInLevel": 80000
    }
  ],
  "preferences": { ... }
}
```

ChallengeInfo per entry (`ChallengesChallengeInfoV1DTO`):

| Field | Type | Notes |
|---|---|---|
| `challengeId` | int64 | Identifies the challenge |
| `value` | float64 | **Numeric count / score for this challenge** |
| `level` | string | `"IRON"`, `"BRONZE"`, `"SILVER"`, `"GOLD"`, `"PLATINUM"`, `"DIAMOND"`, `"MASTER"`, `"GRANDMASTER"`, `"CHALLENGER"` |
| `percentile` | float64 | Where the player ranks (0.0–1.0, lower = rarer) |
| `achievedTime` | int64 | Unix ms timestamp of last level-up |
| `position` | int64 | Leaderboard position |
| `playersInLevel` | int64 | Players at same level |

### 6.3 The Arena God Challenge — correct IDs (VERIFIED live against TR API, 2026-06)

The relevant Arena challenge IDs (confirmed by querying `/challenges/config` + `/player-data` live — the earlier draft's `602000` was the parent *group*, not the "win with N champs" challenge):

| ID | Name (en_US) | Description | What `value` means |
|---|---|---|---|
| `602000` | **Arena Champion** | "Earn progress from challenges in the Arena Champion group" | Parent/group aggregate — NOT a clean count. |
| `602001` | **Arena Champion Ocean** | "Play Arena games with different champions" | # distinct champions **played** in Arena. |
| `602002` | **Adapt to All Situations** | "Place first in Arena games with different champions" | **# distinct champions you have placed 1st with — THIS is "Arena God".** |

So for tracking the Arena God goal, the authoritative count is **challenge `602002`**.

**Live verification (account `Mrtcn#9999`, TR):** `602002 value = 80.0` (level MASTER, percentile 0.002), `602001 = 157`, `602000 = 160`. Our Match-V5 backfill independently found **70** distinct 1st-place champions — fewer than the official 80 because Match-V5 only retains ~2 years / ~1000 matches, while the challenge count is all-time cumulative. The two are consistent (scan ≤ official), which validates the tool's detection logic.

### 6.4 CRITICAL: Does Challenges-V1 Return the Champion List?

**No. Challenges-V1 returns only a numeric count, not a list of champions.**

The `value` field for challenge `602002` is a float like `80.0`, meaning the player has placed 1st in Arena with 80 different champions. There is **no** field in the API response that enumerates *which* champions those wins were with.

**Implication for Arena God Tracker**: Challenges-V1 gives the total count (great as a one-call sanity check / "official" target number, and to detect when you're tracking the wrong account). But to know *which* champions are done (to populate the checklist), you must parse Match-V5 history and filter `subteamPlacement == 1` per unique `championName`. The two sources serve different purposes:

| Source | What it gives you |
|---|---|
| Challenges-V1 `value` for **602002** | Official all-time count of distinct champions won with (no list) |
| Match-V5 history with `subteamPlacement==1` | Specific champions + when each win occurred (bounded by ~2yr retention) |

> **Product idea:** call `602002` on add-account to show the official target (e.g. "80 per Riot") next to the scanned checklist — if the scan count is far below the official count, older wins are beyond Match-V5 retention; if the official count is wildly different from what the user expects, they're likely tracking the wrong Riot ID.

**Note on documentation gaps**: As of GitHub issue #633 (filed May 2022 and still pending), ChallengeInfo, PlayerClientPreferences, and ChallengePoints are noted as missing or incomplete in the official Riot docs. The structure above is derived from auto-generated Go SDK sources and is consistent with observed API behavior.

---

## 7. Data Dragon (+ Community Dragon)

Source: https://developer.riotgames.com/docs/lol | https://riot-api-libraries.readthedocs.io/en/latest/ddragon.html

Data Dragon is Riot's official static asset CDN. No API key required.

### Versions

```
GET https://ddragon.leagueoflegends.com/api/versions.json
```

Returns an array of version strings, newest first (e.g., `["16.13.1", "16.12.1", ...]`). Always use `versions[0]` for the latest.

### Champion Data

```
GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json
```

Returns a summary object with all champions. Use for building the champion checklist.

```
GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion/{ChampionName}.json
```

Returns detailed data for one champion (spell descriptions, etc.).

### Champion Images

```
https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{filename}
```

Where `{filename}` comes from the `image.full` field in champion.json (e.g., `MonkeyKing.png`).

### The `key` vs `id` vs `name` Distinction (Critical)

In `champion.json`, each champion entry has three identifier fields with confusing semantics:

| Field | Type | Example (Wukong) | Notes |
|---|---|---|---|
| `key` | string (numeric) | `"62"` | The champion's **integer ID stored as a string**. Used in some older endpoints. |
| `id` | string | `"MonkeyKing"` | The champion's **internal string identifier**. This is what Match-V5 `championName` returns. |
| `name` | string | `"Wukong"` | The **display name** shown in-game. |

**Match-V5 `participant.championName` = the `id` field in champion.json, NOT the `name` field.**

For the checklist, use `id` as your canonical champion key and `name` for display. To find a champion's image: look up by `id` → get `image.full` → build the CDN URL.

Example mapping:
```json
"MonkeyKing": {
  "id": "MonkeyKing",
  "key": "62",
  "name": "Wukong",
  "image": { "full": "MonkeyKing.png" }
}
```

### Community Dragon (Alternative)

**URL**: https://raw.communitydragon.org/latest/

Community Dragon unpacks the actual LoL game files and provides data that Data Dragon doesn't (missing champions in off-patch releases, more accurate ability descriptions, better skin data). For the Arena God Tracker's use case (champion list + images), Data Dragon is sufficient. Use Community Dragon if you find DDragon missing newly released champions or if `champion.json` is stale shortly after a patch.

Community Dragon champion index:
```
https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/
```

---

## 8. Policy / ToS Notes

Source: https://developer.riotgames.com/docs/lol (Legal/Policy section)

### What is Allowed

Personal match-tracking tools are explicitly within Riot's acceptable use. Tracking your own Arena wins by champion, backfilling from match history, and displaying a champion checklist are all permitted uses.

### What is Prohibited (relevant to this app)

The official documentation states verbatim:

> "Products cannot display win rates for Augments or Arena Mode items. This applies to all websites, applications and overlays."

**This app does not display augment win rates** — it only tracks placement (1st place or not). The `playerAugment1`–`playerAugment6` fields in participant data should not be surfaced in any win-rate context.

### Other Policy Constraints

- Do not display game-session-specific information that would be unknown to a player's opponents before the match ends (in-game overlays with hidden data).
- Public display of custom match histories requires explicit player consent.
- Using a development API key in production is a policy violation.
- Blacklisted applications (from rate limit abuse) lose API access even after key regeneration.

**Arena tracking = allowed. Augment win rate display = prohibited.**

---

## Appendix: Source URLs

| Topic | URL |
|---|---|
| Developer Portal (keys, policy) | https://developer.riotgames.com/docs/portal |
| LoL API docs (routing, DDragon, policy) | https://developer.riotgames.com/docs/lol |
| Account-V1 details | https://developer.riotgames.com/api-details/account-v1 |
| Rate limiting deep dive | https://hextechdocs.dev/rate-limiting/ |
| Routing guide (community) | https://darkintaqt.com/blog/routing |
| Match-V5 (RiotWatcher) | https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/MatchApiV5.html |
| Challenges-V1 (RiotWatcher) | https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/ChallengesApiV1.html |
| Arena fields (undocumented) | https://github.com/RiotGames/developer-relations/issues/754 |
| Arena queue IDs (1700/1710) | https://github.com/RiotGames/developer-relations/issues/921 |
| Challenges docs gap report | https://github.com/RiotGames/developer-relations/issues/633 |
| Match retention policy | https://www.riotgames.com/en/DevRel/match-history-retention-Change |
| Arena God challenge tracker (ID 602002) | https://challenges.darkintaqt.com/challenge/602002 |
| Go SDK (struct definitions) | https://pkg.go.dev/github.com/f1w/equinox/v2/clients/lol |
| Account-V1 SEA gap | https://github.com/RiotGames/developer-relations/issues/394 |
| Data Dragon (community) | https://riot-api-libraries.readthedocs.io/en/latest/ddragon.html |
| Key registration guide | https://hextechdocs.dev/getting-started-with-the-riot-games-api/ |
