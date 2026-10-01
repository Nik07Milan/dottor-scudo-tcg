// Casi base dell'Ultimo sorso. Ordine, catene, posizione e limite di passi: test/deaths.test.ts.
import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import { addMinion, minionRef, withHand } from "../helpers";
import { attack, table } from "./kw";

describe("Ultimo sorso", () => {
  it("scatta quando il servitore muore in combattimento", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 5, health: 9 });
    const miletta = addMinion(state, foe, { cardId: "miletta", attack: 1, health: 1 });
    const s = attack(state, minionRef(a), minionRef(miletta)).state;
    expect(s.players[me].board.map((m) => m.cardId)).toEqual(["il-crudo", "spirito-zanzara"]);
  });

  it("scatta quando il servitore è distrutto", () => {
    const { state, me, foe } = table();
    const canalis = addMinion(state, foe, { cardId: "la-canalis", attack: 2, health: 2 });
    const { state: s, ids } = withHand(state, me, ["l-ultimo-sorso"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: minionRef(canalis) }).state;
    expect(r.players[me].hero.health).toBe(state.players[me].hero.health - 2);
  });

  it("non scatta se il servitore torna in mano", () => {
    const { state, me, foe } = table();
    const miletta = addMinion(state, foe, { cardId: "miletta" });
    const { state: s, ids } = withHand(state, me, ["mezza-giornata"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: minionRef(miletta) }).state;
    expect(r.players[me].board).toEqual([]);
  });
});
