/**
 * Headless verification of the scan engine against the REAL Riot API.
 *
 * Usage:
 *   RIOT_API_KEY=RGAPI-... RIOT_ID="Mrtcn#9999" SERVER=TR1 \
 *     npx tsx scripts/scan-cli.ts
 *
 * Env:
 *   RIOT_API_KEY  (required)
 *   RIOT_ID       "gameName#tagLine"  (required)
 *   SERVER        platform id, default TR1
 *   SEASON        season start ISO date, default 2026-04-29 ("" = all-time)
 *   STORE         store path, default ./scan-store.json
 *   FULL          "1" full backfill (default), "0" recent-only
 */
import { AsyncRateLimiter } from "../src/main/riot/rateLimiter.js";
import { RiotClient } from "../src/main/riot/client.js";
import { resolveRouting } from "../src/main/riot/routing.js";
import { fetchLatestVersion, fetchChampions } from "../src/main/riot/ddragon.js";
import { Store, seasonStartMs } from "../src/main/core/store.js";
import { scanAccount, buildChecklist } from "../src/main/core/scanner.js";

async function main() {
  const key = process.env.RIOT_API_KEY;
  const riotId = process.env.RIOT_ID;
  if (!key || !riotId) throw new Error("RIOT_API_KEY and RIOT_ID are required");
  const [gameName, tagLine] = riotId.split("#");
  const server = process.env.SERVER ?? "TR1";
  const season = process.env.SEASON ?? "2026-04-29";
  const storePath = process.env.STORE ?? "./scan-store.json";
  const full = (process.env.FULL ?? "1") === "1";

  const [routing] = resolveRouting(server);
  const limiter = new AsyncRateLimiter([[20, 1], [100, 120]]);
  const client = new RiotClient(key, limiter);

  console.log(`Resolving ${gameName}#${tagLine} on ${server} (${routing})...`);
  const puuid = await client.getPuuid(gameName, tagLine, routing);
  console.log(`puuid: ${puuid.slice(0, 16)}...`);

  const store = new Store(storePath);
  if (!store.data.champions) {
    const version = await fetchLatestVersion();
    const list = await fetchChampions(version);
    store.data.champions = { version, list };
    store.save();
    console.log(`Data Dragon: ${list.length} champions (patch ${version})`);
  }

  console.log(`Scanning (full=${full})...`);
  const p = await scanAccount(client, store, { puuid, routing }, {
    full,
    onProgress: (pr) => {
      if (pr.processed % 25 === 0) process.stdout.write(`\r  processed=${pr.processed} wins=${pr.newWins}   `);
    },
  });
  console.log(`\nDone. processed=${p.processed} newWins=${p.newWins}`);

  const ms = seasonStartMs(season);
  const seasonView = buildChecklist(store, ms);
  const allView = buildChecklist(store, null);
  console.log(`\nSEASON (since ${season || "all-time"}): ${seasonView.completed}/${seasonView.total}`);
  console.log(`ALL-TIME: ${allView.completed}/${allView.total}`);
  console.log(`\nThis-season champions (${seasonView.completed}):`);
  console.log("  " + seasonView.champions.filter((c) => c.completed).map((c) => c.name).join(", "));
  console.log(`\nStill needed this season (first 15 of ${seasonView.total - seasonView.completed}):`);
  console.log("  " + seasonView.champions.filter((c) => !c.completed).slice(0, 15).map((c) => c.name).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
