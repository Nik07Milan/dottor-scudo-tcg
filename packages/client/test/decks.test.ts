import { CARDS, legalCardsForHero, maxCopies } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import {
  addCard,
  canAdd,
  cardPool,
  copiesOf,
  deckRows,
  emptyDraft,
  filterPool,
  prebuiltDraft,
  removeCard,
  totalCards,
  validateDraft,
} from "../src/decks/model";

describe("deck builder (T5.3)", () => {
  it("il precostruito copiato è un mazzo valido da 30", () => {
    const draft = prebuiltDraft("jackson");
    expect(totalCards(draft)).toBe(30);
    expect(validateDraft(draft).ok).toBe(true);
  });

  it("si aggiunge fino al limite di copie e non oltre 30 carte", () => {
    const pool = cardPool("milet");
    const common = pool.find((c) => maxCopies(c) === 2)!;
    let draft = emptyDraft("milet");
    draft = addCard(addCard(addCard(draft, common.id), common.id), common.id);
    expect(copiesOf(draft, common.id)).toBe(2);

    const legendary = pool.find((c) => c.rarity === "legendary");
    if (legendary) expect(copiesOf(addCard(addCard(draft, legendary.id), legendary.id), legendary.id)).toBe(1);

    const full = prebuiltDraft("milet");
    const missing = pool.find((c) => canAdd({ ...full, cards: {} }, c.id) && copiesOf(full, c.id) === 0)!;
    expect(canAdd(full, missing.id)).toBe(false);
  });

  it("le carte di un'altra fazione, firma altrui e token non entrano", () => {
    const legal = new Set(legalCardsForHero("jackson").map((c) => c.id));
    const draft = emptyDraft("jackson");
    for (const c of CARDS.filter((c) => !legal.has(c.id))) expect(canAdd(draft, c.id), c.id).toBe(false);
  });

  it("togliere l'ultima copia rimuove la riga; il mazzo incompleto non è valido", () => {
    const pool = cardPool("ale");
    let draft = addCard(emptyDraft("ale"), pool[0]!.id);
    expect(deckRows(draft)).toHaveLength(1);
    expect(validateDraft(draft).ok).toBe(false);
    draft = removeCard(draft, pool[0]!.id);
    expect(draft.cards).toEqual({});
    expect(removeCard(draft, pool[0]!.id)).toBe(draft);
  });

  it("filtri: testo su nome e testo della carta, costo (7 = 7+), tipo", () => {
    const pool = cardPool("dottor-scudo");
    expect(filterPool(pool, { text: "", cost: null, type: null })).toHaveLength(pool.length);
    expect(filterPool(pool, { text: "", cost: 2, type: null }).every((c) => c.cost === 2)).toBe(true);
    expect(filterPool(pool, { text: "", cost: 7, type: null }).every((c) => c.cost >= 7)).toBe(true);
    expect(filterPool(pool, { text: "", cost: null, type: "spell" }).every((c) => c.type === "spell")).toBe(true);
    const first = pool[0]!;
    expect(filterPool(pool, { text: first.name.toUpperCase(), cost: null, type: null })).toContain(first);
  });

  it("la lista del mazzo è ordinata per costo", () => {
    const rows = deckRows(prebuiltDraft("nikson"));
    const costs = rows.map((r) => r.card!.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});
