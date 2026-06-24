import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // build into the backend's static dir so FastAPI serves it in prod
  build: { outDir: "../backend/app/static", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8000" } },
});
