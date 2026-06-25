import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import https from "node:https";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LcuCredentials {
  port: number;
  token: string;
}

const LOCKFILE_PATHS = [
  "C:\\Riot Games\\League of Legends\\lockfile",
  "/Applications/League of Legends.app/Contents/LoL/lockfile",
  `${homedir()}/Library/Application Support/Riot Games/League of Legends/lockfile`,
];

function parseLockfile(content: string): LcuCredentials | null {
  // format: name:pid:port:password:protocol
  const parts = content.trim().split(":");
  if (parts.length < 5) return null;
  return { port: Number(parts[2]), token: parts[3] };
}

async function fromProcess(): Promise<LcuCredentials | null> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
      ]);
      return parseArgs(stdout);
    }
    const { stdout } = await execFileAsync("/bin/sh", [
      "-c",
      "ps x -o args= | grep -i 'LeagueClientUx' | grep -v grep",
    ]);
    return parseArgs(stdout);
  } catch {
    return null;
  }
}

function parseArgs(cmdline: string): LcuCredentials | null {
  const port = /--app-port=(\d+)/.exec(cmdline)?.[1];
  const token = /--remoting-auth-token=([\w-]+)/.exec(cmdline)?.[1];
  if (port && token) return { port: Number(port), token };
  return null;
}

function fromLockfile(): LcuCredentials | null {
  for (const p of LOCKFILE_PATHS) {
    if (existsSync(p)) {
      const creds = parseLockfile(readFileSync(p, "utf8"));
      if (creds) return creds;
    }
  }
  return null;
}

// Find LCU credentials (League client running). Returns null if not found.
export async function findCredentials(): Promise<LcuCredentials | null> {
  return (await fromProcess()) ?? fromLockfile();
}

// GET a JSON endpoint from the local League client (self-signed TLS).
export function lcuGet<T>(creds: LcuCredentials, path: string): Promise<T> {
  const auth = Buffer.from(`riot:${creds.token}`).toString("base64");
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: creds.port,
        path,
        method: "GET",
        rejectUnauthorized: false,
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`LCU ${path} -> HTTP ${res.statusCode}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export { parseLockfile, parseArgs };
