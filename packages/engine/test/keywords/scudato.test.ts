import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import { addMinion, minionRef, withHand } from "../helpers";
import { attack, table } from "./kw";

describe("Scudato", () => {
  it("annulla la prima istanza di danno e si perde", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 3 });
    const d = addMinion(state, foe, { attack: 1, health: 2, keywords: ["scudato"] });
    const { state: s, events } = attack(state, minionRef(a), minionRef(d));
    const shielded = s.players[foe].board.find((m) => m.instanceId === d.instanceId)!;
    expect(shielded).toMatchObject({ health: 2, keywords: [] });
    expect(events).toContainEqual({ type: "shield_broken", target: minionRef(d) });
    expect(events).not.toContainEqual({ type: "damage", target: minionRef(d), amount: 3 });
  });

  it("il secondo danno passa", () => {
    const { state, me, foe } = table();
    const d = addMinion(state, foe, { health: 3, keywords: ["scudato"] });
    const { state: s, ids } = withHand(state, me, ["scoppio-d-ira", "scoppio-d-ira"]);
    const once = applyAction(s, { type: "play_card", player: me, card: ids[0]! }).state;
    const twice = applyAction(once, { type: "play_card", player: me, card: ids[1]! }).state;
    expect(once.players[foe].board[0]!.health).toBe(3);
    expect(twice.players[foe].board[0]!.health).toBe(1);
    expect(d).toBeDefined();
  });

  it("un attaccante Scudato non subisce il contrattacco", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 1, health: 1, keywords: ["scudato"] });
    const d = addMinion(state, foe, { attack: 5, health: 5 });
    const s = attack(state, minionRef(a), minionRef(d)).state;
    expect(s.players[me].board[0]).toMatchObject({ health: 1, keywords: [] });
  });

  it("non protegge da Distruggi", () => {
    const { state, me, foe } = table();
    const d = addMinion(state, foe, { attack: 1, keywords: ["scudato"] });
    const { state: s, ids } = withHand(state, me, ["l-ultimo-sorso"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: minionRef(d) });
    expect(r.state.players[foe].board).toEqual([]);
  });

  it("annulla anche il danno di Mani in merda: niente distruzione", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 1, keywords: ["mani_in_merda"] });
    addMinion(state, foe, { health: 5, keywords: ["scudato"] });
    const d = state.players[foe].board[0]!;
    const s = attack(state, minionRef(a), minionRef(d)).state;
    expect(s.players[foe].board[0]).toMatchObject({ health: 5, keywords: [] });
  });

  it("Scudo dell'ultimo momento dà Scudato a un collega", () => {
    const { state, me } = table();
    const a = addMinion(state, me);
    const { state: s, ids } = withHand(state, me, ["scudo-dell-ultimo-momento"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: minionRef(a) });
    expect(r.state.players[me].board[0]!.keywords).toEqual(["scudato"]);
  });
});
