// CLI: bot contro bot con statistiche (T2.3).
//   npm run botmatch                              162 partite greedy contro greedy (2 giri delle 81 coppie)
//   npm run botmatch -- --games 810 --seed 7
//   npm run botmatch -- --bots greedy,random
//   npm run botmatch -- --json report.json        salva anche il report in JSON
import { writeFileSync } from "node:fs";
import type { Bot } from "../src/bots/bot";
import { greedyBot } from "../src/bots/greedy";
import { randomBot } from "../src/bots/random";
import { runBotmatch } from "../src/botmatch";
import { CARDS_BY_ID, HEROES_BY_ID } from "../src/data";

const BOTS: Record<string, Bot> = { greedy: greedyBot, random: randomBot };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const games = Number(arg("games") ?? 162);
const seed = Number(arg("seed") ?? 1);
const [b1, b2] = (arg("bots") ?? "greedy,greedy").split(",");
const bots = [BOTS[b1!], BOTS[b2!]] as const;
if (!bots[0] || !bots[1]) throw new Error(`bot sconosciuto in "${b1},${b2}". Bot: ${Object.keys(BOTS).join(", ")}`);

const started = performance.now();
const report = runBotmatch({ games, bots: [bots[0], bots[1]], seed });
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)}%`;
console.log(`\n${report.games} partite, ${report.bots.join(" contro ")}, seed ${seed} (${seconds}s)`);
console.log(`Durata media: ${report.avgTurns.toFixed(1)} turni, ${report.avgActions.toFixed(0)} azioni\n`);

console.log("Winrate per eroe");
for (const [id, h] of Object.entries(report.byHero).sort((x, y) => y[1].winrate - x[1].winrate)) {
  const name = (HEROES_BY_ID.get(id)?.name ?? id).padEnd(14);
  console.log(`  ${name} ${pct(h.winrate)}  (${h.wins}V ${h.losses}S ${h.draws}P su ${h.games})`);
}

console.log("\nCarte più giocate");
for (const { cardId, plays } of report.topCards) console.log(`  ${String(plays).padStart(5)}  ${CARDS_BY_ID.get(cardId)?.name ?? cardId}`);

const jsonPath = arg("json");
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nReport JSON: ${jsonPath}`);
}
