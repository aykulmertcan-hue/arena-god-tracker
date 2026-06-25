import { findCredentials, lcuGet, type LcuCredentials } from "./connector.js";
import { ARENA_QUEUE_IDS } from "../riot/client.js";

export interface LcuSummoner {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformId: string | null;
}
export interface LcuState {
  connected: boolean;
  summoner: LcuSummoner | null;
  phase: string | null;
  queueId: number | null;
  inArenaChampSelect: boolean;
}

const EMPTY: LcuState = {
  connected: false,
  summoner: null,
  phase: null,
  queueId: null,
  inArenaChampSelect: false,
};

async function readSummoner(creds: LcuCredentials): Promise<LcuSummoner | null> {
  try {
    const cur = await lcuGet<{ puuid: string; gameName?: string; tagLine?: string; displayName?: string }>(
      creds,
      "/lol-summoner/v1/current-summoner",
    );
    let platformId: string | null = null;
    try {
      const login = await lcuGet<{ platformId?: string }>(creds, "/lol-login/v1/session");
      platformId = login.platformId ?? null;
    } catch {
      /* region detection optional */
    }
    if (!cur.puuid) return null;
    return {
      puuid: cur.puuid,
      gameName: cur.gameName ?? cur.displayName ?? "",
      tagLine: cur.tagLine ?? "",
      platformId,
    };
  } catch {
    return null;
  }
}

async function readGameflow(creds: LcuCredentials): Promise<{ phase: string | null; queueId: number | null }> {
  try {
    const s = await lcuGet<{ phase?: string; gameData?: { queue?: { id?: number } } }>(
      creds,
      "/lol-gameflow/v1/session",
    );
    return { phase: s.phase ?? null, queueId: s.gameData?.queue?.id ?? null };
  } catch {
    return { phase: null, queueId: null };
  }
}

/**
 * Polls the local League client. Calls onChange whenever the derived state
 * changes. Resilient to the client not running (emits a disconnected state).
 */
export class LcuWatcher {
  private timer: NodeJS.Timeout | null = null;
  private last = JSON.stringify(EMPTY);
  private cachedSummoner: LcuSummoner | null = null;

  constructor(
    private onChange: (s: LcuState) => void,
    private intervalMs = 2000,
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      const state = await this.poll();
      const key = JSON.stringify(state);
      if (key !== this.last) {
        this.last = key;
        this.onChange(state);
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<LcuState> {
    const creds = await findCredentials();
    if (!creds) {
      this.cachedSummoner = null;
      return { ...EMPTY };
    }
    if (!this.cachedSummoner) this.cachedSummoner = await readSummoner(creds);
    const { phase, queueId } = await readGameflow(creds);
    const inArenaChampSelect =
      phase === "ChampSelect" && queueId !== null && (ARENA_QUEUE_IDS as readonly number[]).includes(queueId);
    return {
      connected: true,
      summoner: this.cachedSummoner,
      phase,
      queueId,
      inArenaChampSelect,
    };
  }
}
