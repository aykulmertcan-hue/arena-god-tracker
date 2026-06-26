import React, { useEffect, useMemo, useState } from "react";
import type { Checklist, Status } from "./types.js";

const CDN = "https://ddragon.leagueoflegends.com/cdn";
const portrait = (v: string | null, img: string) => `${CDN}/${v}/img/champion/${img}`;

// Riot-required attribution (developer.riotgames.com/policies/general).
const DISCLAIMER =
  "Arena God Overlay isn't endorsed by Riot Games and doesn't reflect the views or " +
  "opinions of Riot Games or anyone officially involved in producing or managing Riot " +
  "Games properties. Riot Games, and all associated properties are trademarks or " +
  "registered trademarks of Riot Games, Inc.";

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState("");
  const [editKey, setEditKey] = useState(false);

  useEffect(() => {
    window.overlay.getStatus().then(setStatus);
    window.overlay.getChecklist().then(setChecklist);
    window.overlay.onStatus(setStatus);
    window.overlay.onChecklist(setChecklist);
  }, []);

  const needed = useMemo(() => checklist?.champions.filter((c) => !c.completed) ?? [], [checklist]);
  const done = useMemo(() => checklist?.champions.filter((c) => c.completed) ?? [], [checklist]);
  const base = showDone ? done : needed;
  const q = query.trim().toLowerCase();
  const shown = q ? base.filter((c) => c.name.toLowerCase().includes(q)) : base;

  // Key entry shown when no key yet OR when the user reopens it (e.g. expired key).
  const needKey = status && (!status.hasKey || editKey);

  if (needKey) {
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
          {status?.hasKey && (
            <button onClick={() => setEditKey(false)}>İptal</button>
          )}
        </div>
        {status?.lastError && <p className="error">{status.lastError}</p>}
        <footer className="disclaimer">{DISCLAIMER}</footer>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="drag">
        <div className="title">
          Arena God {status?.account ? `· ${status.account.gameName}#${status.account.tagLine}` : ""}
        </div>
        <div className="actions no-drag">
          <button
            className="refresh"
            disabled={status?.scanning}
            title="Son taramadan beri oynanan maçları tara ve 1.'likleri güncelle"
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

      <input
        className="search no-drag"
        placeholder="Şampiyon ara…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {checklist && checklist.total === 0 ? (
        <div className="empty no-drag">
          Henüz tarama yok. <b>Yenile</b>'ye basınca ilk taramayı (tüm Arena geçmişin)
          yapar; sonraki her basışta yalnızca son taramadan beri oynadığın maçları tarar.
        </div>
      ) : (
        <div className="grid no-drag">
          {shown.length === 0 && <div className="empty">Eşleşen şampiyon yok.</div>}
          {shown.map((c) => (
            <div key={c.key} className={`champ ${c.completed ? "done" : "todo"}`} title={c.name}>
              <img src={portrait(checklist?.version ?? null, c.image)} alt={c.name} loading="lazy" />
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      )}
      <footer className="disclaimer no-drag">{DISCLAIMER}</footer>
    </div>
  );
}
