import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    /* The 3D pages (film, fly mode, gear playground) are plain static files in public/experience/, served
       as-is at /experience/*.html in dev, build and preview alike (no proxy, no drafts server needed).
       They are not part of the React bundle: they carry their own import map and vendored three.js. */
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
