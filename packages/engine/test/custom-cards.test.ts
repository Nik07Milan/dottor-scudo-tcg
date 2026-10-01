import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { CARDS_BY_ID } from "../src/data";
import type { GameState } from "../src/state";
import { addMinion, minionRef, other, startedGame, withHand } from "./helpers";
import { attack } from "./keywords/kw";

function table(hand: string[]) {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const { state, ids } = withHand(s0, me, hand);
  state.players[me].mana.available = 30;
  return { state, me, foe: other(me), ids };
}

describe("Uomo Sasso: +1/+1 per ogni Sasso giocato in questa partita", () => {
  it("conta i Sassi già giocati", () => {
    const { state, me, ids } = table(["uomo-sasso"]);
    addMinion(state, me);
    state.players[me].played = ["sasso", "klaudioken", "sasso", "sasso"];
    const r = applyAction(state, { type: "play_card", player: me, card: ids[0]!, position: 1 }).state;
    expect(r.players[me].board[1]).toMatchObject({ cardId: "uomo-sasso", attack: 4 + 3, health: 6 + 3, maxHealth: 6 + 3 });
  });

  it("senza Sassi giocati resta 4/6", () => {
    const { state, me, ids } = table(["uomo-sasso"]);
    const r = applyAction(state, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    expect(r.players[me].board[0]).toMatchObject({ attack: 4, health: 6 });
  });

  it("contano solo i Sassi del suo controllore", () => {
    const { state, me, foe, ids } = table(["uomo-sasso"]);
    state.players[foe].played = ["sasso", "sasso"];
    const r = applyAction(state, { type: "play_card", player: me, card: ids[0]!, position: 0 }).state;
    expect(r.players[me].board[0]!.attack).toBe(4);
  });
});

describe("Portinaio dell'aldilà: riporta in mano un tuo collega morto in questa partita", () => {
  function killPortinaio(graveyard: string[]): { s: GameState; me: string } {
    const { state, me, foe } = table([]);
    const killer = addMinion(state, me, { attack: 9, health: 9 });
    const portinaio = addMinion(state, foe, { cardId: "portinaio-dell-aldila", attack: 2, health: 4 });
    state.players[foe].graveyard = graveyard;
    state.players[foe].hand = []; // la mano iniziale potrebbe già contenere le stesse carte
    const s = attack(state, minionRef(killer), minionRef(portinaio)).state;
    return { s, me: foe };
  }

  it("torna in mano un collega dal cimitero del controllore", () => {
    const { s, me } = killPortinaio(["il-crudo"]);
    expect(s.players[me as "p1"].hand.at(-1)?.cardId).toBe("il-crudo");
  });

  it("non riporta sé stesso", () => {
    const { s, me } = killPortinaio([]);
    expect(s.players[me as "p1"].hand.some((c) => c.cardId === "portinaio-dell-aldila")).toBe(false);
  });

  it("solo servitori: le Pratiche nel cimitero non contano", () => {
    // Il cimitero contiene solo servitori morti; una voce non-servitore viene comunque ignorata.
    const { s, me } = killPortinaio(["klaudioken"]);
    expect(s.players[me as "p1"].hand.some((c) => c.cardId === "klaudioken")).toBe(false);
  });

  it("la scelta è casuale ma deterministica", () => {
    const a = killPortinaio(["il-crudo", "miletta", "il-cursore"]);
    const b = killPortinaio(["il-crudo", "miletta", "il-cursore"]);
    expect(a.s.players[a.me as "p1"].hand).toEqual(b.s.players[b.me as "p1"].hand);
  });
});

describe("La Lore dell'ufficio: evoca 3 colleghi casuali dell'Ufficio con costo 3 o meno", () => {
  it("evoca 3 servitori dell'Ufficio, non token, con costo ≤ 3", () => {
    const { state, me, ids } = table(["la-lore-dell-ufficio"]);
    const r = applyAction(state, { type: "play_card", player: me, card: ids[0]! }).state;
    const board = r.players[me].board;
    expect(board).toHaveLength(3);
    for (const m of board) {
      const def = CARDS_BY_ID.get(m.cardId)!;
      expect(def).toMatchObject({ type: "minion", faction: "ufficio" });
      expect(def.rarity).not.toBe("token");
      expect(def.cost).toBeLessThanOrEqual(3);
    }
  });

  it("gli evocati non attivano il Deploy", () => {
    const { state, me, ids } = table(["la-lore-dell-ufficio"]);
    const r = applyAction(state, { type: "play_card", player: me, card: ids[0]! });
    expect(r.events.some((e) => e.type === "card_drawn")).toBe(false); // Il Cursore evocato non pesca
  });
});
