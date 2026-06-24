import React, { useEffect, useState } from "react";
import { getServers, createAccount } from "../api.js";

export default function AccountForm({ onCreated }) {
  const [servers, setServers] = useState([]);
  const [server, setServer] = useState("EUW1");
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [backfill, setBackfill] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getServers().then((d) => { setServers(d.servers); setServer(d.default); });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const acct = await createAccount({ game_name: gameName, tag_line: tagLine, server, backfill });
      onCreated(acct);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="account-form" onSubmit={submit}>
      <h1>Arena God Tracker</h1>
      <div className="riot-id">
        <input placeholder="Game name" value={gameName} onChange={(e) => setGameName(e.target.value)} required />
        <span>#</span>
        <input placeholder="TAG" value={tagLine} onChange={(e) => setTagLine(e.target.value)} required />
      </div>
      <select value={server} onChange={(e) => setServer(e.target.value)}>
        {servers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="backfill">
        <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} />
        Scan match history (backfill)
      </label>
      <button disabled={busy}>{busy ? "Resolving…" : "Track"}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
