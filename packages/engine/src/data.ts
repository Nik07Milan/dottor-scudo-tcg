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

/** Lista delle 30 carte del mazzo precostruito di un eroe, nell'ordine del file. */
export function deckCards(heroId: string): string[] {
  const deck = DECKS.find((d) => d.heroId === heroId);
  if (!deck) throw new Error(`nessun mazzo precostruito per l'eroe: ${heroId}`);
  return Object.entries(deck.cards).flatMap(([id, copies]) => Array<string>(copies).fill(id));
}
