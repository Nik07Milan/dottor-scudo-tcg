import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { effectiveCost } from "../src/costs";
import { CARDS_BY_ID } from "../src/data";
import { IllegalActionError, type IllegalActionCode } from "../src/errors";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { Action, GameState } from "../src/state";
import { fillBoard, other, startedGame, withHand } from "./helpers";

const base = startedGame();
const me = base.activePlayer;

const play = (state: GameState, card: number, position?: number) =>
  applyAction(state, { type: "play_card", player: me, card, ...(position === undefined ? {} : { position }) });

const codeOf = (state: GameState, action: Action): IllegalActionCode | "accepted" => {
  try {
    applyAction(state, action);
    return "accepted";
  } catch (e) {
    if (e instanceof IllegalActionError) return e.code;
    throw e;
  }
};

const playsOf = (state: GameState, card: number) =>
  getLegalActions(state, me).filter((a) => a.type === "play_card" && a.card === card);

describe("mosse legali di play_card", () => {
  it("un servitore si può mettere in ogni posizione da 0 a n", () => {
    const { state, ids } = withHand(base, me, ["il-crudo"]);
    fillBoard(state, me, 2);
    expect(playsOf(state, ids[0]!).map((a) => a.type === "play_card" && a.position)).toEqual([0, 1, 2]);
  });

  it("Pratiche e Strumenti non hanno posizione", () => {
    const { state, ids } = withHand(base, me, ["chiamata-api", "scudo-bike"]);
    expect(playsOf(state, ids[0]!)).toEqual([{ type: "play_card", player: me, card: ids[0] }]);
    expect(playsOf(state, ids[1]!)).toEqual([{ type: "play_card", player: me, card: ids[1] }]);
  });

  it("le carte troppo costose non sono giocabili", () => {
    const { state, ids } = withHand(base, me, ["klaudioken", "chiamata-api"], 3); // 4 e 1
    expect(playsOf(state, ids[0]!)).toEqual([]);
    expect(playsOf(state, ids[1]!)).toHaveLength(1);
    expect(codeOf(state, { type: "play_card", player: me, card: ids[0]! })).toBe("not_enough_mana");
  });

  it("con la scrivania piena i servitori non si giocano, le Pratiche sì", () => {
    const { state, ids } = withHand(base, me, ["il-cursore", "chiamata-api"]);
    fillBoard(state, me, rules.MAX_BOARD);
    expect(playsOf(state, ids[0]!)).toEqual([]);
    expect(codeOf(state, { type: "play_card", player: me, card: ids[0]!, position: 0 })).toBe("board_full");
    expect(playsOf(state, ids[1]!)).toHaveLength(1);
  });

  it("solo il giocatore attivo, solo nella fase principale", () => {
    const { state, ids } = withHand(base, other(me), ["chiamata-api"]);
    expect(codeOf(state, { type: "play_card", player: other(me), card: ids[0]! })).toBe("not_your_turn");
    const mull = structuredClone(state);
    mull.phase = "mulligan";
    mull.players[other(me)].mulliganDone = false;
    expect(codeOf(mull, { type: "play_card", player: other(me), card: ids[0]! })).toBe("wrong_phase");
  });

  it("rifiuta carte non in mano e posizioni sbagliate", () => {
    const { state, ids } = withHand(base, me, ["il-cursore", "chiamata-api"]);
    expect(codeOf(state, { type: "play_card", player: me, card: 999_999 })).toBe("card_not_in_hand");
    expect(codeOf(state, { type: "play_card", player: me, card: ids[0]! })).toBe("invalid_position");
    expect(codeOf(state, { type: "play_card", player: me, card: ids[0]!, position: 1 })).toBe("invalid_position");
    expect(codeOf(state, { type: "play_card", player: me, card: ids[0]!, position: -1 })).toBe("invalid_position");
    expect(codeOf(state, { type: "play_card", player: me, card: ids[1]!, position: 0 })).toBe("invalid_position");
  });
});

describe("giocare un servitore", () => {
  it("paga i caffettini, lascia la mano ed entra nella posizione scelta con un id nuovo", () => {
    const { state, ids } = withHand(base, me, ["il-cursore", "chiamata-api"], 5);
    fillBoard(state, me, 2);
    const [left, right] = state.players[me].board.map((m) => m.instanceId);
    const { state: s, events } = play(state, ids[0]!, 1);

    const p = s.players[me];
    expect(p.mana).toEqual({ max: 5, available: 3 });
    expect(p.hand.map((c) => c.instanceId)).toEqual([ids[1]]);
    expect(p.board.map((m) => m.instanceId)).toEqual([left, expect.any(Number), right]);
    const minion = p.board[1]!;
    expect(minion.instanceId).not.toBe(ids[0]);
    expect(minion.instanceId).toBeGreaterThanOrEqual(state.nextInstanceId);
    const def = CARDS_BY_ID.get("il-cursore")!;
    expect(minion).toEqual({
      instanceId: minion.instanceId,
      cardId: "il-cursore",
      owner: me,
      attack: def.attack,
      health: def.health,
      maxHealth: def.health,
      keywords: def.keywords,
      frozenTurns: 0,
      frozenOnTurn: null,
      attacksThisTurn: 0,
      summonedThisTurn: true,
    });
    expect(p.played).toEqual(["il-cursore"]);
    expect(events).toEqual([
      { type: "card_played", player: me, instanceId: ids[0], cardId: "il-cursore" },
      { type: "mana_changed", player: me, max: 5, available: 3 },
      { type: "minion_summoned", player: me, instanceId: minion.instanceId, cardId: "il-cursore", position: 1 },
    ]);
  });

  it("posizione 0 = sinistra, posizione n = destra", () => {
    const { state, ids } = withHand(base, me, ["il-cursore", "il-cursore"]);
    fillBoard(state, me, 1);
    const first = play(state, ids[0]!, 0).state;
    expect(first.players[me].board[0]!.cardId).toBe("il-cursore");
    const second = play(first, ids[1]!, 2).state;
    expect(second.players[me].board.map((m) => m.cardId)).toEqual(["il-cursore", "il-crudo", "il-cursore"]);
  });

  it("le keyword della carta vengono copiate, non condivise", () => {
    const { state, ids } = withHand(base, me, ["il-crudo"]);
    const s = play(state, ids[0]!, 0).state;
    expect(s.players[me].board[0]!.keywords).toEqual(["burocrazia"]);
    s.players[me].board[0]!.keywords.pop();
    expect(CARDS_BY_ID.get("il-crudo")!.keywords).toEqual(["burocrazia"]);
  });
});

describe("giocare una Pratica", () => {
  it("paga, lascia la mano e finisce in `played` senza toccare la scrivania", () => {
    const { state, ids } = withHand(base, me, ["chiamata-api"], 2);
    const { state: s, events } = play(state, ids[0]!);
    expect(s.players[me].hand).toEqual([]);
    expect(s.players[me].mana.available).toBe(1);
    expect(s.players[me].board).toEqual([]);
    expect(s.players[me].played).toEqual(["chiamata-api"]);
    expect(events[0]).toEqual({ type: "card_played", player: me, instanceId: ids[0], cardId: "chiamata-api" });
  });

  it("il Caffettino costa 0 e si gioca anche senza caffettini", () => {
    const { state, ids } = withHand(base, me, [rules.COIN_CARD_ID], 0);
    expect(playsOf(state, ids[0]!)).toHaveLength(1);
  });
});

describe("giocare uno Strumento", () => {
  it("equipaggia lo Strumento con attacco e durabilità della carta", () => {
    const { state, ids } = withHand(base, me, ["scudo-bike"]);
    const { state: s, events } = play(state, ids[0]!);
    const def = CARDS_BY_ID.get("scudo-bike")!;
    expect(s.players[me].weapon).toEqual({ instanceId: expect.any(Number), cardId: "scudo-bike", attack: def.attack, durability: def.durability });
    expect(events.at(-1)).toMatchObject({ type: "weapon_equipped", player: me, cardId: "scudo-bike" });
  });

  it("un nuovo Strumento distrugge quello equipaggiato", () => {
    const { state, ids } = withHand(base, me, ["scudo-bike", "tatine-mobile"]);
    const first = play(state, ids[0]!).state;
    const { state: s, events } = play(first, ids[1]!);
    expect(s.players[me].weapon?.cardId).toBe("tatine-mobile");
    const types = events.map((e) => e.type);
    expect(types.indexOf("weapon_destroyed")).toBeLessThan(types.indexOf("weapon_equipped"));
    expect(events).toContainEqual({ type: "weapon_destroyed", player: me, cardId: "scudo-bike" });
  });
});

describe("costo effettivo", () => {
  it("lo sconto sulla carta riduce il costo, mai sotto 0", () => {
    const { state, ids } = withHand(base, me, ["klaudioken", "chiamata-api"], 3);
    state.players[me].hand[0]!.costModifier = -1;
    state.players[me].hand[1]!.costModifier = -5;
    expect(effectiveCost(state, me, state.players[me].hand[0]!)).toBe(3);
    expect(effectiveCost(state, me, state.players[me].hand[1]!)).toBe(0);
    expect(play(state, ids[0]!).state.players[me].mana.available).toBe(0);
  });

  it("gli sconti in attesa si applicano solo alle carte che corrispondono e si consumano", () => {
    const { state, ids } = withHand(base, me, ["il-cursore", "klaudioken", "klaudioken"], 10);
    state.players[me].costModifiers = [
      { filter: { type: "spell" }, amount: -2, expiresEndOfTurn: true },
      { filter: { cardId: "il-grappolaccio" }, amount: -3, expiresEndOfTurn: false },
    ];
    const [minion, spell] = state.players[me].hand;
    expect(effectiveCost(state, me, minion!)).toBe(2); // nessuno sconto
    expect(effectiveCost(state, me, spell!)).toBe(2); // 4 - 2

    const afterMinion = play(state, ids[0]!, 0).state;
    expect(afterMinion.players[me].costModifiers).toHaveLength(2); // il servitore non consuma lo sconto sulle Pratiche

    const afterSpell = play(afterMinion, ids[1]!).state;
    expect(afterSpell.players[me].mana.available).toBe(10 - 2 - 2);
    expect(afterSpell.players[me].costModifiers).toEqual([{ filter: { cardId: "il-grappolaccio" }, amount: -3, expiresEndOfTurn: false }]);
    expect(effectiveCost(afterSpell, me, afterSpell.players[me].hand[0]!)).toBe(4); // il secondo Klaudioken paga pieno
  });

  it("più sconti che corrispondono si sommano", () => {
    const { state } = withHand(base, me, ["klaudioken"]);
    state.players[me].costModifiers = [
      { filter: { type: "spell" }, amount: -2, expiresEndOfTurn: true },
      { filter: { cardId: "klaudioken" }, amount: -1, expiresEndOfTurn: false },
    ];
    expect(effectiveCost(state, me, state.players[me].hand[0]!)).toBe(1);
  });
});
