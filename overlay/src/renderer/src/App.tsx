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
  { id: "all", label: "Tümü", pred: () => true },
  { id: "notplayed", label: "Oynamadıklarım", pred: (c) => c.state === "none" },
  { id: "notwon", label: "Kazanmadıklarım", pred: (c) => c.state === "none" || c.state === "played" },
  { id: "not1st", label: "1. olmadıklarım", pred: (c) => c.state !== "first" },
];

// 3 milestone segments per champion: played / won / 1st.
function segments(state: JourneyState): boolean[] {
  return [
    state === "played" || state === "won" || state === "first", // played
    state === "won" || state === "first", // won (top 4)
    state === "first", // 1st
  ];
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [filter, setFilter] = useState<Filter>("not1st");
  const [query, setQuery] = useState("");
  const [editKey, setEditKey] = useState(false);

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
      .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
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
            🔗 Riot dev key al / yenile (developer.riotgames.com)
          </a>
          <br />
          Giriş yap → "DEVELOPMENT API KEY" → Regenerate. 24 saatte bir yenilenir.
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
            disabled={!keyInput.trim()}
            onClick={async () => {
              await window.overlay.setKey(keyInput);
              setEditKey(false);
            }}
          >
            Kaydet
          </button>
          {status?.hasKey && <button onClick={() => setEditKey(false)}>İptal</button>}
        </div>
        {status?.lastError && <p className="error">{status.lastError}</p>}
        <footer className="disclaimer">{DISCLAIMER}</footer>
      </div>
    );
  }

  const pct = checklist?.maxFame ? (checklist.totalFame / checklist.maxFame) * 100 : 0;

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
            title="Son taramadan beri oynanan maçları tara ve Fame'i güncelle"
            onClick={() => window.overlay.triggerScan()}
          >
            {status?.scanning ? "⟳ Taranıyor…" : "⟳ Yenile"}
          </button>
          <button
            className="iconbtn"
            title="Riot key'i değiştir"
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
            <strong>{checklist.totalFame.toLocaleString()}</strong> /{" "}
            {checklist.maxFame.toLocaleString()} Fame ·{" "}
            <span className="needcount">{checklist.completed}/{checklist.total} şampiyon 1.</span>
            <div className="bar">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          "Yükleniyor…"
        )}
        {status?.scanning && <div className="scanning">Taranıyor…</div>}
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
        placeholder="Şampiyon ara…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {checklist && checklist.total === 0 ? (
        <div className="empty no-drag">
          Henüz tarama yok. <b>Yenile</b>'ye basınca ilk taramayı (tüm Arena geçmişin)
          yapar; sonraki her basışta yalnızca yeni maçları tarar.
        </div>
      ) : (
        <div className="grid no-drag">
          {shown.length === 0 && <div className="empty">Eşleşen şampiyon yok.</div>}
          {shown.map((c) => {
            const seg = segments(c.state);
            return (
              <div key={c.key} className={`champ ${c.completed ? "done" : ""}`} title={`${c.name} · ${c.remaining} Fame kaldı`}>
                <img src={portrait(checklist?.version ?? null, c.image)} alt={c.name} loading="lazy" />
                <span>{c.name}</span>
                <div className="segs" title="oyna · kazan · 1.">
                  <i className={`seg p ${seg[0] ? "on" : ""}`} />
                  <i className={`seg w ${seg[1] ? "on" : ""}`} />
                  <i className={`seg f ${seg[2] ? "on" : ""}`} />
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
