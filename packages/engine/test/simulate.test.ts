import { describe, expect, it } from "vitest";
import { randomBot } from "../src/bots/random";
import { deckCards, HEROES } from "../src/data";
import type { GameSetup } from "../src/game";
import { getLegalActions } from "../src/legal";
import { createEventLogger } from "../src/log";
import { actionKey } from "../src/legal";
import { actorOf, playGame } from "../src/match";
import { getPlayerView } from "../src/view";

const heroIds = HEROES.map((h) => h.id);

/** Coppia di eroi diversa per ogni seed, con i mazzi precostruiti. */
const setupFor = (seed: number): GameSetup => {
  const a = heroIds[seed % heroIds.length]!;
  const b = heroIds[(seed * 7 + 3) % heroIds.length]!;
  return { seed, players: [{ heroId: a, deck: deckCards(a) }, { heroId: b, deck: deckCards(b) }] };
};

describe("bot casuale", () => {
  it("sceglie sempre una mossa legale e non si arrende se ha alternative", () => {
    const record = playGame(setupFor(1), [randomBot, randomBot], 1);
    expect(record.actions.some((a) => a.type === "concede")).toBe(false);
  });

  it("decide sulla propria vista: le mosse sono le stesse dello stato vero", () => {
    const record = playGame(setupFor(2), [randomBot, randomBot], 2);
    const state = record.final;
    expect(getLegalActions(getPlayerView(state, actorOf(state)), actorOf(state)).map(actionKey)).toEqual(
      getLegalActions(state, actorOf(state)).map(actionKey),
    );
  });
});

describe("partite simulate", () => {
  it("stesso seed → stessa partita", () => {
    const a = playGame(setupFor(5), [randomBot, randomBot], 5);
    const b = playGame(setupFor(5), [randomBot, randomBot], 5);
    expect(b.actions).toEqual(a.actions);
    expect(b.result).toEqual(a.result);
  });

  it("su 100 seed diversi ogni partita termina con un vincitore", () => {
    const results = Array.from({ length: 100 }, (_, seed) => playGame(setupFor(seed), [randomBot, randomBot], seed));
    for (const r of results) {
      expect(r.final.phase).toBe("ended");
      expect(r.turns).toBeLessThanOrEqual(90);
    }
    const winners = results.filter((r) => r.result.winner !== null).length;
    expect(winners).toBe(100);
  }, 120_000);
});

describe("log", () => {
  it("racconta la partita in italiano, dal primo turno al vincitore", () => {
    const record = playGame(setupFor(3), [randomBot, randomBot], 3);
    const logger = createEventLogger({ p1: record.setup.players[0].heroId, p2: record.setup.players[1].heroId });
    const lines = record.events.map((e) => logger.format(e)).filter((l): l is string => l !== null);
    expect(lines[0]).toMatch(/^Inizia la partita/);
    expect(lines.some((l) => l.includes("Turno 1"))).toBe(true);
    expect(lines.at(-1)).toMatch(/Vince|Pareggio/);
    expect(lines.join("\n")).not.toContain("undefined");
  });
});
