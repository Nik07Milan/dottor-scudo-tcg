// CLI: simula partite tra bot casuali e stampa il log (T1.20).
//   npm run simulate                         una partita, seed 1, eroi casuali
//   npm run simulate -- --seed 42            un'altra partita
//   npm run simulate -- --p1 jackson --p2 il-calabrone
//   npm run simulate -- --games 100          100 partite, solo il riepilogo
import { deckCards, HEROES, HEROES_BY_ID } from "../src/data";
import { randomBot } from "../src/bots/random";
import type { GameSetup } from "../src/game";
import { createEventLogger } from "../src/log";
import { playGame } from "../src/match";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function heroFor(flag: string | undefined, seed: number, salt: number): string {
  if (flag) {
    if (!HEROES_BY_ID.has(flag)) throw new Error(`eroe sconosciuto: ${flag}. Eroi: ${HEROES.map((h) => h.id).join(", ")}`);
    return flag;
  }
  return HEROES[(seed * salt + salt) % HEROES.length]!.id;
}

function setupFor(seed: number): GameSetup {
  const p1 = heroFor(arg("p1"), seed, 3);
  const p2 = heroFor(arg("p2"), seed, 7);
  return { seed, players: [{ heroId: p1, deck: deckCards(p1) }, { heroId: p2, deck: deckCards(p2) }] };
}

const firstSeed = Number(arg("seed") ?? 1);
const games = Number(arg("games") ?? 1);

if (games === 1) {
  const record = playGame(setupFor(firstSeed), [randomBot, randomBot], firstSeed);
  const logger = createEventLogger({ p1: record.setup.players[0].heroId, p2: record.setup.players[1].heroId });
  for (const e of record.events) {
    const line = logger.format(e);
    if (line !== null) console.log(line);
  }
  console.log(`\n${record.actions.length} azioni, ${record.turns} turni.`);
} else {
  let decided = 0;
  for (let seed = firstSeed; seed < firstSeed + games; seed++) {
    const r = playGame(setupFor(seed), [randomBot, randomBot], seed);
    const [a, b] = r.setup.players.map((p) => p.heroId);
    if (r.result.winner) decided++;
    console.log(`seed ${seed}: ${a} vs ${b} → ${r.result.winner ?? "pareggio"} (${r.result.reason}, ${r.turns} turni)`);
  }
  console.log(`\n${decided}/${games} partite con un vincitore.`);
}
