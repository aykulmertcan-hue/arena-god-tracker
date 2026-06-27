import { AsyncRateLimiter } from "./rateLimiter.js";

// Arena (gameMode CHERRY) queue ids. Riot changed the id over time:
// 1700 = legacy, 1750 = current (mid-2026+). Scan BOTH.
export const ARENA_QUEUE_IDS = [1700, 1750] as const;

export class RiotAPIError extends Error {}
export class AccountNotFound extends RiotAPIError {}
export class InvalidApiKey extends RiotAPIError {}

export interface MatchParticipant {
  puuid: string;
  championName: string;
  subteamPlacement: number;
  placement?: number;
}
export interface MatchDto {
  metadata: { matchId: string };
  info: {
    queueId: number;
    gameMode: string;
    gameEndTimestamp?: number;
    participants: MatchParticipant[];
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RiotClient {
  constructor(
    private apiKey: string,
    private limiter: AsyncRateLimiter,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async get<T>(url: string, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.limiter.acquire();
      const resp = await this.fetchFn(url, {
        headers: { "X-Riot-Token": this.apiKey },
      });
      if (resp.status === 200) return (await resp.json()) as T;
      if (resp.status === 404) throw new AccountNotFound(url);
      if (resp.status === 401 || resp.status === 403) throw new InvalidApiKey();
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("Retry-After") ?? "1");
        await this.limiter.sleep(retryAfter);
        continue;
      }
      if (resp.status >= 500) {
        await sleep(Math.min(2 ** attempt, 8) * 1000);
        continue;
      }
      throw new RiotAPIError(`HTTP ${resp.status} for ${url}`);
    }
    throw new RiotAPIError(`max retries exceeded for ${url}`);
  }

  async getPuuid(gameName: string, tagLine: string, routing: string): Promise<string> {
    const url =
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const data = await this.get<{ puuid: string }>(url);
    return data.puuid;
  }

  async getArenaMatchIds(
    puuid: string,
    routing: string,
    queue: number,
    start = 0,
    count = 100,
  ): Promise<string[]> {
    const url =
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
      `?queue=${queue}&start=${start}&count=${count}`;
    return this.get<string[]>(url);
  }

  async getMatch(matchId: string, routing: string): Promise<MatchDto> {
    const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    return this.get<MatchDto>(url);
  }

  // Lightweight key check via LoL status (no params). 200 = valid, 401/403 = invalid.
  async validateKey(platform: string): Promise<boolean> {
    const url = `https://${platform}.api.riotgames.com/lol/status/v4/platform-data`;
    try {
      await this.get(url);
      return true;
    } catch (e) {
      if (e instanceof InvalidApiKey) return false;
      throw e;
    }
  }
}
