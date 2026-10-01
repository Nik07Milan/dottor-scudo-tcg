import { describe, expect, it } from "vitest";
import { HEROES } from "../src/data";
import { legalCardsForHero, validateDeck, type DeckErrorCode } from "../src/deck";
import { createGame } from "../src/game";
import { testDeck } from "./helpers";

const codes = (heroId: string, deck: string[]) => {
  const r = validateDeck(heroId, deck);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

/** Sostituisce le ultime carte di un mazzo legale, mantenendo 30 carte. */
const withCards = (heroId: string, extra: string[]) => [...testDeck(heroId).slice(0, 30 - extra.length), ...extra];

describe("validateDeck", () => {
  it.each(HEROES.map((h) => h.id))("accetta il mazzo di test di %s", (heroId) => {
    expect(validateDeck(heroId, testDeck(heroId))).toEqual({ ok: true });
  });

  it("rifiuta mazzi che non hanno 30 carte", () => {
    const deck = testDeck("jackson");
    expect(codes("jackson", deck.slice(0, 29))).toEqual<DeckErrorCode[]>(["wrong_size"]);
    expect(codes("jackson", [...deck, deck[0]!])).toContain("wrong_size");
  });

  it("rifiuta più di 2 copie di una carta non leggendaria", () => {
    // testDeck contiene già 2 copie di scudo-dell-ultimo-momento: una terza è di troppo.
    const deck = withCards("dottor-scudo", ["scudo-dell-ultimo-momento"]);
    expect(deck.filter((c) => c === "scudo-dell-ultimo-momento")).toHaveLength(3);
    expect(codes("dottor-scudo", deck)).toEqual<DeckErrorCode[]>(["too_many_copies"]);
  });

  it("rifiuta più di 1 copia di una leggendaria", () => {
    const deck = withCards("dottor-scudo", ["scudozord"]);
    expect(deck.filter((c) => c === "scudozord")).toHaveLength(2);
    expect(codes("dottor-scudo", deck)).toEqual<DeckErrorCode[]>(["too_many_copies"]);
  });

  it("rifiuta i token", () => {
    expect(codes("nikson", withCards("nikson", ["sasso"]))).toEqual<DeckErrorCode[]>(["token_not_allowed"]);
  });

  it("rifiuta carte dell'altra fazione", () => {
    expect(codes("milet", withCards("milet", ["troiaio-comunicazioni"]))).toEqual<DeckErrorCode[]>(["wrong_faction"]);
  });

  it("rifiuta le carte firma di altri eroi della stessa fazione", () => {
    expect(codes("milet", withCards("milet", ["scoppio-d-ira"]))).toEqual<DeckErrorCode[]>(["foreign_signature"]);
  });

  it("accetta le Neutrali per entrambe le fazioni", () => {
    expect(legalCardsForHero("dottor-scudo").map((c) => c.id)).toContain("chiamata-api");
    expect(legalCardsForHero("dr-grappolo").map((c) => c.id)).toContain("chiamata-api");
  });

  it("rifiuta eroi e carte sconosciuti", () => {
    expect(codes("nessuno", testDeck("jackson"))).toEqual<DeckErrorCode[]>(["unknown_hero"]);
    expect(codes("jackson", withCards("jackson", ["carta-finta"]))).toEqual<DeckErrorCode[]>(["unknown_card"]);
  });

  it("segnala ogni carta una volta sola, con id e messaggio in italiano", () => {
    const r = validateDeck("nikson", withCards("nikson", ["sasso", "sasso", "sasso"]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const tokenErrors = r.errors.filter((e) => e.code === "token_not_allowed");
    expect(tokenErrors).toHaveLength(1);
    expect(tokenErrors[0]).toMatchObject({ cardId: "sasso" });
    expect(tokenErrors[0]!.message).toMatch(/Sasso/);
    // 3 Sassi sono anche troppe copie: entrambi gli errori, ognuno una volta.
    expect(r.errors.filter((e) => e.code === "too_many_copies")).toHaveLength(1);
  });

  it("riporta più errori diversi insieme", () => {
    const deck = withCards("jackson", ["sasso", "troiaio-comunicazioni", "scudo-bike"]).slice(1);
    expect(new Set(codes("jackson", deck))).toEqual(new Set(["wrong_size", "token_not_allowed", "wrong_faction", "foreign_signature"]));
  });

  it("non modifica l'input", () => {
    const deck = testDeck("ale");
    const copy = [...deck];
    validateDeck("ale", deck);
    expect(deck).toEqual(copy);
  });
});

describe("legalCardsForHero", () => {
  it("non contiene token, carte dell'altra fazione né firme altrui", () => {
    for (const h of HEROES) {
      for (const c of legalCardsForHero(h.id)) {
        expect(c.rarity, c.id).not.toBe("token");
        expect([h.faction, "neutrale"], c.id).toContain(c.faction);
        if (c.signatureOf) expect(c.signatureOf, c.id).toBe(h.id);
      }
    }
  });
});

describe("createGame con mazzi illegali", () => {
  it("rifiuta un mazzo illegale indicando giocatore ed errore", () => {
    const players = [
      { heroId: "jackson", deck: testDeck("jackson").slice(0, 29) },
      { heroId: "dr-grappolo", deck: testDeck("dr-grappolo") },
    ] as const;
    expect(() => createGame({ seed: 1, players })).toThrow(/p1.*30/);
  });
});
