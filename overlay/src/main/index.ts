import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";

import { Store, seasonStartMs } from "./core/store.js";
import { buildChecklist, scanAccount } from "./core/scanner.js";
import { AsyncRateLimiter } from "./riot/rateLimiter.js";
import { RiotClient, InvalidApiKey } from "./riot/client.js";
import { routingForPlatform } from "./riot/routing.js";
import { fetchChampions, fetchLatestVersion } from "./riot/ddragon.js";
import { createOverlayWindow } from "./overlayWindow.js";
import { LcuWatcher, type LcuState } from "./lcu/watcher.js";

let win: BrowserWindow | null = null;
let store: Store;
let scanning = false;
let lastError: string | null = null;
let autoScanned = false; // background scan done for the current LoL session
const ALWAYS_SHOW = process.env["OVERLAY_ALWAYS_SHOW"] === "1";

function client(): RiotClient | null {
  const key = store.data.settings.riotApiKey || process.env["RIOT_API_KEY"] || "";
  if (!key) return null;
  return new RiotClient(key, new AsyncRateLimiter([[20, 1], [100, 120]]));
}

function pushChecklist(): void {
  const ms = seasonStartMs(store.data.settings.seasonStart);
  win?.webContents.send("checklist:update", buildChecklist(store, ms));
}

function pushStatus(): void {
  win?.webContents.send("status:update", {
    hasKey: Boolean(store.data.settings.riotApiKey || process.env["RIOT_API_KEY"]),
    account: store.data.account,
    scanning,
    lastScanAt: store.data.lastScanAt,
    lastError,
  });
}

async function ensureChampions(c: RiotClient): Promise<void> {
  if (store.data.champions) return;
  const version = await fetchLatestVersion();
  const list = await fetchChampions(version);
  store.data.champions = { version, list };
  store.save();
}

async function runScan(full: boolean): Promise<void> {
  const c = client();
  const acct = store.data.account;
  if (!c || !acct || scanning) return;
  scanning = true;
  lastError = null;
  pushStatus();
  try {
    await ensureChampions(c);
    await scanAccount(c, store, acct, {
      full,
      onProgress: () => pushChecklist(),
    });
  } catch (e) {
    lastError = e instanceof InvalidApiKey ? "Riot API key invalid or expired" : String(e);
  } finally {
    scanning = false;
    pushChecklist();
    pushStatus();
  }
}

async function onLcuChange(state: LcuState): Promise<void> {
  // Adopt the logged-in account automatically.
  if (state.connected && state.summoner?.puuid) {
    const s = state.summoner;
    const routing = routingForPlatform(s.platformId ?? "TR1");
    const known = store.data.account;
    if (!known || known.puuid !== s.puuid) {
      store.data.account = {
        puuid: s.puuid,
        gameName: s.gameName,
        tagLine: s.tagLine,
        routing,
        platform: (s.platformId ?? "").toLowerCase(),
      };
      store.save();
      pushStatus();
    }
    // Work in the background as soon as LoL is detected (before Arena): scan
    // once per LoL session. First time -> full backfill, else incremental.
    if (!autoScanned && store.data.account && client()) {
      autoScanned = true;
      void runScan(Object.keys(store.data.processedMatches).length === 0);
    }
  } else if (!state.connected) {
    autoScanned = false; // LoL closed -> rescan when it reopens
  }

  // Show overlay only during Arena champ select. No automatic scan here —
  // the user refreshes manually via the Refresh button (scan:trigger).
  const visible = ALWAYS_SHOW || state.inArenaChampSelect;
  if (win) {
    if (visible && !win.isVisible()) {
      win.showInactive();
    } else if (!visible && win.isVisible() && !ALWAYS_SHOW) {
      win.hide();
    }
  }
}

function registerIpc(): void {
  ipcMain.handle("checklist:get", () =>
    buildChecklist(store, seasonStartMs(store.data.settings.seasonStart)),
  );
  ipcMain.handle("status:get", () => ({
    hasKey: Boolean(store.data.settings.riotApiKey || process.env["RIOT_API_KEY"]),
    account: store.data.account,
    scanning,
    lastScanAt: store.data.lastScanAt,
    lastError,
  }));
  ipcMain.handle("settings:setKey", async (_e, key: string) => {
    store.data.settings.riotApiKey = key.trim();
    store.save();
    const platform = store.data.account?.platform || "euw1";
    const c = client();
    if (!c) {
      lastError = "No key entered";
      pushStatus();
      return { ok: false, error: lastError };
    }
    try {
      const ok = await c.validateKey(platform);
      lastError = ok ? null : "Riot API key is invalid or expired";
      pushStatus();
      // Key just verified — if LoL is already open, start scanning now.
      if (ok && store.data.account) {
        autoScanned = true;
        void runScan(Object.keys(store.data.processedMatches).length === 0);
      }
      return { ok, error: ok ? undefined : lastError };
    } catch (e) {
      lastError = String(e);
      pushStatus();
      return { ok: false, error: String(e) };
    }
  });
  ipcMain.handle("scan:trigger", () => {
    // First scan (no data yet) -> full backfill; otherwise incremental
    // (only games since the last scan).
    const full = Object.keys(store.data.processedMatches).length === 0;
    void runScan(full);
    return true;
  });
  ipcMain.handle("window:hide", () => {
    if (!ALWAYS_SHOW) win?.hide();
    return true;
  });
  ipcMain.handle("open:external", (_e, url: string) => {
    void shell.openExternal(url);
    return true;
  });
}

app.whenReady().then(() => {
  store = new Store(join(app.getPath("userData"), "store.json"));
  win = createOverlayWindow();
  if (ALWAYS_SHOW) win.show();
  registerIpc();

  win.webContents.on("did-finish-load", () => {
    pushStatus();
    pushChecklist();
  });

  const watcher = new LcuWatcher((s) => void onLcuChange(s));
  watcher.start();

  // No periodic auto-refresh by design — updates happen only when the user
  // presses Refresh (scan:trigger), which scans games since the last scan.

  app.on("window-all-closed", () => {
    watcher.stop();
    app.quit();
  });
});
