import React, { useEffect, useState, useCallback } from "react";
import AccountForm from "./components/AccountForm.jsx";
import ChecklistGrid from "./components/ChecklistGrid.jsx";
import { getCurrent, getChecklist, getStatus } from "./api.js";

export default function App() {
  const [account, setAccount] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [status, setStatus] = useState(null);

  // remember: on load, ask backend for the last-used account
  useEffect(() => { getCurrent().then((a) => a && setAccount(a)); }, []);

  const refresh = useCallback(async (id) => {
    setChecklist(await getChecklist(id));
    setStatus(await getStatus(id));
  }, []);

  useEffect(() => {
    if (!account) return;
    refresh(account.id);
    const t = setInterval(() => refresh(account.id), 10000);
    return () => clearInterval(t);
  }, [account, refresh]);

  if (!account) return <AccountForm onCreated={setAccount} />;

  return (
    <div className="app">
      <header>
        <span>{account.game_name}#{account.tag_line} · {account.server}</span>
        <button onClick={() => setAccount(null)}>Change account</button>
      </header>
      {status?.backfill_status === "running" && (
        <p className="banner">Scanning history… {status.backfill_progress} matches processed</p>
      )}
      <ChecklistGrid data={checklist} />
    </div>
  );
}
