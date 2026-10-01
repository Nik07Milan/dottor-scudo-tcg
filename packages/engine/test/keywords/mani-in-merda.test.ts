import { afterEach, describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import * as rules from "../../src/rules";
import { addMinion, clearTestCards, heroRef, minionRef, testCard, withHand } from "../helpers";
import { attack, attackTargets, table } from "./kw";

afterEach(clearTestCards);

describe("Mani in merda", () => {
  it("chi attacca con Mani in merda distrugge il difensore, qualunque vita abbia", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 1, health: 5, keywords: ["mani_in_merda"] });
    const d = addMinion(state, foe, { attack: 1, health: 99 });
    const s = attack(state, minionRef(a), minionRef(d)).state;
    expect(s.players[foe].board).toEqual([]);
    expect(s.players[me].board).toHaveLength(1);
  });

  it("vale anche in difesa", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 1, health: 99 });
    const d = addMinion(state, foe, { attack: 1, health: 5, keywords: ["mani_in_merda"] });
    const s = attack(state, minionRef(a), minionRef(d)).state;
    expect(s.players[me].board).toEqual([]);
  });

  it("serve un danno vero: un difensore a 0 attacco non distrugge", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 1, health: 5 });
    const d = addMinion(state, foe, { attack: 0, health: 5, keywords: ["mani_in_merda"] });
    const s = attack(state, minionRef(a), minionRef(d)).state;
    expect(s.players[me].board).toHaveLength(1);
  });

  it("sugli eroi non ha effetti extra", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 2, keywords: ["mani_in_merda"] });
    const s = attack(state, minionRef(a), heroRef(foe)).state;
    expect(s.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
  });

  it("vale anche per i danni degli effetti del servitore", () => {
    testCard({
      id: "test-velenoso",
      attack: 1,
      health: 9,
      keywords: ["deploy", "mani_in_merda"],
      effects: [{ trigger: "on_play", action: { kind: "damage", amount: 1, target: "all_enemy_minions" } }],
    });
    const { state, me, foe } = table();
    addMinion(state, foe, { health: 50 });
    const { state: s, ids } = withHand(state, me, ["test-velenoso"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    expect(r.players[foe].board).toEqual([]);
  });

  it("La Zanzara: Urgente e Mani in merda, uccide subito un servitore", () => {
    const { state, me, foe } = table();
    addMinion(state, foe, { attack: 1, health: 20 });
    const { state: s, ids } = withHand(state, me, ["la-zanzara"]);
    const played = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    const zanzara = played.players[me].board[0]!;
    const [target] = attackTargets(played, minionRef(zanzara));
    const r = attack(played, minionRef(zanzara), target!).state;
    expect(r.players[foe].board).toEqual([]);
  });
});
