import { describe, expect, it } from "vitest";
import { greedyBot, evaluate } from "../src/bots/greedy";
import { randomBot } from "../src/bots/random";
import { deckCards, HEROES } from "../src/data";
import type { GameSetup } from "../src/game";
import { getLegalActions } from "../src/legal";
import { playGame } from "../src/match";
import { getPlayerView } from "../src/view";
import { addMinion, heroRef, minionRef, startedGame, withHand } from "./helpers";

const ids = HEROES.map((h) => h.id);
const setupFor = (seed: number): GameSetup => {
  const a = ids[seed % ids.length]!;
  const b = ids[(seed * 5 + 2) % ids.length]!;
  return { seed, players: [{ heroId: a, deck: deckCards(a) }, { heroId: b, deck: deckCards(b) }] };
};

describe("valutazione", () => {
  it("vincere vale più di tutto, perdere meno di tutto", () => {
    const s = startedGame();
    const me = s.activePlayer;
    const won = structuredClone(s);
    won.phase = "ended";
    won.result = { winner: me, reason: "hero_defeated" };
    const lost = structuredClone(won);
    lost.result = { winner: me === "p1" ? "p2" : "p1", reason: "hero_defeated" };
    expect(evaluate(won, me)).toBeGreaterThan(evaluate(s, me) + 1000);
    expect(evaluate(lost, me)).toBeLessThan(evaluate(s, me) - 1000);
  });

  it("un servitore in più sulla propria scrivania migliora la posizione", () => {
    const s = startedGame();
    const me = s.activePlayer;
    const better = structuredClone(s);
    addMinion(better, me, { attack: 3, health: 3 });
    expect(evaluate(better, me)).toBeGreaterThan(evaluate(s, me));
  });
});

describe("decisioni", () => {
  const decide = (state: ReturnType<typeof startedGame>) => {
    const me = state.activePlayer;
    return greedyBot.choose(getPlayerView(state, me), me, getLegalActions(state, me), 1).action;
  };

  it("chiude la partita quando ha il colpo letale", () => {
    const s = startedGame();
    const me = s.activePlayer;
    const foe = me === "p1" ? "p2" : "p1";
    s.players[foe].hero.health = 3;
    const a = addMinion(s, me, { attack: 3 });
    expect(decide(s)).toEqual({ type: "attack", player: me, attacker: minionRef(a), defender: heroRef(foe) });
  });

  it("non usa Klaudioken sul proprio eroe", () => {
    const s0 = startedGame();
    const me = s0.activePlayer;
    const { state } = withHand(s0, me, ["klaudioken"]);
    const action = decide(state);
    expect(action.type === "play_card" && action.target?.kind === "hero" && action.target.player === me).toBe(false);
  });

  it("gioca un servitore quando può invece di passare", () => {
    const s0 = startedGame();
    const me = s0.activePlayer;
    const { state } = withHand(s0, me, ["fila-del-giovedi"]);
    expect(decide(state).type).toBe("play_card");
  });
});

describe("greedy contro random", () => {
  it("vince più del 70% delle partite (alternando chi è p1)", () => {
    let greedyWins = 0;
    const games = 40;
    for (let seed = 0; seed < games; seed++) {
      const greedyFirst = seed % 2 === 0;
      const r = playGame(setupFor(seed), greedyFirst ? [greedyBot, randomBot] : [randomBot, greedyBot], seed);
      if (r.result.winner === (greedyFirst ? "p1" : "p2")) greedyWins++;
    }
    expect(greedyWins / games).toBeGreaterThan(0.7);
  }, 300_000);
});
