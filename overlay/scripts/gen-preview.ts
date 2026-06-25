// Generates preview-data.json from the real scan store so the overlay UI can
// be previewed in a browser without Electron / a running League client.
import { writeFileSync } from "node:fs";
import { Store, seasonStartMs } from "../src/main/core/store.js";
import { buildChecklist } from "../src/main/core/scanner.js";

const store = new Store(process.env.STORE ?? "./scan-store.json");
const checklist = buildChecklist(store, seasonStartMs(store.data.settings.seasonStart || "2026-04-29"));
const status = {
  hasKey: true,
  account: store.data.account,
  scanning: false,
  lastScanAt: store.data.lastScanAt,
  lastError: null,
};
writeFileSync("src/renderer/preview-data.json", JSON.stringify({ checklist, status }, null, 2));
console.log(`preview-data.json: season ${checklist.completed}/${checklist.total}`);
