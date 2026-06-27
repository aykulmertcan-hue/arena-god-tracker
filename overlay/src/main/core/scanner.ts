import { ARENA_QUEUE_IDS, RiotClient, type MatchDto } from "../riot/client.js";
import type { Store } from "./store.js";

// Arena Season Journey per-champion Fame milestones (each earned once).
export const FAME = { PLAY: 50, WIN: 150, FIRST: 200, MAX: 400 } as const;

export type JourneyState = "none" | "played" | "won" | "first";

export interface ChecklistChampion {
  key: number;
  id: string;
  name: string;
  image: string;
  state: JourneyState; // none | played | won (top4) | first
  bestPlacement: number | null; // best (lowest) subteamPlacement this season
  earned: number; // Fame earned for this champion's milestones
  remaining: number; // Fame still gainable for this champion
  completed: boolean; // true when fully maxed (placed 1st)
}
export interface Checklist {
  total: number;
  completed: number; // champions fully maxed (1st)
  totalFame: number; // Fame earned across all champions
  maxFame: number; // total possible (champions * 400)
  version: string | null;
  champions: ChecklistChampion[]; // sorted by name
  seasonStartMs: number | null;
}

// Map best (lowest) placement to milestone state + Fame. In Arena, top 4 = win.
function fameFor(best: number | null): { state: JourneyState; earned: number; remaining: number } {
  if (best === null) return { state: "none", earned: 0, remaining: FAME.MAX };
  if (best === 1) return { state: "first", earned: FAME.MAX, remaining: 0 };
  if (best <= 4) return { state: "won", earned: FAME.PLAY + FAME.WIN, remaining: FAME.FIRST };
  return { state: "played", earned: FAME.PLAY, remaining: FAME.WIN + FAME.FIRST };
}

// Find our participant's (championName, subteamPlacement).
export function extractResult(match: MatchDto, puuid: string): [string, number] | null {
  for (const p of match.info.participants) {
    if (p.puuid === puuid) return [p.championName, p.subteamPlacement];
  }
  return null;
}

export interface ScanProgress {
  processed: number;
  newWins: number;
}

/**
 * Scan Arena match history into the store. Idempotent: only fetches match
 * detail for ids not already stored. `full=false` does a light recent sweep
 * (current season only by default), `full=true` paginates everything.
 */
export async function scanAccount(
  client: RiotClient,
  store: Store,
  account: { puuid: string; routing: string },
  opts: { full: boolean; pageSize?: number; recentCount?: number; onProgress?: (p: ScanProgress) => void } = { full: false },
): Promise<ScanProgress> {
  const pageSize = opts.pageSize ?? 100;
  const recentCount = opts.recentCount ?? 20;
  const progress: ScanProgress = { processed: 0, newWins: 0 };

  for (const queue of ARENA_QUEUE_IDS) {
    let start = 0;
    for (;;) {
      const ids = opts.full
        ? await client.getArenaMatchIds(account.puuid, account.routing, queue, start, pageSize)
        : await client.getArenaMatchIds(account.puuid, account.routing, queue, 0, recentCount);
      if (ids.length === 0) break;

      const fresh = ids.filter((id) => !store.hasMatch(id));
      for (const id of fresh) {
        const match = await client.getMatch(id, account.routing);
        const res = extractResult(match, account.puuid);
        if (res) {
          const [champ, place] = res;
          store.putMatch(id, { champ, place, ts: match.info.gameEndTimestamp ?? 0 });
          progress.processed++;
          if (place === 1) progress.newWins++;
        } else {
          store.putMatch(id, { champ: "", place: 0, ts: match.info.gameEndTimestamp ?? 0 });
        }
        opts.onProgress?.(progress);
      }
      store.data.lastScanAt = Date.now();
      store.save();
      if (!opts.full) break; // light sweep: only the most recent page per queue
      start += pageSize;
    }
  }
  return progress;
}

// Best (lowest) subteamPlacement per champion id, in-season (null => all-time).
export function bestPlacements(store: Store, seasonStartMs: number | null): Record<string, number> {
  const best: Record<string, number> = {};
  for (const m of Object.values(store.data.processedMatches)) {
    if (!m.champ || m.place < 1) continue;
    if (seasonStartMs !== null && m.ts < seasonStartMs) continue;
    if (!(m.champ in best) || m.place < best[m.champ]) best[m.champ] = m.place;
  }
  return best;
}

export function buildChecklist(store: Store, seasonStartMs: number | null): Checklist {
  const champs = store.data.champions;
  const best = bestPlacements(store, seasonStartMs);
  let completed = 0;
  let totalFame = 0;
  const list: ChecklistChampion[] = (champs?.list ?? [])
    .map((c) => {
      const b = c.id in best ? best[c.id] : null;
      const f = fameFor(b);
      totalFame += f.earned;
      if (f.state === "first") completed += 1;
      return {
        key: c.key,
        id: c.id,
        name: c.name,
        image: c.image,
        state: f.state,
        bestPlacement: b,
        earned: f.earned,
        remaining: f.remaining,
        completed: f.state === "first",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    total: list.length,
    completed,
    totalFame,
    maxFame: list.length * FAME.MAX,
    version: champs?.version ?? null,
    champions: list,
    seasonStartMs,
  };
}
