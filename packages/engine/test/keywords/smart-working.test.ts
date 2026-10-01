import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import type { Ctx } from "../../src/context";
import { runEffects } from "../../src/effects";
import { addMinion, codeOf, heroRef, minionRef, withHand } from "../helpers";
import { attack, attackTargets, playTargets, table } from "./kw";

describe("Smart working", () => {
  it("non si può attaccare", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me);
    const hidden = addMinion(state, foe, { keywords: ["smart_working"] });
    expect(attackTargets(state, minionRef(a))).toEqual([heroRef(foe)]);
    expect(codeOf(state, { type: "attack", player: me, attacker: minionRef(a), defender: minionRef(hidden) })).toBe("invalid_target");
  });

  it("non è bersaglio delle carte avversarie, ma delle proprie sì", () => {
    const { state, me, foe } = table();
    const enemy = addMinion(state, foe, { keywords: ["smart_working"] });
    const mine = addMinion(state, me, { keywords: ["smart_working"] });
    const { state: s, ids } = withHand(state, me, ["chiamata-api"]);
    const targets = playTargets(s, ids[0]!);
    expect(targets).not.toContainEqual(minionRef(enemy));
    expect(targets).toContainEqual(minionRef(mine));
  });

  it("gli effetti ad area e casuali lo colpiscono", () => {
    const { state, me, foe } = table();
    const hidden = addMinion(state, foe, { health: 5, keywords: ["smart_working"] });
    const { state: s, ids } = withHand(state, me, ["scoppio-d-ira"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]! }).state;
    expect(r.players[foe].board[0]!.health).toBe(3);

    const ctx: Ctx = { state: structuredClone(state), events: [] };
    runEffects(ctx, [{ trigger: "on_play", action: { kind: "damage", amount: 1, target: "random_enemy_minion" } }], { player: me, cardId: "test" });
    expect(ctx.events).toContainEqual({ type: "damage", target: minionRef(hidden), amount: 1 });
  });

  it("si perde quando il servitore attacca", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { keywords: ["smart_working"] });
    const { state: s, events } = attack(state, minionRef(a), heroRef(foe));
    expect(s.players[me].board[0]!.keywords).toEqual([]);
    expect(events).toContainEqual({ type: "keyword_lost", instanceId: a.instanceId, keyword: "smart_working" });
  });

  it("Il Serramanico entra in Smart working", () => {
    const { state, me } = table();
    const { state: s, ids } = withHand(state, me, ["il-serramanico"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    expect(r.players[me].board[0]!.keywords).toContain("smart_working");
  });
});
