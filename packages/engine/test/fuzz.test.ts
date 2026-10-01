import { describe, expect, it } from "vitest";
import { matchupOf } from "../src/botmatch";
import { greedyBot } from "../src/bots/greedy";
import { randomBot } from "../src/bots/random";
import { deckCards } from "../src/data";
import { checkInvariants } from "../src/invariants";
import { playGame } from "../src/match";
import { startedGame } from "./helpers";

const setupFor = (i: number) => {
  const [a, b] = matchupOf(i * 13);
  return { seed: 10_000 + i, players: [{ heroId: a, deck: deckCards(a) }, { heroId: b, deck: deckCards(b) }] as const };
};

describe("checkInvariants", () => {
  it("uno stato valido non ha violazioni", () => {
    expect(checkInvariants(startedGame())).toEqual([]);
  });

  it("segnala le violazioni", () => {
    const s = startedGame();
    const me = s.activePlayer;
    s.players[me].mana.available = 11;
    s.players[me].hero.health = 31;
    s.players[me].hand.push(...Array.from({ length: 10 }, () => ({ instanceId: s.nextInstanceId++, cardId: "sasso", costModifier: 0 })));
    s.players[me].hand.push({ ...s.players[me].hand[0]! });
    const v = checkInvariants(s);
    expect(v.some((x) => x.includes("caffettini"))).toBe(true);
    expect(v.some((x) => x.includes("ferie"))).toBe(true);
    expect(v.some((x) => x.includes("mano"))).toBe(true);
    expect(v.some((x) => x.includes("id duplicato"))).toBe(true);
  });
});

describe("fuzz", () => {
  it("500 partite casuali: nessuna eccezione, invarianti rispettati a ogni passo", () => {
    for (let i = 0; i < 500; i++) {
      const setup = setupFor(i);
      const record = playGame({ ...setup, players: [...setup.players] }, [randomBot, randomBot], setup.seed, (state, action) => {
        const v = checkInvariants(state);
        if (v.length > 0) throw new Error(`seed ${setup.seed}, dopo ${JSON.stringify(action)}: ${v.join("; ")}`);
      });
      expect(record.final.phase).toBe("ended");
    }
  }, 300_000);

  it("40 partite greedy contro random: invarianti rispettati", () => {
    for (let i = 0; i < 40; i++) {
      const setup = setupFor(1000 + i);
      playGame({ ...setup, players: [...setup.players] }, [greedyBot, randomBot], setup.seed, (state, action) => {
        const v = checkInvariants(state);
        if (v.length > 0) throw new Error(`seed ${setup.seed}, dopo ${JSON.stringify(action)}: ${v.join("; ")}`);
      });
    }
  }, 300_000);
});
