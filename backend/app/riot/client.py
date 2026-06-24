import asyncio

import httpx


class RiotAPIError(Exception):
    pass


class AccountNotFound(RiotAPIError):
    pass


class InvalidApiKey(RiotAPIError):
    pass


class RiotClient:
    def __init__(self, api_key, limiter, client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.limiter = limiter
        self._client = client or httpx.AsyncClient(timeout=10.0)

    async def _get(self, url: str, params: dict | None = None, max_retries: int = 3):
        for attempt in range(max_retries + 1):
            await self.limiter.acquire()
            resp = await self._client.get(
                url, params=params, headers={"X-Riot-Token": self.api_key}
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404:
                raise AccountNotFound(url)
            if resp.status_code in (401, 403):
                raise InvalidApiKey()
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", "1"))
                await self.limiter.sleep(retry_after)
                continue
            if resp.status_code >= 500:
                await asyncio.sleep(min(2 ** attempt, 8))
                continue
            resp.raise_for_status()
        raise RiotAPIError(f"max retries exceeded for {url}")

    async def get_puuid(self, game_name: str, tag_line: str, routing: str) -> str:
        url = (
            f"https://{routing}.api.riotgames.com"
            f"/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        )
        data = await self._get(url)
        return data["puuid"]

    async def get_arena_match_ids(
        self, puuid: str, routing: str, start: int = 0, count: int = 100
    ) -> list[str]:
        url = (
            f"https://{routing}.api.riotgames.com"
            f"/lol/match/v5/matches/by-puuid/{puuid}/ids"
        )
        return await self._get(url, params={"queue": 1700, "start": start, "count": count})

    async def get_match(self, match_id: str, routing: str) -> dict:
        url = f"https://{routing}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        return await self._get(url)
