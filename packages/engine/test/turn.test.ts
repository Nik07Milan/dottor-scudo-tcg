import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { IllegalActionError } from "../src/errors";
import { createGame } from "../src/game";
import * as rules from "../src/rules";
import type { GameState, PlayerId } from "../src/state";
import { countIds, endTurn, other, setupFor, startedGame } from "./helpers";

const created = (seed = 1) => createGame(setupFor(seed)).state;
const mulligan = (s: GameState, player: PlayerId, replace: number[] = []) => applyAction(s, { type: "mulligan", player, replace });
const allIds = (s: GameState, p: PlayerId) => [...s.players[p].hand, ...s.players[p].deck].map((c) => c.cardId);

describe("mulligan", () => {
  it("tenere la mano non cambia le carte e segna il giocatore come pronto", () => {
    const s0 = created();
    const { state, events } = mulligan(s0, "p1");
    expect(state.players.p1.hand).toEqual(s0.players.p1.hand);
    expect(state.players.p1.mulliganDone).toBe(true);
    expect(state.phase).toBe("mulligan");
    expect(events).toEqual([{ type: "mulligan_done", player: "p1", replaced: 0 }]);
  });

  it("le carte rimesse sono sostituite dalle prime del mazzo e non si possono ripescare subito", () => {
    const s0 = created(3);
    const p = s0.firstPlayer;
    const hand0 = s0.players[p].hand;
    const replace = [hand0[0]!.instanceId, hand0[2]!.instanceId];
    const topOfDeck = s0.players[p].deck.slice(0, 2).map((c) => c.instanceId);

    const { state, events } = mulligan(s0, p, replace);
    const hand = state.players[p].hand;
    expect(hand).toHaveLength(hand0.length);
    expect(hand.map((c) => c.instanceId)).toEqual([hand0[1]!.instanceId, ...topOfDeck]);
    expect(state.players[p].deck).toHaveLength(s0.players[p].deck.length);
    expect(countIds(allIds(state, p))).toEqual(countIds(allIds(s0, p)));
    expect(events.filter((e) => e.type === "card_drawn").map((e) => e.type === "card_drawn" && e.instanceId)).toEqual(topOfDeck);
    expect(events).toContainEqual({ type: "mulligan_done", player: p, replaced: 2 });
  });

  it("le carte rimesse tornano nel mazzo con un id nuovo", () => {
    const s0 = created(3);
    const p = s0.firstPlayer;
    const replaced = s0.players[p].hand[0]!;
    const { state } = mulligan(s0, p, [replaced.instanceId]);
    const ids = [...state.players[p].hand, ...state.players[p].deck].map((c) => c.instanceId);
    expect(ids).not.toContain(replaced.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.nextInstanceId).toBeGreaterThan(Math.max(...ids));
  });

  it("è deterministico e non modifica lo stato in ingresso", () => {
    const s0 = created(5);
    const copy = structuredClone(s0);
    const replace = [s0.players.p1.hand[0]!.instanceId];
    expect(mulligan(s0, "p1", replace)).toEqual(mulligan(s0, "p1", replace));
    expect(s0).toEqual(copy);
  });

  it("rifiuta mulligan doppi, carte non in mano, duplicati e mulligan fuori fase", () => {
    const s0 = created();
    const once = mulligan(s0, "p1").state;
    expect(() => mulligan(once, "p1")).toThrow(IllegalActionError);
    expect(() => mulligan(s0, "p1", [s0.players.p2.hand[0]!.instanceId])).toThrow(IllegalActionError);
    const id = s0.players.p1.hand[0]!.instanceId;
    expect(() => mulligan(s0, "p1", [id, id])).toThrow(IllegalActionError);
    expect(() => mulligan(startedGame(), "p1")).toThrow(IllegalActionError);
  });

  it("finito il mulligan di entrambi: Caffettino al secondo, turno 1 del primo con 1 caffettino e una pesca", () => {
    let s = created(9);
    const first = s.firstPlayer;
    const second = other(first);
    s = mulligan(s, second).state;
    expect(s.phase).toBe("mulligan");
    const { state, events } = mulligan(s, first);

    expect(state.phase).toBe("main");
    expect(state.turn).toBe(1);
    expect(state.activePlayer).toBe(first);
    expect(state.players[first].mana).toEqual({ max: 1, available: 1 });
    expect(state.players[first].hand).toHaveLength(rules.STARTING_HAND_FIRST + 1);
    expect(state.players[second].mana).toEqual({ max: 0, available: 0 });
    const secondHand = state.players[second].hand;
    expect(secondHand).toHaveLength(rules.STARTING_HAND_SECOND + 1);
    expect(secondHand.at(-1)).toMatchObject({ cardId: rules.COIN_CARD_ID, costModifier: 0 });
    expect(events.map((e) => e.type)).toEqual(["mulligan_done", "card_added", "turn_started", "mana_changed", "card_drawn"]);
    expect(events[1]).toMatchObject({ type: "card_added", player: second, cardId: rules.COIN_CARD_ID });
  });
});

describe("turno", () => {
  it("end_turn passa la mano all'avversario, che guadagna un caffettino e pesca", () => {
    const s0 = startedGame();
    const first = s0.activePlayer;
    const second = other(first);
    const { state, events } = endTurn(s0);
    expect(state.turn).toBe(2);
    expect(state.activePlayer).toBe(second);
    expect(state.players[second].mana).toEqual({ max: 1, available: 1 });
    expect(state.players[second].hand).toHaveLength(s0.players[second].hand.length + 1);
    expect(events[0]).toEqual({ type: "turn_ended", player: first, turn: 1 });
    expect(events[1]).toEqual({ type: "turn_started", player: second, turn: 2 });
  });

  it("i caffettini massimi crescono di 1 a turno fino a 10 e si ricaricano", () => {
    let s = startedGame();
    const first = s.activePlayer;
    const seen: number[] = [s.players[first].mana.max];
    for (let i = 0; i < 24; i++) {
      s = endTurn(s).state;
      if (s.activePlayer === first) {
        seen.push(s.players[first].mana.max);
        expect(s.players[first].mana.available).toBe(s.players[first].mana.max);
        s.players[first].mana.available = 0; // spesi tutti: il prossimo turno li ricarica
      }
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]);
  });

  it("i caffettini temporanei oltre il massimo spariscono al turno successivo", () => {
    let s = startedGame();
    const first = s.activePlayer;
    s.players[first].mana.available = 3; // es. Caffettino: 1 + temporanei
    s = endTurn(endTurn(s).state).state;
    expect(s.players[first].mana).toEqual({ max: 2, available: 2 });
  });

  it("a inizio turno azzera attacchi, potere eroe e il blocco 'appena evocato' dei propri servitori", () => {
    let s = startedGame();
    const first = s.activePlayer;
    const second = other(first);
    s = endTurn(s).state;
    const p = s.players[first];
    p.hero.attacksThisTurn = 1;
    p.hero.heroPowerUsed = true;
    const minion = {
      instanceId: s.nextInstanceId++,
      cardId: "il-crudo",
      owner: first,
      attack: 5,
      health: 6,
      maxHealth: 6,
      keywords: [],
      frozenTurns: 0,
      frozenOnTurn: null,
      attacksThisTurn: 1,
      summonedThisTurn: true,
    } as const;
    p.board.push({ ...minion, keywords: ["burocrazia"] });
    s.players[second].board.push({ ...minion, instanceId: s.nextInstanceId++, owner: second, keywords: [] });

    s = endTurn(s).state;
    expect(s.players[first].hero).toMatchObject({ attacksThisTurn: 0, heroPowerUsed: false });
    expect(s.players[first].board[0]).toMatchObject({ attacksThisTurn: 0, summonedThisTurn: false });
    // I servitori dell'avversario non vengono toccati nel mio turno.
    expect(s.players[second].board[0]).toMatchObject({ attacksThisTurn: 1, summonedThisTurn: true });
  });

  it("a fine turno scadono solo gli sconti di questo turno del giocatore attivo", () => {
    const s = startedGame();
    const first = s.activePlayer;
    s.players[first].costModifiers = [
      { filter: { type: "spell" }, amount: -2, expiresEndOfTurn: true },
      { filter: { cardId: "il-grappolaccio" }, amount: -3, expiresEndOfTurn: false },
    ];
    s.players[other(first)].costModifiers = [{ filter: { type: "spell" }, amount: -2, expiresEndOfTurn: true }];
    const { state } = endTurn(s);
    expect(state.players[first].costModifiers).toEqual([{ filter: { cardId: "il-grappolaccio" }, amount: -3, expiresEndOfTurn: false }]);
    expect(state.players[other(first)].costModifiers).toHaveLength(1);
  });

  it("solo il giocatore attivo può finire il turno, e non durante il mulligan", () => {
    const s = startedGame();
    expect(() => applyAction(s, { type: "end_turn", player: other(s.activePlayer) })).toThrow(IllegalActionError);
    expect(() => applyAction(created(), { type: "end_turn", player: "p1" })).toThrow(IllegalActionError);
  });

  it("non modifica lo stato in ingresso", () => {
    const s = startedGame();
    const copy = structuredClone(s);
    endTurn(s);
    expect(s).toEqual(copy);
  });
});

describe("pesca", () => {
  it("con il mazzo vuoto il burnout fa 1, 2, 3 danni, prima all'armatura", () => {
    let s = startedGame();
    const second = other(s.activePlayer);
    s.players[second].deck = [];
    s.players[second].hero.armor = 2;
    const damages: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = endTurn(s); // inizia il turno di `second`: pesca a vuoto
      for (const e of r.events) if (e.type === "fatigue") damages.push(e.damage);
      s = endTurn(r.state).state;
    }
    expect(damages).toEqual([1, 2, 3]);
    // 1 + 2 + 3 = 6 danni: 2 assorbiti dall'armatura, 4 alle ferie.
    expect(s.players[second].hero).toMatchObject({ armor: 0, health: rules.HERO_MAX_HEALTH - 4 });
    expect(s.players[second].fatigue).toBe(3);
  });

  it("con la mano piena la carta pescata viene scartata, visibile a entrambi", () => {
    const s = startedGame();
    const second = other(s.activePlayer);
    const p = s.players[second];
    while (p.hand.length < rules.MAX_HAND) p.hand.push(p.deck.shift()!);
    const top = p.deck[0]!;
    const { state, events } = endTurn(s);
    expect(state.players[second].hand).toHaveLength(rules.MAX_HAND);
    expect(state.players[second].hand.map((c) => c.instanceId)).not.toContain(top.instanceId);
    expect(state.players[second].deck).toHaveLength(p.deck.length - 1);
    expect(events).toContainEqual({ type: "card_burned", player: second, cardId: top.cardId });
    expect(events.some((e) => e.type === "card_drawn")).toBe(false);
  });
});
