import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { deckCards } from "../src/data";
import { createGame, type GameSetup } from "../src/game";
import { getLegalActions } from "../src/legal";
import { replay } from "../src/replay";
import { nextRandom } from "../src/rng";
import type { Action, GameState } from "../src/state";

const setup = (seed: number): GameSetup => ({
  seed,
  players: [
    { heroId: "il-creatore", deck: deckCards("il-creatore") },
    { heroId: "dr-grappolo", deck: deckCards("dr-grappolo") },
  ],
});

/** Gioca una partita con mosse legali scelte da un RNG del test; restituisce azioni e stati. */
function record(seed: number, maxSteps = 400): { actions: Action[]; states: GameState[] } {
  let state = createGame(setup(seed)).state;
  const states = [state];
  const actions: Action[] = [];
  let rng = seed * 7919;
  for (let i = 0; i < maxSteps && state.phase !== "ended"; i++) {
    const legal = (["p1", "p2"] as const).flatMap((p) => getLegalActions(state, p)).filter((a) => a.type !== "concede");
    const r = nextRandom(rng);
    rng = r.seed;
    const action = legal[Math.floor(r.value * legal.length)]!;
    state = applyAction(state, action).state;
    actions.push(action);
    states.push(state);
  }
  return { actions, states };
}

const snapshot = (s: GameState) => JSON.stringify(s);

describe("determinismo", () => {
  it.each([3, 17, 256])("stesso seed + stesse azioni → stessa partita, passo per passo (seed %i)", (seed) => {
    const { actions, states } = record(seed);
    expect(actions.length).toBeGreaterThan(20);
    const replayed = replay(setup(seed), actions);
    expect(replayed.states.map(snapshot)).toEqual(states.map(snapshot));
  });

  it("anche gli eventi sono identici", () => {
    const { actions } = record(5);
    expect(replay(setup(5), actions).events).toEqual(replay(setup(5), actions).events);
  });

  it("seed diverso → partita diversa con le stesse prime azioni", () => {
    const a = createGame(setup(1)).state;
    const b = createGame(setup(2)).state;
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  it("un'azione illegale nel replay viene rifiutata", () => {
    const { actions } = record(3);
    const broken = [...actions.slice(0, 5), { type: "end_turn", player: "p3" } as unknown as Action];
    expect(() => replay(setup(3), broken)).toThrow();
  });
});

describe("purezza del codice dell'engine (principio 1)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f: string) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });

  it("niente Math.random, Date.now, new Date né I/O in src/", () => {
    for (const file of files(fileURLToPath(new URL("../src", import.meta.url)))) {
      const code = readFileSync(file, "utf8");
      for (const forbidden of ["Math.random", "Date.now", "new Date(", "require(", 'from "node:', "fetch(", "process."]) {
        expect(code.includes(forbidden), `${file}: ${forbidden}`).toBe(false);
      }
    }
  });
});
