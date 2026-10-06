import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API binds to loopback only, so the dev server proxies /api to it
// instead of exposing the API to other origins.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
