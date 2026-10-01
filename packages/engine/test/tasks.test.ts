import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { CARDS_BY_ID } from "../src/data";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { GameState, PlayerId } from "../src/state";
import { addMinion, codeOf, fillBoard, other, startedGame, withHand } from "./helpers";

function table(hand: string[]) {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const { state, ids } = withHand(s0, me, hand);
  state.players[me].mana.available = 30; // i test giocano molte carte in un turno: i costi non sono l'oggetto
  return { state, me, foe: other(me), ids };
}

/** Gioca le carte in ordine (servitori in fondo a destra, Pratiche senza bersaglio). */
function playAll(state: GameState, player: PlayerId, ids: number[]): GameState {
  let s = state;
  for (const id of ids) {
    const card = s.players[player].hand.find((c) => c.instanceId === id)!;
    const isMinion = CARDS_BY_ID.get(card.cardId)!.type === "minion";
    s = applyAction(s, { type: "play_card", player, card: id, ...(isMinion ? { position: s.players[player].board.length } : {}) }).state;
  }
  return s;
}

describe("zona Task", () => {
  it("giocata, la Task va nella zona Task con progresso 0 e obiettivo dalla carta", () => {
    const { state, me, ids } = table(["le-task"]);
    const { state: s, events } = applyAction(state, { type: "play_card", player: me, card: ids[0]! });
    expect(s.players[me].task).toEqual({ cardId: "le-task", progress: 0, goal: 5 });
    expect(s.players[me].board).toEqual([]);
    expect(events).toContainEqual({ type: "task_progress", player: me, cardId: "le-task", progress: 0, goal: 5 });
  });

  it("con una Task attiva non se ne gioca un'altra", () => {
    const { state, me, ids } = table(["le-task", "le-task"]);
    const s = playAll(state, me, [ids[0]!]);
    expect(getLegalActions(s, me).some((a) => a.type === "play_card" && a.card === ids[1])).toBe(false);
    expect(codeOf(s, { type: "play_card", player: me, card: ids[1]! })).toBe("task_active");
  });
});

describe("Le Task: gioca 5 Pratiche → rigenera 10 ferie", () => {
  const spells = ["scorta-di-teresa", "scorta-di-teresa", "riunione-infinita", "troiaio-comunicazioni", rules.COIN_CARD_ID];

  it("conta solo le Pratiche giocate dopo la Task, poi dà la ricompensa e lascia la zona", () => {
    const { state, me, ids } = table(["scorta-di-teresa", "le-task", ...spells]);
    state.players[me].hero.health = 10;
    let s = playAll(state, me, ids.slice(0, 2)); // la prima Pratica è prima della Task: non conta
    expect(s.players[me].task?.progress).toBe(0);

    s = playAll(s, me, ids.slice(2, 6));
    expect(s.players[me].task?.progress).toBe(4);

    const { state: done, events } = applyAction(s, { type: "play_card", player: me, card: ids[6]! });
    expect(done.players[me].task).toBeNull();
    expect(events).toContainEqual({ type: "task_progress", player: me, cardId: "le-task", progress: 5, goal: 5 });
    expect(events).toContainEqual({ type: "task_completed", player: me, cardId: "le-task" });
    // 10 + 3 × 3 (le tre Scorte di Teresa) = 19, poi +10 dalla ricompensa.
    expect(done.players[me].hero.health).toBe(29);
  });

  it("i servitori non contano", () => {
    const { state, me, ids } = table(["le-task", "cliente-insistente"]);
    const s = playAll(state, me, ids);
    expect(s.players[me].task?.progress).toBe(0);
  });

  it("la ricompensa arriva una volta sola; poi si può giocare un'altra Task", () => {
    const { state, me, ids } = table(["le-task", ...spells, "scorta-di-teresa", "le-task"]);
    const done = playAll(state, me, ids.slice(0, 6));
    expect(done.players[me].task).toBeNull();
    const after = playAll(done, me, [ids[6]!]);
    expect(after.players[me].task).toBeNull();
    const again = playAll(after, me, [ids[7]!]);
    expect(again.players[me].task).toEqual({ cardId: "le-task", progress: 0, goal: 5 });
  });
});

describe("Progetto Nettuno: evoca 6 servitori → Nettuno 8/8 con Burocrazia", () => {
  it("conta servitori giocati ed evocati (anche i token)", () => {
    const { state, me, ids } = table(["progetto-nettuno", "dr-grappolo", "cliente-insistente"]);
    const s = playAll(state, me, ids);
    // Dr Grappolo (1) + 2 Studenti + Cliente insistente = 4
    expect(s.players[me].task?.progress).toBe(4);
  });

  it("le evocazioni sul campo avversario contano per l'avversario, non per me", () => {
    const { state, me, foe, ids } = table(["progetto-nettuno", "scoppio-d-ira"]);
    addMinion(state, me, { cardId: "miletta", health: 1 });
    const s = playAll(state, me, ids);
    expect(s.players[me].task?.progress).toBe(0);
    expect(s.players[foe].board.map((m) => m.cardId)).toEqual(["spirito-zanzara"]);
  });

  it("al sesto servitore evoca Nettuno, che non conta", () => {
    const { state, me, ids } = table(["progetto-nettuno", "dr-grappolo", "assedio-dei-call-center"]);
    const { state: s, events } = applyAction(playAll(state, me, ids.slice(0, 2)), { type: "play_card", player: me, card: ids[2]! });
    expect(events).toContainEqual({ type: "task_completed", player: me, cardId: "progetto-nettuno" });
    expect(s.players[me].task).toBeNull();
    const nettuno = s.players[me].board.find((m) => m.cardId === "nettuno");
    expect(nettuno).toMatchObject({ attack: 8, health: 8, keywords: ["burocrazia"] });
  });

  it("con la scrivania piena Nettuno va in mano", () => {
    const { state, me, ids } = table(["progetto-nettuno", "cliente-insistente"]);
    let s = playAll(state, me, [ids[0]!]);
    s.players[me].task!.progress = 5;
    fillBoard(s, me, rules.MAX_BOARD - 1);
    s = playAll(s, me, [ids[1]!]);
    expect(s.players[me].board).toHaveLength(rules.MAX_BOARD);
    expect(s.players[me].hand.at(-1)?.cardId).toBe("nettuno");
  });
});
