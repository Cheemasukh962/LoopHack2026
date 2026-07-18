import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The frontend talks to the Keeper backend at /api/v1. In dev we proxy that to the
// engine on :8787 (started alongside via `pnpm dev`). In production, set
// VITE_KEEPER_API_URL to a deployed backend — otherwise the app uses its local mock.
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api/v1": {
        target: process.env.KEEPER_API_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));
