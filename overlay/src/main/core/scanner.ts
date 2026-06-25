import { ARENA_QUEUE_IDS, RiotClient, type MatchDto } from "../riot/client.js";
import type { Store } from "./store.js";

export interface ChecklistChampion {
  key: number;
  id: string;
  name: string;
  image: string;
  completed: boolean;
}
export interface Checklist {
  total: number;
  completed: number;
  version: string | null;
  champions: ChecklistChampion[]; // sorted by name
  seasonStartMs: number | null;
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

// Champions placed 1st with on/after seasonStartMs (null => all-time).
export function wonChampionIds(store: Store, seasonStartMs: number | null): Set<string> {
  const won = new Set<string>();
  for (const m of Object.values(store.data.processedMatches)) {
    if (m.place === 1 && m.champ && (seasonStartMs === null || m.ts >= seasonStartMs)) {
      won.add(m.champ);
    }
  }
  return won;
}

export function buildChecklist(store: Store, seasonStartMs: number | null): Checklist {
  const champs = store.data.champions;
  const won = wonChampionIds(store, seasonStartMs);
  const list: ChecklistChampion[] = (champs?.list ?? [])
    .map((c) => ({
      key: c.key,
      id: c.id,
      name: c.name,
      image: c.image,
      completed: won.has(c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    total: list.length,
    completed: list.filter((c) => c.completed).length,
    version: champs?.version ?? null,
    champions: list,
    seasonStartMs,
  };
}
