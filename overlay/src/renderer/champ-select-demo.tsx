import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App.js";
import "./src/styles.css";
import data from "./preview-data.json";

// Mock the Electron bridge with the real scanned data.
(window as unknown as { overlay: unknown }).overlay = {
  getChecklist: async () => data.checklist,
  getStatus: async () => data.status,
  setKey: async () => true,
  triggerScan: async () => true,
  hide: async () => true,
  openExternal: async () => true,
  quit: async () => true,
  onChecklist: () => {},
  onStatus: () => {},
};

// Fill the faux champ-select bottom bar with a few champion icons from the data.
const v = data.checklist.version;
const bar = document.getElementById("bar");
if (bar && v) {
  data.checklist.champions.slice(0, 8).forEach((c) => {
    const img = document.createElement("img");
    img.src = `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${c.image}`;
    img.alt = c.name;
    bar.appendChild(img);
  });
}

createRoot(document.getElementById("overlay-root")!).render(<App />);
