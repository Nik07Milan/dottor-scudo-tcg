import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import { addMinion, codeOf, endTurn, heroRef, minionRef, withHand } from "../helpers";
import { attackTargets, table } from "./kw";

describe("Urgente", () => {
  it("nel turno in cui entra può attaccare solo servitori", () => {
    const { state, me, foe } = table();
    const rush = addMinion(state, me, { keywords: ["urgente"], summonedThisTurn: true });
    const d = addMinion(state, foe);
    expect(attackTargets(state, minionRef(rush))).toEqual([minionRef(d)]);
    expect(codeOf(state, { type: "attack", player: me, attacker: minionRef(rush), defender: heroRef(foe) })).toBe("invalid_target");
  });

  it("senza servitori nemici, appena entrato non attacca nessuno", () => {
    const { state, me } = table();
    const rush = addMinion(state, me, { keywords: ["urgente"], summonedThisTurn: true });
    expect(attackTargets(state, minionRef(rush))).toEqual([]);
  });

  it("dal turno dopo è un servitore normale", () => {
    const { state, me, foe } = table();
    const rush = addMinion(state, me, { keywords: ["urgente"], summonedThisTurn: true });
    const later = endTurn(endTurn(state).state).state;
    expect(attackTargets(later, minionRef(rush))).toContainEqual(heroRef(foe));
  });

  it("senza Urgente un servitore appena entrato non attacca", () => {
    const { state, me, foe } = table();
    const plain = addMinion(state, me, { summonedThisTurn: true });
    addMinion(state, foe);
    expect(attackTargets(state, minionRef(plain))).toEqual([]);
  });

  it("Cliente insistente giocato dalla mano può attaccare subito un servitore", () => {
    const { state, me, foe } = table();
    const d = addMinion(state, foe);
    const { state: s, ids } = withHand(state, me, ["cliente-insistente"]);
    const played = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    const rush = played.players[me].board[0]!;
    expect(attackTargets(played, minionRef(rush))).toEqual([minionRef(d)]);
  });

  it("Emergenza ritardi dà Urgente a un collega appena giocato", () => {
    const { state, me, foe } = table();
    const fresh = addMinion(state, me, { summonedThisTurn: true });
    const d = addMinion(state, foe);
    const { state: s, ids } = withHand(state, me, ["emergenza-ritardi"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: minionRef(fresh) }).state;
    expect(attackTargets(r, minionRef(fresh))).toEqual([minionRef(d)]);
  });
});
