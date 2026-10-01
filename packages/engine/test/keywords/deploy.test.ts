import { afterEach, describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import type { Ctx } from "../../src/context";
import { runEffects } from "../../src/effects";
import { addMinion, clearTestCards, minionRef, testCard, withHand } from "../helpers";
import { playTargets, table } from "./kw";

afterEach(clearTestCards);

describe("Deploy", () => {
  it("scatta quando la carta è giocata dalla mano, dopo l'entrata in campo", () => {
    const { state, me } = table();
    const { state: s, ids } = withHand(state, me, ["il-cursore"]);
    const { state: r, events } = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 });
    expect(r.players[me].hand).toHaveLength(1);
    const types = events.map((e) => e.type);
    expect(types.indexOf("minion_summoned")).toBeLessThan(types.indexOf("card_drawn"));
  });

  it("non scatta se il servitore è evocato da un effetto", () => {
    const { state, me } = table();
    const ctx: Ctx = { state: structuredClone(state), events: [] };
    runEffects(ctx, [{ trigger: "on_play", action: { kind: "summon", cardId: "il-cursore", count: 1 } }], { player: me, cardId: "test" });
    expect(ctx.state.players[me].board.map((m) => m.cardId)).toEqual(["il-cursore"]);
    expect(ctx.events.some((e) => e.type === "card_drawn")).toBe(false);
  });

  it("con bersaglio: obbligatorio se ci sono bersagli, assente se non ce ne sono", () => {
    testCard({
      id: "test-coach",
      keywords: ["deploy"],
      effects: [{ trigger: "on_play", action: { kind: "buff", attack: 1, health: 1, target: "chosen" } }],
    });
    const { state, me } = table();
    const { state: empty, ids } = withHand(state, me, ["test-coach"]);
    expect(playTargets(empty, ids[0]!)).toEqual([undefined]);

    const friend = addMinion(empty, me);
    expect(playTargets(empty, ids[0]!)).toEqual([minionRef(friend), minionRef(friend)]); // posizioni 0 e 1
    const r = applyAction(empty, { type: "play_card", player: me, card: ids[0]!, position: 1, target: minionRef(friend) }).state;
    expect(r.players[me].board[0]).toMatchObject({ attack: friend.attack + 1, health: friend.health + 1 });
  });
});
