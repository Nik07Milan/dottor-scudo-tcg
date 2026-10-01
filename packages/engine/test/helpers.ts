import { CARDS, HEROES_BY_ID } from "../src/data";
import { DECK_SIZE } from "../src/rules";

/**
 * Mazzo da 30 per i test: carte legali per l'eroe (fazione + firma + neutrali, niente token),
 * 2 copie per carta e 1 per le leggendarie, nell'ordine di cards.json. Deterministico.
 */
export function testDeck(heroId: string): string[] {
  const hero = HEROES_BY_ID.get(heroId);
  if (!hero) throw new Error(`eroe sconosciuto: ${heroId}`);
  const deck: string[] = [];
  for (const c of CARDS) {
    if (c.rarity === "token") continue;
    if (c.faction !== hero.faction && c.faction !== "neutrale") continue;
    if (c.signatureOf && c.signatureOf !== heroId) continue;
    const copies = c.rarity === "legendary" ? 1 : 2;
    for (let i = 0; i < copies && deck.length < DECK_SIZE; i++) deck.push(c.id);
  }
  return deck;
}

/** Conteggio per id carta, per confrontare multinsiemi indipendentemente dall'ordine. */
export function countIds(ids: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
