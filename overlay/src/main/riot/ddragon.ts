// Data Dragon: champion roster + portrait CDN. championName from match-v5
// equals the DDragon string `id` (e.g. "MonkeyKing"), NOT the display name.

export const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

export interface Champion {
  key: number; // numeric riot id
  id: string; // ddragon string id e.g. "MonkeyKing"
  name: string; // display name e.g. "Wukong"
  image: string; // image filename
}

export async function fetchLatestVersion(fetchFn: typeof fetch = fetch): Promise<string> {
  const resp = await fetchFn(`${DDRAGON_BASE}/api/versions.json`);
  if (!resp.ok) throw new Error(`ddragon versions ${resp.status}`);
  const versions = (await resp.json()) as string[];
  return versions[0];
}

export async function fetchChampions(
  version: string,
  fetchFn: typeof fetch = fetch,
): Promise<Champion[]> {
  const resp = await fetchFn(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`);
  if (!resp.ok) throw new Error(`ddragon champions ${resp.status}`);
  const data = (await resp.json()) as {
    data: Record<string, { key: string; id: string; name: string; image: { full: string } }>;
  };
  return Object.values(data.data).map((c) => ({
    key: Number(c.key),
    id: c.id,
    name: c.name,
    image: c.image.full,
  }));
}

export function portraitUrl(version: string, imageFile: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${imageFile}`;
}
