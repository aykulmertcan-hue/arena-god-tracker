// Server (platform) -> (regional routing, platform id). Ported from the
// Python backend. Arena account-v1 and match-v5 both use REGIONAL routing.

export const SERVER_TO_ROUTING: Record<string, [string, string]> = {
  EUW1: ["europe", "euw1"],
  EUN1: ["europe", "eun1"],
  TR1: ["europe", "tr1"],
  RU: ["europe", "ru"],
  NA1: ["americas", "na1"],
  BR1: ["americas", "br1"],
  LA1: ["americas", "la1"],
  LA2: ["americas", "la2"],
  OC1: ["americas", "oc1"],
  KR: ["asia", "kr"],
  JP1: ["asia", "jp1"],
};

export const SERVERS: string[] = Object.keys(SERVER_TO_ROUTING);

export function resolveRouting(server: string): [string, string] {
  const key = server.toUpperCase();
  const v = SERVER_TO_ROUTING[key];
  if (!v) throw new Error(`Unknown server: ${server}`);
  return v;
}

// The LCU exposes the platform id (e.g. "TR1", "EUW1"); map straight to its
// regional cluster. Falls back to "europe" only if unknown (with a thrown
// error path available via resolveRouting for stricter callers).
export function routingForPlatform(platformId: string): string {
  const key = platformId.toUpperCase();
  return SERVER_TO_ROUTING[key]?.[0] ?? "europe";
}
