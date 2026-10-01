// Bot contro bot (T2.3): N partite seedate con i mazzi precostruiti, statistiche per eroe e per scontro.
// Puro e deterministico: stesso input ⇒ stesso report. La stampa è in scripts/botmatch.ts.

import type { Bot } from "./bots/bot";
import { deckCards, HEROES } from "./data";
import { playGame } from "./match";

export interface HeroStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

export interface MatchupStats {
  games: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
}

export interface BotmatchReport {
  games: number;
  bots: [string, string];
  seed: number;
  byHero: Record<string, HeroStats>;
  /** Chiave "eroeP1 vs eroeP2". */
  byMatchup: Record<string, MatchupStats>;
  avgTurns: number;
  avgActions: number;
  /** Carte giocate dalla mano, dalla più frequente (prime 15). */
  topCards: { cardId: string; plays: number }[];
}

/** Eroi della partita i: tutte le 81 coppie ordinate a rotazione, mirror compresi. */
export function matchupOf(i: number): [string, string] {
  const n = HEROES.length;
  return [HEROES[i % n]!.id, HEROES[Math.floor(i / n) % n]!.id];
}

export function runBotmatch(options: { games: number; bots: readonly [Bot, Bot]; seed: number }): BotmatchReport {
  const { games, bots, seed } = options;
  const byHero: Record<string, HeroStats> = Object.fromEntries(HEROES.map((h) => [h.id, { games: 0, wins: 0, losses: 0, draws: 0, winrate: 0 }]));
  const byMatchup: Record<string, MatchupStats> = {};
  const plays: Record<string, number> = {};
  let turns = 0;
  let actions = 0;

  for (let i = 0; i < games; i++) {
    const [a, b] = matchupOf(i);
    const gameSeed = seed + i;
    const record = playGame({ seed: gameSeed, players: [{ heroId: a, deck: deckCards(a) }, { heroId: b, deck: deckCards(b) }] }, bots, gameSeed);
    const winner = record.result.winner;
    turns += record.turns;
    actions += record.actions.length;

    for (const [hero, seat] of [
      [a, "p1"],
      [b, "p2"],
    ] as const) {
      const h = byHero[hero]!;
      h.games++;
      if (winner === null) h.draws++;
      else if (winner === seat) h.wins++;
      else h.losses++;
    }

    const key = `${a} vs ${b}`;
    const m = (byMatchup[key] ??= { games: 0, p1Wins: 0, p2Wins: 0, draws: 0 });
    m.games++;
    if (winner === "p1") m.p1Wins++;
    else if (winner === "p2") m.p2Wins++;
    else m.draws++;

    for (const p of ["p1", "p2"] as const) for (const id of record.final.players[p].played) plays[id] = (plays[id] ?? 0) + 1;
  }

  for (const h of Object.values(byHero)) h.winrate = h.games ? h.wins / h.games : 0;
  const topCards = Object.entries(plays)
    .map(([cardId, n]) => ({ cardId, plays: n }))
    .sort((x, y) => y.plays - x.plays || (x.cardId < y.cardId ? -1 : 1))
    .slice(0, 15);

  return {
    games,
    bots: [bots[0].name, bots[1].name],
    seed,
    byHero,
    byMatchup,
    avgTurns: games ? turns / games : 0,
    avgActions: games ? actions / games : 0,
    topCards,
  };
}
