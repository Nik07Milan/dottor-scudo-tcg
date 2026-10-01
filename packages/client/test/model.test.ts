import { HIDDEN_CARD } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { viewToModel } from "../src/model";
import { addMinion, startedState, viewFor, withHand } from "./helpers";

describe("viewToModel", () => {
  it("separa il proprio lato da quello avversario e nasconde la mano altrui", () => {
    const s = startedState();
    const me = s.activePlayer;
    const foe = me === "p1" ? "p2" : "p1";
    const m = viewToModel(viewFor(s, me), me);
    expect(m.me.player).toBe(me);
    expect(m.foe.player).toBe(foe);
    expect(m.me.hand).toHaveLength(s.players[me].hand.length);
    expect(m.foe.hand).toEqual([]);
    expect(m.foe.handCount).toBe(s.players[foe].hand.length);
    expect(m.me.deckCount).toBe(s.players[me].deck.length);
    expect(m.myTurn).toBe(true);
    expect(JSON.stringify(m)).not.toContain(HIDDEN_CARD);
  });

  it("le carte in mano hanno nome, testo, costo effettivo e se sono giocabili", () => {
    const { state, ids } = withHand(startedState(), ["klaudioken", "il-crudo"], 4);
    const me = state.activePlayer;
    state.players[me].hand[1]!.costModifier = -1;
    const m = viewToModel(viewFor(state, me), me);
    expect(m.me.hand[0]).toMatchObject({ instanceId: ids[0], name: "Klaudioken", cost: 4, type: "spell", playable: true });
    expect(m.me.hand[0]!.text).toMatch(/danni/);
    expect(m.me.hand[1]).toMatchObject({ name: "Il Crudo", cost: 4, baseCost: 5, attack: 4, health: 6, playable: true });
    expect(m.me.hand[1]!.keywords).toEqual(["Burocrazia"]);
  });

  it("i servitori in campo dicono se possono attaccare e se sono bloccati", () => {
    const s = startedState();
    const me = s.activePlayer;
    const ready = addMinion(s, me);
    const frozen = addMinion(s, me, "il-crudo", { frozenTurns: 1, frozenOnTurn: 0 });
    const m = viewToModel(viewFor(s, me), me);
    expect(m.me.board.find((x) => x.instanceId === ready.instanceId)).toMatchObject({ canAttack: true, frozen: false, name: "Il Crudo" });
    expect(m.me.board.find((x) => x.instanceId === frozen.instanceId)).toMatchObject({ canAttack: false, frozen: true });
  });

  it("l'eroe porta potere, Strumento e se può usarli", () => {
    const s = startedState();
    const me = s.activePlayer;
    s.players[me].mana = { max: 5, available: 5 };
    s.players[me].weapon = { instanceId: s.nextInstanceId++, cardId: "tatine-mobile", attack: 3, durability: 3 };
    const m = viewToModel(viewFor(s, me), me);
    expect(m.me.hero).toMatchObject({ name: s.players[me].hero.heroId === "jackson" ? "Jackson" : "Il Calabrone", health: 30, armor: 0, canAttack: true });
    expect(m.me.hero.weapon).toEqual({ name: "Tatine Mobile", attack: 3, durability: 3 });
    expect(m.me.hero.power).toMatchObject({ cost: 2, usable: true });
  });

  it("riporta la scelta di Scopri solo a chi sceglie, con i nomi delle carte", () => {
    const s = startedState();
    const me = s.activePlayer;
    s.pendingChoice = { kind: "discover", player: me, options: ["klaudioken", "retcon", "le-task"] };
    expect(viewToModel(viewFor(s, me), me).choice?.map((c) => c.name)).toEqual(["Klaudioken", "Retcon", "Le Task"]);
    const foe = me === "p1" ? "p2" : "p1";
    expect(viewToModel(viewFor(s, foe), foe).choice).toBeNull();
  });

  it("a partita finita dice se hai vinto", () => {
    const s = startedState();
    s.phase = "ended";
    s.result = { winner: "p1", reason: "concede" };
    expect(viewToModel(viewFor(s, "p1"), "p1").result).toEqual({ outcome: "win", reason: "concede" });
    expect(viewToModel(viewFor(s, "p2"), "p2").result).toEqual({ outcome: "loss", reason: "concede" });
  });
});
