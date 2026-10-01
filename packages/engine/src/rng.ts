// RNG deterministico (mulberry32). Lo stato del generatore vive nello stato di gioco.
// Ogni funzione riceve il seed corrente e restituisce il valore insieme al seed successivo.

export interface Random<T> {
  value: T;
  seed: number;
}

export function nextRandom(seed: number): Random<number> {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Intero uniforme in [0, n). */
export function randomInt(seed: number, n: number): Random<number> {
  const r = nextRandom(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

/** Fisher–Yates su una copia: l'array in ingresso non viene modificato. */
export function shuffle<T>(seed: number, items: readonly T[]): Random<T[]> {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(s, i + 1);
    s = r.seed;
    [out[i], out[r.value]] = [out[r.value]!, out[i]!];
  }
  return { value: out, seed: s };
}
