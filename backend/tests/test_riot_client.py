import httpx
import pytest
import respx
from app.riot.client import RiotClient, AccountNotFound, InvalidApiKey


class NoWaitLimiter:
    async def acquire(self): pass
    async def sleep(self, s): pass


def make_client():
    return RiotClient("RGAPI-test", NoWaitLimiter(), httpx.AsyncClient())


@respx.mock
async def test_get_puuid_returns_puuid():
    respx.get(
        "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Hide on bush/KR1"
    ).mock(return_value=httpx.Response(200, json={"puuid": "PUUID123"}))
    puuid = await make_client().get_puuid("Hide on bush", "KR1", "europe")
    assert puuid == "PUUID123"


@respx.mock
async def test_get_puuid_404_raises_account_not_found():
    respx.get(url__regex=r".*by-riot-id.*").mock(return_value=httpx.Response(404, json={}))
    with pytest.raises(AccountNotFound):
        await make_client().get_puuid("Nope", "XXX", "europe")


@respx.mock
async def test_403_raises_invalid_api_key():
    respx.get(url__regex=r".*by-riot-id.*").mock(return_value=httpx.Response(403, json={}))
    with pytest.raises(InvalidApiKey):
        await make_client().get_puuid("X", "Y", "europe")


@respx.mock
async def test_arena_match_ids_passes_queue_1700():
    route = respx.get(url__regex=r".*/matches/by-puuid/PUUID123/ids.*").mock(
        return_value=httpx.Response(200, json=["EUW1_1", "EUW1_2"])
    )
    ids = await make_client().get_arena_match_ids("PUUID123", "europe", start=0, count=20)
    assert ids == ["EUW1_1", "EUW1_2"]
    assert route.calls.last.request.url.params["queue"] == "1700"


@respx.mock
async def test_429_then_200_retries():
    respx.get(url__regex=r".*/matches/EUW1_1$").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "0"}),
            httpx.Response(200, json={"metadata": {"matchId": "EUW1_1"}}),
        ]
    )
    data = await make_client().get_match("EUW1_1", "europe")
    assert data["metadata"]["matchId"] == "EUW1_1"
