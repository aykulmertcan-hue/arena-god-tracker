import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { Store, seasonStartMs } from "../src/main/core/store.js";
import { extractResult, scanAccount, buildChecklist, wonChampionIds } from "../src/main/core/scanner.js";
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

describe("buildChecklist + season filter", () => {
  it("counts only in-season wins; matches by champion id", () => {
    const store = newStore();
    store.putMatch("A", { champ: "Aatrox", place: 1, ts: 2000 }); // in season
    store.putMatch("Z", { champ: "Zac", place: 1, ts: 500 }); // pre season
    store.putMatch("W", { champ: "MonkeyKing", place: 2, ts: 3000 }); // not 1st

    const all = buildChecklist(store, null);
    expect(all.completed).toBe(2);

    const seas = buildChecklist(store, 1000);
    expect(seas.completed).toBe(1);
    const aatrox = seas.champions.find((c) => c.name === "Aatrox")!;
    const zac = seas.champions.find((c) => c.name === "Zac")!;
    const wukong = seas.champions.find((c) => c.name === "Wukong")!;
    expect(aatrox.completed).toBe(true);
    expect(zac.completed).toBe(false);
    expect(wukong.completed).toBe(false);
    // sorted by display name
    expect(seas.champions.map((c) => c.name)).toEqual(["Aatrox", "Wukong", "Zac"]);
  });

  it("wonChampionIds respects season boundary", () => {
    const store = newStore();
    store.putMatch("A", { champ: "Aatrox", place: 1, ts: 2000 });
    expect(wonChampionIds(store, 3000).size).toBe(0);
    expect(wonChampionIds(store, 1000).size).toBe(1);
  });
});

describe("seasonStartMs", () => {
  it("parses ISO date to UTC ms, empty => null", () => {
    expect(seasonStartMs("")).toBeNull();
    expect(seasonStartMs("2026-04-29")).toBe(Date.parse("2026-04-29T00:00:00Z"));
  });
});
