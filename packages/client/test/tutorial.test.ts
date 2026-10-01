import { getLegalActions, type Action } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS, TutorialMatch } from "../src/tutorial/tutorial";
import type { ServerMessages } from "../../server/src/protocol";

function setup() {
  const queue: (() => void)[] = [];
  const schedule = (_ms: number, fn: () => void) => {
    queue.push(fn);
    return () => void queue.splice(queue.indexOf(fn), 1);
  };
  const match = new TutorialMatch({ schedule });
  const updates: ServerMessages["update"][] = [];
  const errors: ServerMessages["error"][] = [];
  match.on({ update: (u) => updates.push(u), error: (e) => errors.push(e), joined: () => {}, waiting: () => {}, opponent: () => {} });
  const flush = () => {
    for (let i = 0; i < 100 && queue.length > 0; i++) queue.shift()!();
  };
  const last = () => updates.at(-1)!;
  /** Le mosse che la plancia proporrebbe ora (filtrate dal tutorial). */
  const proposed = () => match.filterLegal(getLegalActions(last().view, "p1"));
  const play = (a: Action) => {
    const { player: _p, ...rest } = a;
    match.send(rest);
    flush();
  };
  return { match, updates, errors, flush, last, proposed, play };
}

describe("tutorial", () => {
  it("parte con il primo suggerimento", () => {
    const { last } = setup();
    expect(last().hint).toBe(TUTORIAL_STEPS[0]!.hint);
    expect(last().view.players.p1.hero.heroId).toBe("jackson");
  });

  it("a ogni passo propone esattamente le mosse spiegate", () => {
    const { proposed, flush } = setup();
    flush();
    expect(proposed()).toEqual([{ type: "mulligan", player: "p1", replace: [] }]);
  });

  it("seguendo i suggerimenti si vince, passando per tutti i passi", () => {
    const { proposed, play, last, flush } = setup();
    flush();
    const hints = new Set<string>();
    for (let i = 0; i < 40 && last().view.phase !== "ended"; i++) {
      if (last().hint) hints.add(last().hint!);
      const moves = proposed();
      expect(moves.length, `passo senza mosse proposte: ${last().hint}`).toBeGreaterThan(0);
      play(moves[0]!);
    }
    expect(last().view.result).toEqual({ winner: "p1", reason: "hero_defeated" });
    for (const step of TUTORIAL_STEPS) expect(hints).toContain(step.hint);
    expect(last().hint).toMatch(/completato/i);
  });

  it("una mossa diversa da quella spiegata viene rifiutata", () => {
    const { match, errors, flush, last } = setup();
    flush();
    const before = last().view;
    const hand = before.players.p1.hand;
    match.send({ type: "mulligan", replace: [hand[0]!.instanceId] });
    expect(errors.at(-1)).toMatchObject({ code: "tutorial" });
    expect(last().view).toEqual(before);
  });
});
