import { HIDDEN_CARD, deckCards, greedyBot, playGame, randomBot, type Action } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import type { ServerMessages } from "../../server/src/protocol";
import { ReplayMatch } from "../src/replay";

function fakeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule: (_ms: number, fn: () => void) => {
      queue.push(fn);
      return () => {
        const i = queue.indexOf(fn);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    flush(max = 5000) {
      for (let i = 0; i < max && queue.length > 0; i++) queue.shift()!();
    },
    pending: () => queue.length,
  };
}

const game = playGame(
  { seed: 11, players: [{ heroId: "nikson", deck: deckCards("nikson") }, { heroId: "lord-capognus", deck: deckCards("lord-capognus") }] },
  [greedyBot, randomBot],
  3,
);

function setup(viewer: "p1" | "p2" = "p1") {
  const clock = fakeClock();
  const match = new ReplayMatch(game.setup, game.actions, viewer, { schedule: clock.schedule });
  const updates: ServerMessages["update"][] = [];
  match.on({ update: (u) => updates.push(u), joined: () => {} });
  return { match, clock, updates, last: () => updates.at(-1)! };
}

describe("ReplayMatch (T5.3)", () => {
  it("parte dall'inizio, dal lato di chi guarda, senza mosse possibili", () => {
    const { match, last } = setup("p2");
    expect(match.step).toBe(0);
    expect(last().view.viewer).toBe("p2");
    expect(last().view.phase).toBe("mulligan");
    expect(last().view.players.p1.hand.every((c) => c.cardId === HIDDEN_CARD)).toBe(true);
    expect(match.filterLegal()).toEqual([]);
  });

  it("in riproduzione arriva fino alla fine con lo stesso esito della partita", () => {
    const { match, clock, updates, last } = setup();
    match.play();
    expect(match.playing).toBe(true);
    clock.flush();
    expect(match.playing).toBe(false);
    expect(match.step).toBe(game.actions.length);
    expect(updates).toHaveLength(game.actions.length + 1);
    expect(last().view.result).toEqual(game.result);
    expect(last().events.some((e) => e.type === "game_over")).toBe(true);
  });

  it("avanti e indietro un passo; indietro e ricomincia non animano", () => {
    const { match, last, clock } = setup();
    match.next();
    match.next();
    expect(match.step).toBe(2);
    expect(last().actor).toBe(game.actions[1]!.player);
    match.prev();
    expect(match.step).toBe(1);
    expect(last().events).toEqual([]);
    match.play();
    match.restart();
    expect(match.step).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it("con la plancia collegata non corre avanti: aspetta la fine delle animazioni di ogni passo", () => {
    const { match, clock } = setup();
    match.usePacing();
    match.play();
    clock.flush();
    expect(match.step).toBe(1);
    expect(match.playing).toBe(true);
    match.boardIdle();
    clock.flush();
    expect(match.step).toBe(2);
    match.pause();
    match.boardIdle();
    clock.flush();
    expect(match.step).toBe(2);
    expect(match.playing).toBe(false);
  });

  it("se le azioni non si rigiocano più (carte cambiate) il costruttore lo dice", () => {
    const broken = [...game.actions.slice(0, 3), { type: "end_turn", player: "p3" } as unknown as Action];
    expect(() => new ReplayMatch(game.setup, broken, "p1")).toThrow();
  });
});
