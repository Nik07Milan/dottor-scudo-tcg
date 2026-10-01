// CLI: fuzz dell'engine (T2.4). Migliaia di partite tra bot con controllo degli invarianti a ogni azione.
//   npm run fuzz                       2000 partite casuali
//   npm run fuzz -- --games 10000 --seed 50000 --greedy 0.1
// Ogni errore trovato va trasformato in un test di regressione prima di correggerlo (CLAUDE.md).
import { matchupOf } from "../src/botmatch";
import { greedyBot } from "../src/bots/greedy";
import { randomBot } from "../src/bots/random";
import { deckCards } from "../src/data";
import { checkInvariants } from "../src/invariants";
import { playGame } from "../src/match";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const games = Number(arg("games") ?? 2000);
const firstSeed = Number(arg("seed") ?? 1);
/** Quota di partite in cui p1 è greedy (più varietà di situazioni). */
const greedyShare = Number(arg("greedy") ?? 0.1);

const failures: string[] = [];
let actions = 0;
const started = performance.now();
for (let i = 0; i < games; i++) {
  const seed = firstSeed + i;
  const [a, b] = matchupOf(seed);
  const p1 = (i % 100) / 100 < greedyShare ? greedyBot : randomBot;
  try {
    const r = playGame({ seed, players: [{ heroId: a, deck: deckCards(a) }, { heroId: b, deck: deckCards(b) }] }, [p1, randomBot], seed, (state, action) => {
      const v = checkInvariants(state);
      if (v.length > 0) throw new Error(`dopo ${JSON.stringify(action)}: ${v.join("; ")}`);
    });
    actions += r.actions.length;
  } catch (e) {
    failures.push(`seed ${seed} (${a} vs ${b}, ${p1.name}): ${(e as Error).message}`);
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);

console.log(`${games} partite, ${actions} azioni in ${seconds}s.`);
if (failures.length === 0) {
  console.log("Nessuna violazione.");
} else {
  console.log(`${failures.length} partite con errori:`);
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  process.exitCode = 1;
}
