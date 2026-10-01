import { legalCardsForHero, maxCopies } from "../src/deck";
import { HEROES_BY_ID } from "../src/data";
import { DECK_SIZE } from "../src/rules";

/**
 * Mazzo da 30 per i test: carte legali per l'eroe, copie massime per carta, nell'ordine di cards.json.
 * Deterministico.
 */
export function testDeck(heroId: string): string[] {
  if (!HEROES_BY_ID.has(heroId)) throw new Error(`eroe sconosciuto: ${heroId}`);
  const deck: string[] = [];
  for (const c of legalCardsForHero(heroId)) {
    for (let i = 0; i < maxCopies(c) && deck.length < DECK_SIZE; i++) deck.push(c.id);
  }
  return deck;
}

/** Conteggio per id carta, per confrontare multinsiemi indipendentemente dall'ordine. */
export function countIds(ids: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
