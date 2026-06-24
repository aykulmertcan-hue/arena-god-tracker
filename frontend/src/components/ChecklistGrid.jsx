import React from "react";

export default function ChecklistGrid({ data }) {
  if (!data) return null;
  const portrait = (c) =>
    `https://ddragon.leagueoflegends.com/cdn/${data.version}/img/champion/${c.image_filename}`;
  const pct = data.total ? Math.round((data.completed / data.total) * 100) : 0;
  return (
    <div className="checklist">
      <div className="progress">
        <strong>{data.completed} / {data.total}</strong> champions ({pct}%)
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="grid">
        {data.champions.map((c) => (
          <div key={c.key} className={`champ ${c.completed ? "done" : "todo"}`} title={c.name}>
            <img src={portrait(c)} alt={c.name} loading="lazy" />
            <span>{c.name}</span>
            {c.completed && <div className="check">✓</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
