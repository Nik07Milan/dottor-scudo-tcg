import { describe, expect, it } from "vitest";
import { CARDS, CARDS_BY_ID, HEROES, HEROES_BY_ID, KEYWORDS } from "../src/data";
import { nextRandom } from "../src/rng";

describe("dati di gioco", () => {
  it("gli id delle carte sono unici", () => {
    expect(CARDS_BY_ID.size).toBe(CARDS.length);
  });

  it("gli id degli eroi sono unici", () => {
    expect(HEROES_BY_ID.size).toBe(HEROES.length);
  });

  it("ogni carta firma punta a un eroe esistente", () => {
    for (const c of CARDS.filter((c) => c.signatureOf)) {
      expect(HEROES_BY_ID.has(c.signatureOf!), `${c.id} -> ${c.signatureOf}`).toBe(true);
    }
  });

  it("ogni keyword usata è definita", () => {
    const defined = new Set(KEYWORDS.map((k) => k.id));
    for (const c of CARDS) for (const k of c.keywords) expect(defined.has(k), `${c.id}: ${k}`).toBe(true);
  });

  it("i servitori hanno attacco e vita, gli strumenti attacco e durabilità", () => {
    for (const c of CARDS) {
      if (c.type === "minion") expect([c.attack, c.health].every((n) => typeof n === "number"), c.id).toBe(true);
      if (c.type === "weapon") expect([c.attack, c.durability].every((n) => typeof n === "number"), c.id).toBe(true);
    }
  });
});

describe("rng", () => {
  it("è deterministico a parità di seed", () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(42).value).not.toBe(nextRandom(43).value);
  });
});
