import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { effectiveCost } from "../src/costs";
import { HEROES } from "../src/data";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { Action, GameState, PlayerId } from "../src/state";
import { addMinion, codeOf, endTurn, heroRef, minionRef, other, startedGame, withHand } from "./helpers";

/** Turno 1, il giocatore attivo usa l'eroe `heroId` con 10 caffettini. */
function as(heroId: string, hand: string[] = []) {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const { state, ids } = withHand(s0, me, hand);
  state.players[me].hero.heroId = heroId;
  return { state, me, foe: other(me), ids };
}

const power = (state: GameState, player: PlayerId, extra: Partial<Extract<Action, { type: "hero_power" }>> = {}) =>
  applyAction(state, { type: "hero_power", player, ...extra });
const powerActions = (state: GameState, player: PlayerId) => getLegalActions(state, player).filter((a) => a.type === "hero_power");

describe("regole comuni", () => {
  it("costa 2 caffettini e si usa una volta per turno", () => {
    const { state, me } = as("il-calabrone");
    const { state: s, events } = power(state, me);
    expect(s.players[me].mana.available).toBe(10 - rules.HERO_POWER_COST);
    expect(s.players[me].hero.heroPowerUsed).toBe(true);
    expect(events[0]).toEqual({ type: "hero_power_used", player: me });
    expect(powerActions(s, me)).toEqual([]);
    expect(codeOf(s, { type: "hero_power", player: me })).toBe("hero_power_used");
  });

  it("si ricarica al turno successivo del giocatore", () => {
    const { state, me } = as("il-calabrone");
    const used = power(state, me).state;
    const next = endTurn(endTurn(used).state).state;
    expect(powerActions(next, me)).toHaveLength(1);
  });

  it("senza caffettini sufficienti non si usa", () => {
    const { state, me } = as("il-calabrone");
    state.players[me].mana.available = 1;
    expect(powerActions(state, me)).toEqual([]);
    expect(codeOf(state, { type: "hero_power", player: me })).toBe("not_enough_mana");
  });

  it("solo nel proprio turno", () => {
    const { state, foe } = as("il-calabrone");
    expect(powerActions(state, foe)).toEqual([]);
    expect(codeOf(state, { type: "hero_power", player: foe })).toBe("not_your_turn");
  });

  it("un potere con bersaglio senza bersagli validi non si usa", () => {
    const { state, me } = as("ale");
    expect(powerActions(state, me)).toEqual([]);
    expect(codeOf(state, { type: "hero_power", player: me })).toBe("invalid_target");
  });

  it("ogni eroe ha un potere eseguibile nel DSL", () => {
    for (const h of HEROES) expect(h.heroPower.effects.length + (h.heroPower.options?.length ?? 0), h.id).toBeGreaterThan(0);
  });
});

describe("i 9 poteri", () => {
  it("Dottor Scudo — Alza lo scudo: opzione 0 Scudato a un collega, opzione 1 2 armatura", () => {
    const { state, me, foe } = as("dottor-scudo");
    const m = addMinion(state, me);
    addMinion(state, foe);
    expect(powerActions(state, me)).toEqual([
      { type: "hero_power", player: me, option: 0, target: minionRef(m) },
      { type: "hero_power", player: me, option: 1 },
    ]);
    expect(power(state, me, { option: 0, target: minionRef(m) }).state.players[me].board[0]!.keywords).toEqual(["scudato"]);
    expect(power(state, me, { option: 1 }).state.players[me].hero.armor).toBe(2);
    expect(codeOf(state, { type: "hero_power", player: me, option: 2 })).toBe("invalid_option");
    expect(codeOf(state, { type: "hero_power", player: me })).toBe("invalid_option");
  });

  it("Dottor Scudo senza colleghi: resta l'armatura", () => {
    const { state, me } = as("dottor-scudo");
    expect(powerActions(state, me)).toEqual([{ type: "hero_power", player: me, option: 1 }]);
  });

  it("Nikson — Raccogli sassi: un Sasso in mano", () => {
    const { state, me } = as("nikson");
    expect(power(state, me).state.players[me].hand.map((c) => c.cardId)).toEqual(["sasso"]);
  });

  it("Jackson — Scoppio d'ira: 1 danno ai servitori nemici e 2 al proprio eroe", () => {
    const { state, me, foe } = as("jackson");
    addMinion(state, foe, { health: 3 });
    addMinion(state, me, { health: 3 });
    const s = power(state, me).state;
    expect(s.players[foe].board[0]!.health).toBe(2);
    expect(s.players[me].board[0]!.health).toBe(3);
    expect(s.players[me].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
  });

  it("Jackson a 1 ferie si sconfigge da solo", () => {
    const { state, me, foe } = as("jackson");
    state.players[me].hero.health = 1;
    expect(power(state, me).state.result).toEqual({ winner: foe, reason: "hero_defeated" });
  });

  it("Milet — La via del Giappi: pesca una carta e la prossima Pratica di questo turno costa 1 in meno", () => {
    const { state, me } = as("milet", ["klaudioken"]);
    const s = power(state, me).state;
    expect(s.players[me].hand).toHaveLength(2);
    expect(effectiveCost(s, me, s.players[me].hand[0]!)).toBe(3);
    expect(endTurn(s).state.players[me].costModifiers).toEqual([]);
  });

  it("Ale — Fuga dalla riunione: un proprio collega torna in mano e costa 1 in meno", () => {
    const { state, me, foe } = as("ale");
    const m = addMinion(state, me, { cardId: "zanzagallo" });
    addMinion(state, foe);
    expect(powerActions(state, me)).toEqual([{ type: "hero_power", player: me, target: minionRef(m) }]);
    const s = power(state, me, { target: minionRef(m) }).state;
    expect(s.players[me].board).toEqual([]);
    expect(s.players[me].hand.at(-1)).toMatchObject({ cardId: "zanzagallo", costModifier: -1 });
  });

  it("Il Creatore — Nuova tavola: Scopri un collega dell'Ufficio", () => {
    const { state, me } = as("il-creatore");
    const s = power(state, me).state;
    expect(s.pendingChoice?.options).toHaveLength(3);
    const picked = s.pendingChoice!.options[0]!;
    const r = applyAction(s, { type: "choose", player: me, index: 0 }).state;
    expect(r.players[me].hand.at(-1)?.cardId).toBe(picked);
  });

  it("Dr Grappolo — Lavaggio del cervello: uno Studente plagiato", () => {
    const { state, me } = as("dr-grappolo");
    expect(power(state, me).state.players[me].board.map((m) => m.cardId)).toEqual(["studente-plagiato"]);
  });

  it("Il Calabrone — Pungiglione: 2 danni all'eroe nemico", () => {
    const { state, me, foe } = as("il-calabrone");
    expect(power(state, me).state.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
  });

  it("Lord Capognus — L'esperimento: +2 attacco a un proprio servitore", () => {
    const { state, me, foe } = as("lord-capognus");
    const m = addMinion(state, me, { attack: 1, health: 3 });
    addMinion(state, foe);
    expect(powerActions(state, me)).toEqual([{ type: "hero_power", player: me, target: minionRef(m) }]);
    expect(power(state, me, { target: minionRef(m) }).state.players[me].board[0]).toMatchObject({ attack: 3, health: 3 });
    expect(codeOf(state, { type: "hero_power", player: me, target: heroRef(me) })).toBe("invalid_target");
  });
});
