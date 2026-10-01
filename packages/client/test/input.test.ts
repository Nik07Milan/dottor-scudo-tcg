import { describe, expect, it } from "vitest";
import { click, highlightsFor, NONE } from "../src/input";
import { addMinion, legalFor, startedState, withHand } from "./helpers";

describe("gesti → azioni", () => {
  it("senza selezione evidenzia carte giocabili, attaccanti, potere e fine turno", () => {
    const { state, ids } = withHand(startedState(), ["scorta-di-teresa", "klaudioken"], 1);
    const me = state.activePlayer;
    const a = addMinion(state, me);
    const h = highlightsFor(legalFor(state, me), NONE);
    expect([...h.hand]).toEqual([ids[0]]);
    expect([...h.minions]).toEqual([a.instanceId]);
    expect(h.endTurn).toBe(true);
    expect(h.power).toBe(false); // 1 caffettino, il potere ne costa 2
  });

  it("una Pratica senza bersaglio si gioca con un clic", () => {
    const { state, ids } = withHand(startedState(), ["scorta-di-teresa"]);
    const me = state.activePlayer;
    const out = click(legalFor(state, me), NONE, { on: "hand", instanceId: ids[0]! });
    expect(out.send).toEqual({ type: "play_card", player: me, card: ids[0] });
    expect(out.selection).toEqual(NONE);
  });

  it("una Pratica con bersaglio: clic sulla carta, poi sul bersaglio", () => {
    const { state, ids } = withHand(startedState(), ["chiamata-api"]);
    const me = state.activePlayer;
    const foe = me === "p1" ? "p2" : "p1";
    const legal = legalFor(state, me);
    const first = click(legal, NONE, { on: "hand", instanceId: ids[0]! });
    expect(first.send).toBeUndefined();
    expect(first.highlights.heroes).toEqual(new Set([me, foe]));
    const second = click(legal, first.selection, { on: "hero", player: foe });
    expect(second.send).toEqual({ type: "play_card", player: me, card: ids[0], target: { kind: "hero", player: foe } });
  });

  it("un servitore: clic sulla carta, poi sul posto della scrivania", () => {
    const { state, ids } = withHand(startedState(), ["cliente-insistente"]);
    const me = state.activePlayer;
    addMinion(state, me);
    const legal = legalFor(state, me);
    const first = click(legal, NONE, { on: "hand", instanceId: ids[0]! });
    expect(first.highlights.slots).toEqual([0, 1]);
    const second = click(legal, first.selection, { on: "slot", position: 0 });
    expect(second.send).toEqual({ type: "play_card", player: me, card: ids[0], position: 0 });
  });

  it("un servitore con Deploy e bersaglio: posto, poi bersaglio", () => {
    const { state, ids } = withHand(startedState(), ["pinguino-glaciale"]);
    const me = state.activePlayer;
    const foe = me === "p1" ? "p2" : "p1";
    const enemy = addMinion(state, foe);
    const legal = legalFor(state, me);
    const picked = click(legal, NONE, { on: "hand", instanceId: ids[0]! });
    const placed = click(legal, picked.selection, { on: "slot", position: 0 });
    expect(placed.send).toBeUndefined();
    expect(placed.highlights.minions).toEqual(new Set([enemy.instanceId]));
    const done = click(legal, placed.selection, { on: "minion", instanceId: enemy.instanceId });
    expect(done.send).toEqual({ type: "play_card", player: me, card: ids[0], position: 0, target: { kind: "minion", instanceId: enemy.instanceId } });
  });

  it("attacco: clic sull'attaccante, poi sul difensore", () => {
    const s = startedState();
    const me = s.activePlayer;
    const foe = me === "p1" ? "p2" : "p1";
    const a = addMinion(s, me);
    const d = addMinion(s, foe);
    const legal = legalFor(s, me);
    const first = click(legal, NONE, { on: "minion", instanceId: a.instanceId });
    expect(first.highlights.minions).toEqual(new Set([d.instanceId]));
    expect(first.highlights.heroes).toEqual(new Set([foe]));
    const second = click(legal, first.selection, { on: "minion", instanceId: d.instanceId });
    expect(second.send).toEqual({ type: "attack", player: me, attacker: { kind: "minion", instanceId: a.instanceId }, defender: { kind: "minion", instanceId: d.instanceId } });
  });

  it("un clic non valido annulla la selezione", () => {
    const s = startedState();
    const me = s.activePlayer;
    const a = addMinion(s, me);
    const legal = legalFor(s, me);
    const first = click(legal, NONE, { on: "minion", instanceId: a.instanceId });
    const out = click(legal, first.selection, { on: "hero", player: me });
    expect(out.send).toBeUndefined();
    expect(out.selection).toEqual(NONE);
  });

  it("potere eroe senza bersaglio e fine turno partono con un clic", () => {
    const s = startedState();
    const me = s.activePlayer;
    s.players[me].mana = { max: 2, available: 2 };
    const legal = legalFor(s, me);
    // Jackson o Il Calabrone: entrambi i poteri non hanno bersaglio.
    expect(click(legal, NONE, { on: "power" }).send).toEqual({ type: "hero_power", player: me });
    expect(click(legal, NONE, { on: "end_turn" }).send).toEqual({ type: "end_turn", player: me });
  });

  it("Scopri: si sceglie una delle opzioni", () => {
    const s = startedState();
    const me = s.activePlayer;
    s.pendingChoice = { kind: "discover", player: me, options: ["klaudioken", "retcon", "le-task"] };
    expect(click(legalFor(s, me), NONE, { on: "choose", index: 2 }).send).toEqual({ type: "choose", player: me, index: 2 });
  });
});

describe("mulligan", () => {
  it("si selezionano le carte da cambiare e si conferma", async () => {
    const { createGame, deckCards, getLegalActions, getPlayerView } = await import("@dottorscudo/engine");
    const { state } = createGame({ seed: 4, players: [{ heroId: "jackson", deck: deckCards("jackson") }, { heroId: "milet", deck: deckCards("milet") }] });
    const legal = getLegalActions(getPlayerView(state, "p1"), "p1");
    const [c0, c1] = state.players.p1.hand.map((c) => c.instanceId);
    let out = click(legal, NONE, { on: "mulligan_toggle", instanceId: c1! });
    out = click(legal, out.selection, { on: "mulligan_toggle", instanceId: c0! });
    out = click(legal, out.selection, { on: "mulligan_toggle", instanceId: c1! }); // ripensamento
    expect(out.highlights.hand).toEqual(new Set([c0]));
    const done = click(legal, out.selection, { on: "mulligan_confirm" });
    expect(done.send).toEqual({ type: "mulligan", player: "p1", replace: [c0] });
  });
});
