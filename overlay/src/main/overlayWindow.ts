import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

const WIN_W = 380;

// Transparent, frameless, always-on-top overlay window. Created hidden;
// the orchestrator shows it during Arena champ select.
//
// SAFETY: this MUST stay a separate OS window. Never inject into the game,
// hook its renderer, read game memory, or automate input — see SAFETY.md.
// Those would trip Vanguard and risk account bans.
export function createOverlayWindow(): BrowserWindow {
  // Spawn on the right side of the primary display (over the client's
  // opponent panel, which is irrelevant in Arena). Tall by default; fully
  // resizable so anyone can use any size.
  const { workArea } = screen.getPrimaryDisplay();
  const winH = Math.min(920, workArea.height - 100);
  const win = new BrowserWindow({
    width: WIN_W,
    height: winH,
    x: workArea.x + workArea.width - WIN_W - 20,
    y: workArea.y + 50,
    minWidth: 260,
    minHeight: 300,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}
