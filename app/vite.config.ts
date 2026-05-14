import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5173 },
  build: {
    // Emit to repo-root `dist/` so Vercel (and other hosts) pick up the build
    // from the project root without extra config. Walrus Sites still works
    // because we point site-builder at `dist` instead of `app/dist`.
    outDir: "../dist",
    emptyOutDir: true,
  },
});
