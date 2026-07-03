import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Caddie is a client-only PWA-style app. Base is relative so it can be hosted
// from any subpath (e.g. GitHub Pages) without extra config.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
