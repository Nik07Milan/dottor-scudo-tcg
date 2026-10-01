import { describe, expect, it } from "vitest";
import { matchupOf, runBotmatch } from "../src/botmatch";
import { randomBot } from "../src/bots/random";
import { HEROES } from "../src/data";

describe("botmatch", () => {
  const report = runBotmatch({ games: 27, bots: [randomBot, randomBot], seed: 100 });

  it("gioca il numero di partite richiesto e conta tutto", () => {
    expect(report.games).toBe(27);
    const byHero = Object.values(report.byHero);
    // Ogni partita coinvolge due posti eroe (anche nei mirror).
    expect(byHero.reduce((n, h) => n + h.games, 0)).toBe(54);
    for (const h of byHero) {
      expect(h.wins + h.losses + h.draws).toBe(h.games);
      expect(h.winrate).toBeCloseTo(h.games ? h.wins / h.games : 0);
    }
    const matchups = Object.values(report.byMatchup);
    expect(matchups.reduce((n, m) => n + m.games, 0)).toBe(27);
    for (const m of matchups) expect(m.p1Wins + m.p2Wins + m.draws).toBe(m.games);
  });

  it("riporta durata media e carte più giocate in ordine", () => {
    expect(report.avgTurns).toBeGreaterThan(0);
    expect(report.avgActions).toBeGreaterThan(report.avgTurns);
    expect(report.topCards.length).toBeGreaterThan(0);
    for (let i = 1; i < report.topCards.length; i++) expect(report.topCards[i - 1]!.plays).toBeGreaterThanOrEqual(report.topCards[i]!.plays);
  });

  it("è riproducibile e serializzabile in JSON", () => {
    expect(runBotmatch({ games: 27, bots: [randomBot, randomBot], seed: 100 })).toEqual(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("le coppie di eroi coprono tutte le 81 combinazioni ordinate", () => {
    const pairs = new Set(Array.from({ length: 81 }, (_, i) => matchupOf(i).join(">")));
    expect(pairs.size).toBe(HEROES.length * HEROES.length);
  });
});
