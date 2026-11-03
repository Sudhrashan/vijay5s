import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite server forwards API, upload and WebSocket traffic to FastAPI,
// so the browser talks to one origin exactly as it will behind nginx in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/uploads": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
