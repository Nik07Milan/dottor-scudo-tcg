import cardsJson from "../../../data/cards.json";
import decksJson from "../../../data/decks.json";
import heroesJson from "../../../data/heroes.json";
import keywordsJson from "../../../data/keywords.json";
import type { CardDefinition, HeroDefinition, KeywordDefinition } from "./types";

/** Mazzo precostruito (T1.17): id carta → copie. */
export interface DeckDefinition {
  heroId: string;
  name: string;
  cards: Record<string, number>;
}

export const CARDS = cardsJson as CardDefinition[];
export const HEROES = heroesJson as HeroDefinition[];
export const KEYWORDS = keywordsJson as KeywordDefinition[];
// Il JSON ha chiavi diverse per mazzo: TypeScript non le riconosce come Record, quindi si passa da unknown.
export const DECKS = decksJson as unknown as DeckDefinition[];

export const CARDS_BY_ID: ReadonlyMap<string, CardDefinition> = new Map(CARDS.map((c) => [c.id, c]));
export const HEROES_BY_ID: ReadonlyMap<string, HeroDefinition> = new Map(HEROES.map((h) => [h.id, h]));

/** Da `{ cardId: copie }` (formato di decks.json e dei mazzi salvati) alla lista di id, nell'ordine delle chiavi. */
export function deckFromCounts(cards: Readonly<Record<string, number>>): string[] {
  return Object.entries(cards).flatMap(([id, copies]) => Array<string>(copies).fill(id));
}

/** Da lista di id a `{ cardId: copie }`, nell'ordine di prima comparsa. */
export function deckToCounts(cardIds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of cardIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Lista delle 30 carte del mazzo precostruito di un eroe, nell'ordine del file. */
export function deckCards(heroId: string): string[] {
  const deck = DECKS.find((d) => d.heroId === heroId);
  if (!deck) throw new Error(`nessun mazzo precostruito per l'eroe: ${heroId}`);
  return deckFromCounts(deck.cards);
}

/** Impronta FNV-1a a 32 bit del JSON di un valore: deterministica, senza dipendenze. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Impronta dei dati di gioco (carte, eroi, keyword). Salvata con ogni partita (T5.3): se il bilanciamento
 * cambia, il replay di una partita vecchia può divergere e il client lo segnala. I mazzi non contano:
 * il setup salvato contiene già le liste delle carte.
 */
export const DATA_VERSION = fingerprint([cardsJson, heroesJson, keywordsJson]);
