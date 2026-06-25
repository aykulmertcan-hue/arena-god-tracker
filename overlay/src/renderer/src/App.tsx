import React, { useEffect, useMemo, useState } from "react";
import type { Checklist, Status } from "./types.js";

const CDN = "https://ddragon.leagueoflegends.com/cdn";
const portrait = (v: string | null, img: string) => `${CDN}/${v}/img/champion/${img}`;

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    window.overlay.getStatus().then(setStatus);
    window.overlay.getChecklist().then(setChecklist);
    window.overlay.onStatus(setStatus);
    window.overlay.onChecklist(setChecklist);
  }, []);

  const needed = useMemo(
    () => checklist?.champions.filter((c) => !c.completed) ?? [],
    [checklist],
  );
  const done = useMemo(
    () => checklist?.champions.filter((c) => c.completed) ?? [],
    [checklist],
  );
  const shown = showDone ? done : needed;

  if (status && !status.hasKey) {
    return (
      <div className="app key-setup">
        <h2>Arena God Overlay</h2>
        <p>Riot dev key gir (developer.riotgames.com — 24 saatte yenilenir):</p>
        <input
          placeholder="RGAPI-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        <button onClick={() => window.overlay.setKey(keyInput)}>Kaydet</button>
        {status.lastError && <p className="error">{status.lastError}</p>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="drag">
        <div className="title">
          Arena God {status?.account ? `· ${status.account.gameName}#${status.account.tagLine}` : ""}
        </div>
        <button className="close no-drag" onClick={() => window.overlay.hide()}>
          ×
        </button>
      </header>

      <div className="progress no-drag">
        {checklist ? (
          <>
            <strong>{checklist.completed}/{checklist.total}</strong> bu sezon ·{" "}
            <span className="needcount">{needed.length} eksik</span>
            <div className="bar">
              <div
                className="fill"
                style={{ width: `${checklist.total ? (checklist.completed / checklist.total) * 100 : 0}%` }}
              />
            </div>
          </>
        ) : (
          "Yükleniyor…"
        )}
        {status?.scanning && <div className="scanning">Taranıyor…</div>}
        {status?.lastError && <div className="error">{status.lastError}</div>}
      </div>

      <div className="tabs no-drag">
        <button className={!showDone ? "on" : ""} onClick={() => setShowDone(false)}>
          Eksik ({needed.length})
        </button>
        <button className={showDone ? "on" : ""} onClick={() => setShowDone(true)}>
          Tamam ({done.length})
        </button>
      </div>

      <div className="grid no-drag">
        {shown.map((c) => (
          <div key={c.key} className={`champ ${c.completed ? "done" : "todo"}`} title={c.name}>
            <img src={portrait(checklist?.version ?? null, c.image)} alt={c.name} loading="lazy" />
            <span>{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
