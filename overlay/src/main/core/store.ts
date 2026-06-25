import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Champion } from "../riot/ddragon.js";

export interface ProcessedMatch {
  champ: string; // championName (ddragon id)
  place: number; // subteamPlacement
  ts: number; // gameEndTimestamp (ms)
}

export interface AccountInfo {
  puuid: string;
  gameName: string;
  tagLine: string;
  routing: string;
  platform: string;
}

export interface StoreData {
  settings: { riotApiKey: string; seasonStart: string };
  champions: { version: string; list: Champion[] } | null;
  account: AccountInfo | null;
  processedMatches: Record<string, ProcessedMatch>;
  lastScanAt: number | null;
}

const DEFAULTS: StoreData = {
  settings: { riotApiKey: "", seasonStart: "2026-04-29" },
  champions: null,
  account: null,
  processedMatches: {},
  lastScanAt: null,
};

export class Store {
  data: StoreData;
  constructor(private path: string) {
    this.data = this.load();
  }

  private load(): StoreData {
    if (!existsSync(this.path)) return structuredClone(DEFAULTS);
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoreData>;
      return {
        ...structuredClone(DEFAULTS),
        ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings ?? {}) },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  hasMatch(id: string): boolean {
    return id in this.data.processedMatches;
  }

  putMatch(id: string, m: ProcessedMatch): void {
    this.data.processedMatches[id] = m;
  }
}

// season start ISO date -> epoch ms (UTC). Empty string => null (all-time).
export function seasonStartMs(iso: string): number | null {
  if (!iso) return null;
  return Date.parse(`${iso}T00:00:00Z`);
}
