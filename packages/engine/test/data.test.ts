import { describe, expect, it } from "vitest";
import albiJson from "../../../data/dottorscudo-albi.json";
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

  it("le ricompense delle Task che evocano servitori esistono come token", () => {
    const nettuno = CARDS_BY_ID.get("nettuno");
    expect(nettuno).toBeDefined();
    expect(nettuno).toMatchObject({ rarity: "token", type: "minion", attack: 8, health: 8, keywords: ["burocrazia"] });
  });
});

// La lore degli albi non serve alle regole: la legge solo il test, così non finisce nel bundle dell'engine.
const ALBI: { numero: number }[] = albiJson.albi;

describe("mazzi possibili per eroe", () => {
  // Stesse regole di validateDeck (GDD §1, §4): niente token, fazione + firma propria + neutrali,
  // max 2 copie, 1 per le leggendarie. Va sostituito da validateDeck quando arriva T1.3.
  const legalPool = (heroId: string) => {
    const hero = HEROES_BY_ID.get(heroId)!;
    return CARDS.filter(
      (c) =>
        c.rarity !== "token" &&
        (c.faction === hero.faction || c.faction === "neutrale") &&
        (!c.signatureOf || c.signatureOf === heroId),
    );
  };
  const slots = (cards: typeof CARDS) => cards.reduce((n, c) => n + (c.rarity === "legendary" ? 1 : 2), 0);

  it.each(HEROES.map((h) => h.id))("%s può comporre un mazzo da 30 carte", (heroId) => {
    expect(slots(legalPool(heroId))).toBeGreaterThanOrEqual(30);
  });

  it.each(HEROES.map((h) => h.id))("%s ha almeno 15 slot per servitori", (heroId) => {
    expect(slots(legalPool(heroId).filter((c) => c.type === "minion"))).toBeGreaterThanOrEqual(15);
  });
});

describe("albi", () => {
  it("contiene 122 albi con numeri unici da 1 a 122", () => {
    const numbers = ALBI.map((a) => a.numero);
    expect(new Set(numbers).size).toBe(ALBI.length);
    expect(ALBI.length).toBe(122);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(122);
  });

  it("ogni riferimento ad albi nella lore di carte ed eroi esiste", () => {
    const known = new Set(ALBI.map((a) => a.numero));
    for (const { id, lore } of [...CARDS, ...HEROES]) {
      for (const n of albumRefs(lore)) expect(known.has(n), `${id}: albo #${n}`).toBe(true);
    }
  });
});

/** Estrae i numeri di albo da testi come "Albo #14", "Albi #19, #96" o "Albi #33-38". */
function albumRefs(lore: string): number[] {
  const refs: number[] = [];
  for (const [, from, to] of lore.matchAll(/#(\d+)(?:-(\d+))?/g)) {
    const start = Number(from);
    const end = to ? Number(to) : start;
    for (let n = start; n <= end; n++) refs.push(n);
  }
  return refs;
}

describe("rng", () => {
  it("è deterministico a parità di seed", () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(42).value).not.toBe(nextRandom(43).value);
  });
});
