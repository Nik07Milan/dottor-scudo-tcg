import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { IllegalActionError } from "../src/errors";
import { createGame } from "../src/game";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { ApplyResult, GameState, PlayerId } from "../src/state";
import { endTurn, other, setupFor, startedGame } from "./helpers";

const PLAYERS = ["p1", "p2"] as const;

/** Prepara il burnout letale: al prossimo inizio turno `victim` pesca a vuoto e scende a 0. */
function lethalFatigue(state: GameState, victim: PlayerId): GameState {
  const s = structuredClone(state);
  s.players[victim].deck = [];
  s.players[victim].hero.health = 1;
  return s;
}

function expectEnded(r: ApplyResult, winner: PlayerId | null, reason: string) {
  expect(r.state.phase).toBe("ended");
  expect(r.state.result).toEqual({ winner, reason });
  expect(r.events.at(-1)).toEqual({ type: "game_over", result: { winner, reason } });
  for (const p of PLAYERS) expect(getLegalActions(r.state, p)).toEqual([]);
}

describe("fine partita per ferie a zero", () => {
  it.each(PLAYERS)("se %s scende a 0 ferie perde e l'avversario vince", (loser) => {
    // Il perdente deve essere il prossimo a iniziare il turno.
    let s = startedGame();
    if (s.activePlayer === loser) s = endTurn(s).state;
    const r = endTurn(lethalFatigue(s, loser));
    expectEnded(r, other(loser), "hero_defeated");
    expect(r.state.players[loser].hero.health).toBeLessThanOrEqual(0);
  });

  it("un eroe a 0 a metà azione non interrompe la risoluzione: game_over arriva per ultimo", () => {
    const s = startedGame();
    const victim = other(s.activePlayer);
    const r = endTurn(lethalFatigue(s, victim));
    const types = r.events.map((e) => e.type);
    expect(types).toEqual(["turn_ended", "turn_started", "mana_changed", "fatigue", "damage", "game_over"]);
  });

  it("se entrambi gli eroi sono a 0 alla fine della stessa azione è pareggio", () => {
    const s = startedGame();
    const active = s.activePlayer;
    const victim = other(active);
    // Oggi nessuna carta colpisce entrambi gli eroi insieme (arriveranno con gli effetti):
    // simuliamo l'eroe attivo già a 0 e il burnout letale dell'altro nella stessa azione.
    const prepared = lethalFatigue(s, victim);
    prepared.players[active].hero.health = 0;
    expectEnded(endTurn(prepared), null, "hero_defeated");
  });

  it("finché nessuno è a 0 la partita continua", () => {
    const r = endTurn(startedGame());
    expect(r.state.phase).toBe("main");
    expect(r.state.result).toBeNull();
    expect(r.events.some((e) => e.type === "game_over")).toBe(false);
  });
});

describe("concede", () => {
  it("il giocatore attivo può arrendersi: vince l'avversario", () => {
    const s = startedGame();
    const r = applyAction(s, { type: "concede", player: s.activePlayer });
    expectEnded(r, other(s.activePlayer), "concede");
  });

  it("ci si può arrendere anche fuori turno, durante il mulligan o con una scelta in sospeso", () => {
    const s = startedGame();
    expectEnded(applyAction(s, { type: "concede", player: other(s.activePlayer) }), s.activePlayer, "concede");

    const mull = createGame(setupFor(2)).state;
    expectEnded(applyAction(mull, { type: "concede", player: "p2" }), "p1", "concede");

    const pending = startedGame();
    pending.pendingChoice = { kind: "discover", player: pending.activePlayer, options: ["sasso"] };
    expect(getLegalActions(pending, pending.activePlayer)).toEqual([{ type: "concede", player: pending.activePlayer }]);
  });

  it("concede è sempre tra le mosse legali di entrambi finché la partita è in corso", () => {
    for (const s of [createGame(setupFor(1)).state, startedGame()]) {
      for (const p of PLAYERS) expect(getLegalActions(s, p)).toContainEqual({ type: "concede", player: p });
    }
  });
});

describe("limite di turni", () => {
  it(`alla fine del turno ${rules.TURN_LIMIT} la partita finisce in pareggio`, () => {
    const s = startedGame();
    s.turn = rules.TURN_LIMIT - 1;
    const atLimit = endTurn(s).state;
    expect(atLimit.turn).toBe(rules.TURN_LIMIT);
    expect(atLimit.phase).toBe("main");

    const r = endTurn(atLimit);
    expectEnded(r, null, "turn_limit");
    expect(r.state.turn).toBe(rules.TURN_LIMIT);
    expect(r.events.some((e) => e.type === "turn_started")).toBe(false);
  });

  it("se all'ultimo turno un eroe è a 0 prevale la sconfitta sul pareggio", () => {
    const s = startedGame();
    s.turn = rules.TURN_LIMIT;
    const loser = s.activePlayer;
    s.players[loser].hero.health = 0;
    expectEnded(endTurn(s), other(loser), "hero_defeated");
  });
});

describe("dopo la fine", () => {
  it("ogni azione è rifiutata con game_over", () => {
    const s = startedGame();
    const ended = applyAction(s, { type: "concede", player: "p1" }).state;
    for (const p of PLAYERS) {
      for (const action of [
        { type: "end_turn", player: p },
        { type: "concede", player: p },
      ] as const) {
        expect(() => applyAction(ended, action)).toThrow(IllegalActionError);
        try {
          applyAction(ended, action);
        } catch (e) {
          expect((e as IllegalActionError).code).toBe("game_over");
        }
      }
    }
  });
});
