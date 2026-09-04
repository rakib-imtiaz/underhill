import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  build: {
    // the landmask + three modules are chunky by nature; the hero is the point
    // of the page, so a single big vendor chunk is fine here.
    chunkSizeWarningLimit: 1400,
  },
});
