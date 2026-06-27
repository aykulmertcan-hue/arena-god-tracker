import React, { useEffect, useMemo, useState } from "react";
import type { Checklist, ChecklistChampion, JourneyState, Status } from "./types.js";

const CDN = "https://ddragon.leagueoflegends.com/cdn";
const portrait = (v: string | null, img: string) => `${CDN}/${v}/img/champion/${img}`;

// Riot-required attribution (developer.riotgames.com/policies/general).
const DISCLAIMER =
  "Arena God Overlay isn't endorsed by Riot Games and doesn't reflect the views or " +
  "opinions of Riot Games or anyone officially involved in producing or managing Riot " +
  "Games properties. Riot Games, and all associated properties are trademarks or " +
  "registered trademarks of Riot Games, Inc.";

type Filter = "all" | "notplayed" | "notwon" | "not1st";

const FILTERS: { id: Filter; label: string; pred: (c: ChecklistChampion) => boolean }[] = [
  { id: "all", label: "All", pred: () => true },
  { id: "not1st", label: "No First Place", pred: (c) => c.state !== "first" },
  { id: "notwon", label: "No Win", pred: (c) => c.state === "none" || c.state === "played" },
  { id: "notplayed", label: "Not Played", pred: (c) => c.state === "none" },
];

const STATE_LABEL: Record<JourneyState, string> = {
  none: "not played",
  played: "played",
  won: "won (top 4)",
  first: "1st place",
};

// 3 milestone segments per champion. Color depends on HOW MANY are filled:
// 1 -> bronze, 2 -> silver, 3 -> gold.
function segInfo(state: JourneyState): { filled: number; tier: string } {
  const filled = state === "none" ? 0 : state === "played" ? 1 : state === "won" ? 2 : 3;
  const tier = filled === 1 ? "bronze" : filled === 2 ? "silver" : filled === 3 ? "gold" : "";
  return { filled, tier };
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [filter, setFilter] = useState<Filter>("not1st");
  const [query, setQuery] = useState("");
  const [editKey, setEditKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [keyResult, setKeyResult] = useState<"ok" | "bad" | null>(null);

  useEffect(() => {
    window.overlay.getStatus().then(setStatus);
    window.overlay.getChecklist().then(setChecklist);
    window.overlay.onStatus(setStatus);
    window.overlay.onChecklist(setChecklist);
  }, []);

  const champs = checklist?.champions ?? [];
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, champs.filter(f.pred).length])),
    [champs],
  );

  const shown = useMemo(() => {
    const pred = FILTERS.find((f) => f.id === filter)!.pred;
    const q = query.trim().toLowerCase();
    return champs
      .filter(pred)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champs, filter, query]);

  if (status && (!status.hasKey || editKey)) {
    return (
      <div className="app key-setup">
        <div className="key-head drag">
          <span>Riot Dev Key</span>
          <button className="close no-drag" onClick={() => window.overlay.hide()}>
            ×
          </button>
        </div>
        <p>
          <a
            className="link"
            onClick={() => window.overlay.openExternal("https://developer.riotgames.com/")}
          >
            🔗 Get / refresh Riot dev key (developer.riotgames.com)
          </a>
          <br />
          Sign in → "DEVELOPMENT API KEY" → Regenerate. Expires every 24h.
        </p>
        <input
          placeholder="RGAPI-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          autoFocus
        />
        <div className="key-actions">
          <button
            className="primary"
            disabled={!keyInput.trim() || checking}
            onClick={async () => {
              setChecking(true);
              setKeyResult(null);
              const res = await window.overlay.setKey(keyInput);
              setChecking(false);
              if (res.ok) {
                setKeyResult("ok");
                setTimeout(() => {
                  setEditKey(false);
                  setKeyResult(null);
                  window.overlay.hide();
                }, 1400);
              } else {
                setKeyResult("bad");
              }
            }}
          >
            {checking ? "Checking…" : "Save & verify"}
          </button>
          {status?.hasKey && <button onClick={() => setEditKey(false)}>Cancel</button>}
        </div>
        {keyResult === "ok" && (
          <p className="ok">✓ Key works — opens automatically in Arena champ select.</p>
        )}
        {keyResult === "bad" && (
          <p className="error">{status?.lastError ?? "Invalid key"}</p>
        )}
        <footer className="disclaimer">{DISCLAIMER}</footer>
      </div>
    );
  }

  const pct = checklist?.total ? (checklist.completed / checklist.total) * 100 : 0;

  return (
    <div className="app">
      <header className="drag">
        <div className="title">
          Season Journey {status?.account ? `· ${status.account.gameName}#${status.account.tagLine}` : ""}
        </div>
        <div className="actions no-drag">
          <button
            className="refresh"
            disabled={status?.scanning}
            title="Scan matches played since the last scan"
            onClick={() => window.overlay.triggerScan()}
          >
            {status?.scanning ? "⟳ Scanning…" : "⟳ Refresh"}
          </button>
          <button
            className="iconbtn"
            title="Change Riot key"
            onClick={() => {
              setKeyInput("");
              setEditKey(true);
            }}
          >
            🔑
          </button>
          <button className="close" onClick={() => window.overlay.hide()}>
            ×
          </button>
        </div>
      </header>

      <div className="progress no-drag">
        {checklist ? (
          <>
            <span className="firstcount">
              🏆 <span className="tick">✓</span>{" "}
              <strong>{checklist.completed}</strong>/{checklist.total}
            </span>
            <span className="sub"> with 1st place</span>
            <div className="bar">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          "Loading…"
        )}
        {status?.scanning && <div className="scanning">Scanning…</div>}
        {status?.lastError && <div className="error">{status.lastError}</div>}
      </div>

      <div className="filters no-drag">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      <input
        className="search no-drag"
        placeholder="Search champion…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {checklist && checklist.total === 0 ? (
        <div className="empty no-drag">
          No data yet. Press <b>Refresh</b> to run the first scan (your full Arena
          history); after that each press only scans new matches.
        </div>
      ) : (
        <div className="grid no-drag">
          {shown.length === 0 && <div className="empty">No matching champions.</div>}
          {shown.map((c) => {
            const { filled, tier } = segInfo(c.state);
            return (
              <div key={c.key} className={`champ ${c.completed ? "done" : ""}`} title={`${c.name} — ${STATE_LABEL[c.state]}`}>
                <img src={portrait(checklist?.version ?? null, c.image)} alt={c.name} loading="lazy" />
                <span>{c.name}</span>
                <div className="segs" title="play · win · 1st">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className={`seg ${i < filled ? `on ${tier}` : ""}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <footer className="disclaimer no-drag">{DISCLAIMER}</footer>
    </div>
  );
}
