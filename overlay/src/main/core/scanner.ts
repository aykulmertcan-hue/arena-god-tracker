import { ARENA_QUEUE_IDS, RiotClient, type MatchDto } from "../riot/client.js";
import type { Store } from "./store.js";

// Per-champion Arena milestone state (no points/Fame — just status).
export type JourneyState = "none" | "played" | "won" | "first";

export interface ChecklistChampion {
  key: number;
  id: string;
  name: string;
  image: string;
  state: JourneyState; // none | played | won (top4) | first
  bestPlacement: number | null; // best (lowest) subteamPlacement this season
  completed: boolean; // true when placed 1st
}
export interface Checklist {
  total: number;
  completed: number; // champions placed 1st with
  version: string | null;
  champions: ChecklistChampion[]; // sorted by name
  seasonStartMs: number | null;
}

// Map best (lowest) placement to milestone state. In Arena, top 4 = win.
function stateFor(best: number | null): JourneyState {
  if (best === null) return "none";
  if (best === 1) return "first";
  if (best <= 4) return "won";
  return "played";
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
  const list: ChecklistChampion[] = (champs?.list ?? [])
    .map((c) => {
      const b = c.id in best ? best[c.id] : null;
      const state = stateFor(b);
      if (state === "first") completed += 1;
      return {
        key: c.key,
        id: c.id,
        name: c.name,
        image: c.image,
        state,
        bestPlacement: b,
        completed: state === "first",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    total: list.length,
    completed,
    version: champs?.version ?? null,
    champions: list,
    seasonStartMs,
  };
}
