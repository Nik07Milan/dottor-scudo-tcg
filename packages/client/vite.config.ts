import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    // L'engine importa i dati da data/ nella radice del repo: Vite deve poterli servire.
    fs: { allow: [repoRoot] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000, // Phaser da solo pesa più di 1 MB
  },
});
