import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { IllegalActionError, type IllegalActionCode } from "../src/errors";
import { createGame } from "../src/game";
import { actionKey, getLegalActions } from "../src/legal";
import { nextRandom } from "../src/rng";
import type { Action, GameState, PlayerId } from "../src/state";
import { other, setupFor, startedGame } from "./helpers";

const PLAYERS = ["p1", "p2"] as const;
const created = (seed = 1) => createGame(setupFor(seed)).state;

const codeOf = (state: GameState, action: unknown): IllegalActionCode | "accepted" => {
  try {
    applyAction(state, action as Action);
    return "accepted";
  } catch (e) {
    if (e instanceof IllegalActionError) return e.code;
    throw e; // qualsiasi altro errore è un bug
  }
};

/** Azioni candidate per uno stato: tutte le legali più una serie di illegali o malformate. */
function candidates(state: GameState): unknown[] {
  const out: unknown[] = [];
  for (const p of PLAYERS) {
    const hand = state.players[p].hand.map((c) => c.instanceId);
    const foreign = state.players[other(p)].hand.map((c) => c.instanceId);
    out.push(...getLegalActions(state, p));
    out.push(
      { type: "end_turn", player: p },
      { type: "mulligan", player: p, replace: [] },
      { type: "mulligan", player: p, replace: hand.slice(0, 2).reverse() },
      { type: "mulligan", player: p, replace: hand.length ? [hand[0], hand[0]] : [] },
      { type: "mulligan", player: p, replace: foreign.slice(0, 1) },
      { type: "mulligan", player: p, replace: [999_999] },
      { type: "mulligan", player: p, replace: "tutte" },
      { type: "mulligan", player: p },
      { type: "play_card", player: p, card: hand[0] ?? 1 },
      { type: "concede", player: p },
    );
  }
  out.push({ type: "end_turn", player: "p3" }, { type: "boh", player: "p1" }, { type: "end_turn" }, null, 42, "end_turn");
  return out;
}

/** Partite casuali ma deterministiche: a ogni passo una mossa legale scelta con l'RNG del test. */
function* randomWalk(seed: number, steps: number): Generator<GameState> {
  let state = created(seed);
  let rng = seed;
  for (let i = 0; i < steps; i++) {
    yield state;
    const legal = PLAYERS.flatMap((p) => getLegalActions(state, p));
    if (legal.length === 0) return;
    const r = nextRandom(rng);
    rng = r.seed;
    state = applyAction(state, legal[Math.floor(r.value * legal.length)]!).state;
  }
  yield state;
}

describe("getLegalActions", () => {
  it("nel mulligan offre ogni sottoinsieme della mano a entrambi i giocatori", () => {
    const s = created();
    for (const p of PLAYERS) {
      const legal = getLegalActions(s, p);
      expect(legal).toHaveLength(2 ** s.players[p].hand.length);
      expect(legal.every((a) => a.type === "mulligan")).toBe(true);
      expect(legal).toContainEqual({ type: "mulligan", player: p, replace: [] });
    }
  });

  it("dopo il proprio mulligan un giocatore aspetta, l'altro può ancora sceglierlo", () => {
    const s = applyAction(created(), { type: "mulligan", player: "p1", replace: [] }).state;
    expect(getLegalActions(s, "p1")).toEqual([]);
    expect(getLegalActions(s, "p2").length).toBeGreaterThan(0);
  });

  it("nella fase principale il giocatore attivo può finire il turno, l'altro non ha mosse", () => {
    const s = startedGame();
    expect(getLegalActions(s, s.activePlayer)).toContainEqual({ type: "end_turn", player: s.activePlayer });
    expect(getLegalActions(s, other(s.activePlayer))).toEqual([]);
  });

  it("con una scelta in sospeso o a partita finita non c'è end_turn", () => {
    const pending = startedGame();
    pending.pendingChoice = { kind: "discover", player: pending.activePlayer, options: ["sasso"] };
    expect(getLegalActions(pending, pending.activePlayer)).not.toContainEqual({ type: "end_turn", player: pending.activePlayer });

    const ended = startedGame();
    ended.phase = "ended";
    ended.result = { winner: "p1", reason: "concede" };
    for (const p of PLAYERS) expect(getLegalActions(ended, p)).toEqual([]);
  });

  it("restituisce azioni in forma canonica, senza duplicati", () => {
    const s = created(4);
    for (const p of PLAYERS) {
      const keys = getLegalActions(s, p).map(actionKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("applyAction accetta un'azione ⇔ è in getLegalActions", () => {
  it.each([1, 2, 3, 7, 11, 23, 42, 99])("partita casuale con seed %i", (seed) => {
    let checked = 0;
    for (const state of randomWalk(seed, 40)) {
      const legalKeys = new Set(PLAYERS.flatMap((p) => getLegalActions(state, p)).map(actionKey));
      for (const action of candidates(state)) {
        const result = codeOf(state, action);
        const isLegal = typeof action === "object" && action !== null && legalKeys.has(actionKey(action as Action));
        expect(result === "accepted", JSON.stringify(action)).toBe(isLegal);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("rifiuto delle azioni illegali", () => {
  it("l'ordine delle carte nel mulligan non conta", () => {
    const s = created(3);
    const [a, b] = s.players.p1.hand.map((c) => c.instanceId);
    const one = applyAction(s, { type: "mulligan", player: "p1", replace: [a!, b!] });
    const two = applyAction(s, { type: "mulligan", player: "p1", replace: [b!, a!] });
    expect(two).toEqual(one);
  });

  it("dà il codice di errore più utile", () => {
    const mull = created();
    const main = startedGame();
    const idle = other(main.activePlayer);
    const ended = structuredClone(main);
    ended.phase = "ended";
    const pending = structuredClone(main);
    pending.pendingChoice = { kind: "discover", player: main.activePlayer, options: ["sasso"] };
    const handId = mull.players.p1.hand[0]!.instanceId;

    expect(codeOf(ended, { type: "end_turn", player: main.activePlayer })).toBe("game_over");
    expect(codeOf(main, { type: "end_turn", player: idle })).toBe("not_your_turn");
    expect(codeOf(main, { type: "mulligan", player: idle, replace: [] })).toBe("wrong_phase");
    expect(codeOf(mull, { type: "end_turn", player: "p1" })).toBe("wrong_phase");
    expect(codeOf(applyAction(mull, { type: "mulligan", player: "p1", replace: [] }).state, { type: "mulligan", player: "p1", replace: [] })).toBe(
      "already_done",
    );
    expect(codeOf(mull, { type: "mulligan", player: "p1", replace: [mull.players.p2.hand[0]!.instanceId] })).toBe("card_not_in_hand");
    expect(codeOf(mull, { type: "mulligan", player: "p1", replace: [handId, handId] })).toBe("duplicate_card");
    expect(codeOf(pending, { type: "end_turn", player: main.activePlayer })).toBe("pending_choice");
    expect(codeOf(main, { type: "play_card", player: main.activePlayer, card: 1 })).toBe("not_implemented");
  });

  it("le azioni malformate danno errore 'malformed', mai un crash", () => {
    const s = created();
    const bad: unknown[] = [
      null,
      undefined,
      42,
      "end_turn",
      {},
      { type: "end_turn" },
      { type: "end_turn", player: "p3" },
      { type: "mulligan", player: "p1" },
      { type: "mulligan", player: "p1", replace: "tutte" },
      { type: "mulligan", player: "p1", replace: [1.5] },
      { type: "mulligan", player: "p1", replace: [null] },
    ];
    for (const a of bad) expect(codeOf(s, a), JSON.stringify(a)).toBe("malformed");
    expect(codeOf(s, { type: "boh", player: "p1" })).toBe("unknown_action");
  });

  it("un'azione rifiutata non modifica lo stato", () => {
    const s = startedGame();
    const copy = structuredClone(s);
    codeOf(s, { type: "end_turn", player: other(s.activePlayer) as PlayerId });
    expect(s).toEqual(copy);
  });
});
