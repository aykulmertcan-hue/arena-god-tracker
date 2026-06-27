export type JourneyState = "none" | "played" | "won" | "first";

export interface ChecklistChampion {
  key: number;
  id: string;
  name: string;
  image: string;
  state: JourneyState;
  bestPlacement: number | null;
  completed: boolean;
}
export interface Checklist {
  total: number;
  completed: number;
  version: string | null;
  champions: ChecklistChampion[];
  seasonStartMs: number | null;
}
export interface Status {
  hasKey: boolean;
  account: { gameName: string; tagLine: string; platform: string } | null;
  scanning: boolean;
  lastScanAt: number | null;
  lastError: string | null;
}

export interface OverlayApi {
  getChecklist: () => Promise<Checklist>;
  getStatus: () => Promise<Status>;
  setKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  triggerScan: () => Promise<boolean>;
  hide: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  quit: () => Promise<boolean>;
  onChecklist: (cb: (data: Checklist) => void) => void;
  onStatus: (cb: (data: Status) => void) => void;
}

declare global {
  interface Window {
    overlay: OverlayApi;
  }
}
