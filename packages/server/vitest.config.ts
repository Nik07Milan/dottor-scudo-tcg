import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Colyseus usa il canale IPC del processo: con il pool "forks" (processi figli) si mescola con quello
    // di Vitest. I thread non usano quel canale.
    pool: "threads",
  },
});
