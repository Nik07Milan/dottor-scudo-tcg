import { describe, expect, it } from "vitest";
import { CARDS_BY_ID, DECKS, HEROES, deckCards } from "../src/data";
import { validateDeck } from "../src/deck";
import { createGame } from "../src/game";

describe("mazzi precostruiti", () => {
  it("ce n'è esattamente uno per eroe", () => {
    expect(DECKS.map((d) => d.heroId).sort()).toEqual(HEROES.map((h) => h.id).sort());
  });

  it.each(HEROES.map((h) => h.id))("il mazzo di %s passa validateDeck", (heroId) => {
    expect(validateDeck(heroId, deckCards(heroId))).toEqual({ ok: true });
  });

  it.each(HEROES.map((h) => h.id))("il mazzo di %s ha nome e almeno 14 servitori", (heroId) => {
    const deck = DECKS.find((d) => d.heroId === heroId)!;
    expect(deck.name.length).toBeGreaterThan(0);
    const minions = deckCards(heroId).filter((id) => CARDS_BY_ID.get(id)!.type === "minion");
    expect(minions.length).toBeGreaterThanOrEqual(14);
  });

  it("si può iniziare una partita con due mazzi precostruiti", () => {
    const { state } = createGame({
      seed: 1,
      players: [
        { heroId: "jackson", deck: deckCards("jackson") },
        { heroId: "il-calabrone", deck: deckCards("il-calabrone") },
      ],
    });
    expect(state.phase).toBe("mulligan");
  });

  it("deckCards di un eroe senza mazzo lancia un errore", () => {
    expect(() => deckCards("nessuno")).toThrow(/nessuno/);
  });
});
