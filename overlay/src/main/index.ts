import { app, BrowserWindow, ipcMain } from "electron";
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
      void runScan(true); // new account -> full backfill
    }
  }

  // Show overlay only during Arena champ select.
  const visible = ALWAYS_SHOW || state.inArenaChampSelect;
  if (win) {
    if (visible && !win.isVisible()) {
      win.showInactive();
      void runScan(false); // quick incremental refresh on entering champ select
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
  ipcMain.handle("settings:setKey", (_e, key: string) => {
    store.data.settings.riotApiKey = key.trim();
    store.save();
    pushStatus();
    void runScan(true);
    return true;
  });
  ipcMain.handle("scan:trigger", () => {
    void runScan(false);
    return true;
  });
  ipcMain.handle("window:hide", () => {
    if (!ALWAYS_SHOW) win?.hide();
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

  // Periodic incremental refresh while running.
  setInterval(() => {
    if (store.data.account && !scanning) void runScan(false);
  }, 5 * 60 * 1000);

  app.on("window-all-closed", () => {
    watcher.stop();
    app.quit();
  });
});
