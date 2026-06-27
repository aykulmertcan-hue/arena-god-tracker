import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { Store, seasonStartMs } from "../src/main/core/store.js";
import { extractResult, scanAccount, buildChecklist } from "../src/main/core/scanner.js";
import type { MatchDto } from "../src/main/riot/client.js";

function win(mid: string, puuid: string, champ: string, place = 1, ts = 1, queueId = 1700): MatchDto {
  return {
    metadata: { matchId: mid },
    info: {
      queueId,
      gameMode: "CHERRY",
      gameEndTimestamp: ts,
      participants: [
        { puuid: "other", championName: "Zed", subteamPlacement: 4 },
        { puuid, championName: champ, subteamPlacement: place },
      ],
    },
  };
}

// Fake Riot client serving ids per queue and matches by id.
class FakeClient {
  constructor(
    private pagesByQueue: Record<number, string[][]>,
    private matches: Record<string, MatchDto>,
  ) {}
  private idx: Record<number, number> = {};
  async getArenaMatchIds(_p: string, _r: string, queue: number): Promise<string[]> {
    const pages = this.pagesByQueue[queue] ?? [];
    const i = this.idx[queue] ?? 0;
    if (i >= pages.length) return [];
    this.idx[queue] = i + 1;
    return pages[i];
  }
  async getMatch(id: string): Promise<MatchDto> {
    return this.matches[id];
  }
}

function newStore(): Store {
  const p = join(tmpdir(), `agstore-${Math.floor(performance.now() * 1000)}.json`);
  try { rmSync(p); } catch { /* ignore */ }
  const s = new Store(p);
  s.data.champions = {
    version: "v",
    list: [
      { key: 1, id: "Aatrox", name: "Aatrox", image: "Aatrox.png" },
      { key: 2, id: "Zac", name: "Zac", image: "Zac.png" },
      { key: 62, id: "MonkeyKing", name: "Wukong", image: "MonkeyKing.png" },
    ],
  };
  return s;
}

describe("extractResult", () => {
  it("finds our participant by puuid", () => {
    expect(extractResult(win("M", "me", "Aatrox"), "me")).toEqual(["Aatrox", 1]);
    expect(extractResult(win("M", "me", "Aatrox"), "ghost")).toBeNull();
  });
});

describe("scanAccount", () => {
  let store: Store;
  beforeEach(() => { store = newStore(); });

  it("full scan covers BOTH queues (1700 + 1750)", async () => {
    const client = new FakeClient(
      { 1700: [["M1"], []], 1750: [["M2"], []] },
      { M1: win("M1", "me", "Aatrox"), M2: win("M2", "me", "Zac", 1, 2, 1750) },
    ) as any;
    const p = await scanAccount(client, store, { puuid: "me", routing: "europe" }, { full: true });
    expect(p.newWins).toBe(2);
    expect(store.hasMatch("M1") && store.hasMatch("M2")).toBe(true);
  });

  it("is idempotent (re-scan adds nothing)", async () => {
    const mk = () => new FakeClient({ 1750: [["M2"], []] }, { M2: win("M2", "me", "Zac", 1, 2, 1750) }) as any;
    await scanAccount(mk(), store, { puuid: "me", routing: "europe" }, { full: true });
    const p2 = await scanAccount(mk(), store, { puuid: "me", routing: "europe" }, { full: true });
    expect(p2.processed).toBe(0);
    expect(Object.keys(store.data.processedMatches).length).toBe(1);
  });
});

describe("buildChecklist — Season Journey Fame model", () => {
  it("maps best placement to state + Fame per champion", () => {
    const store = newStore();
    store.putMatch("A", { champ: "Aatrox", place: 1, ts: 2000 }); // 1st -> first, 400
    store.putMatch("W", { champ: "MonkeyKing", place: 3, ts: 2000 }); // top4 -> won, 200
    store.putMatch("Z", { champ: "Zac", place: 6, ts: 2000 }); // played -> 50

    const v = buildChecklist(store, 1000);
    const a = v.champions.find((c) => c.name === "Aatrox")!;
    const w = v.champions.find((c) => c.name === "Wukong")!;
    const z = v.champions.find((c) => c.name === "Zac")!;
    expect([a.state, a.earned, a.remaining, a.completed]).toEqual(["first", 400, 0, true]);
    expect([w.state, w.earned, w.remaining]).toEqual(["won", 200, 200]);
    expect([z.state, z.earned, z.remaining]).toEqual(["played", 50, 350]);
    expect(v.completed).toBe(1); // only Aatrox maxed
    expect(v.totalFame).toBe(400 + 200 + 50);
    expect(v.maxFame).toBe(3 * 400);
  });

  it("uses the best (lowest) placement across a champion's matches", () => {
    const store = newStore();
    store.putMatch("A1", { champ: "Aatrox", place: 5, ts: 2000 });
    store.putMatch("A2", { champ: "Aatrox", place: 2, ts: 2100 }); // better
    const a = buildChecklist(store, 1000).champions.find((c) => c.name === "Aatrox")!;
    expect(a.state).toBe("won");
  });

  it("season filter excludes pre-season matches", () => {
    const store = newStore();
    store.putMatch("Z", { champ: "Zac", place: 1, ts: 500 }); // pre-season
    const z = buildChecklist(store, 1000).champions.find((c) => c.name === "Zac")!;
    expect(z.state).toBe("none");
    expect(z.earned).toBe(0);
  });
});

describe("seasonStartMs", () => {
  it("parses ISO date to UTC ms, empty => null", () => {
    expect(seasonStartMs("")).toBeNull();
    expect(seasonStartMs("2026-04-29")).toBe(Date.parse("2026-04-29T00:00:00Z"));
  });
});
