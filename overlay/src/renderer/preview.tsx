import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App.js";
import "./src/styles.css";
import data from "./preview-data.json";

// Mock the Electron preload bridge with real scanned data so the overlay UI
// renders in a plain browser (no Electron / League needed).
(window as unknown as { overlay: unknown }).overlay = {
  getChecklist: async () => data.checklist,
  getStatus: async () => data.status,
  setKey: async () => true,
  triggerScan: async () => true,
  hide: async () => true,
  onChecklist: () => {},
  onStatus: () => {},
};

createRoot(document.getElementById("root")!).render(<App />);
