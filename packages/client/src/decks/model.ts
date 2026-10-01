// Modello del deck builder (T5.3): puro, testato senza DOM. Le regole sono quelle dell'engine
// (legalCardsForHero, maxCopies, validateDeck): qui solo la bozza del mazzo e i filtri.

import {
  CARDS_BY_ID,
  DECKS,
  deckFromCounts,
  legalCardsForHero,
  maxCopies,
  rules,
  validateDeck,
  type CardDefinition,
  type CardType,
  type DeckValidation,
} from "@dottorscudo/engine";

export interface DeckDraft {
  /** Id del mazzo salvato; assente se non è ancora stato salvato. */
  id?: string;
  heroId: string;
  name: string;
  /** `{ cardId: copie }`, come data/decks.json e la colonna decks.cards. */
  cards: Record<string, number>;
}

export const TYPE_LABELS: Record<CardType, string> = { minion: "Collega", spell: "Pratica", weapon: "Strumento", location: "Luogo" };

export const emptyDraft = (heroId: string): DeckDraft => ({ heroId, name: "Nuovo mazzo", cards: {} });

/** Bozza a partire dal mazzo precostruito dell'eroe. */
export function prebuiltDraft(heroId: string): DeckDraft {
  const deck = DECKS.find((d) => d.heroId === heroId);
  return { heroId, name: deck ? `${deck.name} (copia)` : "Nuovo mazzo", cards: { ...(deck?.cards ?? {}) } };
}

const byCostThenName = (a: CardDefinition, b: CardDefinition) => a.cost - b.cost || a.name.localeCompare(b.name, "it");

/** Carte che l'eroe può usare, per costo e poi per nome. */
export const cardPool = (heroId: string): CardDefinition[] => [...legalCardsForHero(heroId)].sort(byCostThenName);

export const totalCards = (draft: DeckDraft): number => Object.values(draft.cards).reduce((a, b) => a + b, 0);

export const copiesOf = (draft: DeckDraft, cardId: string): number => draft.cards[cardId] ?? 0;

/** Si può aggiungere una copia? Carta ammessa per l'eroe, sotto il limite di copie e mazzo non pieno. */
export function canAdd(draft: DeckDraft, cardId: string): boolean {
  const card = CARDS_BY_ID.get(cardId);
  if (!card || !legalCardsForHero(draft.heroId).some((c) => c.id === cardId)) return false;
  return copiesOf(draft, cardId) < maxCopies(card) && totalCards(draft) < rules.DECK_SIZE;
}

export function addCard(draft: DeckDraft, cardId: string): DeckDraft {
  if (!canAdd(draft, cardId)) return draft;
  return { ...draft, cards: { ...draft.cards, [cardId]: copiesOf(draft, cardId) + 1 } };
}

export function removeCard(draft: DeckDraft, cardId: string): DeckDraft {
  const copies = copiesOf(draft, cardId);
  if (copies === 0) return draft;
  const cards = { ...draft.cards };
  if (copies === 1) delete cards[cardId];
  else cards[cardId] = copies - 1;
  return { ...draft, cards };
}

export const validateDraft = (draft: DeckDraft): DeckValidation => validateDeck(draft.heroId, deckFromCounts(draft.cards));

/** Righe della lista del mazzo, per costo e nome. Le carte sconosciute (dati cambiati) restano visibili. */
export function deckRows(draft: DeckDraft): { cardId: string; card: CardDefinition | undefined; copies: number }[] {
  return Object.entries(draft.cards)
    .map(([cardId, copies]) => ({ cardId, card: CARDS_BY_ID.get(cardId), copies }))
    .sort((a, b) => (a.card && b.card ? byCostThenName(a.card, b.card) : a.card ? -1 : 1));
}

export interface PoolFilter {
  text: string;
  /** Costo esatto; 7 vale "7 o più"; null = tutti. */
  cost: number | null;
  type: CardType | null;
}

export const COST_FILTERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export function filterPool(pool: readonly CardDefinition[], f: PoolFilter): CardDefinition[] {
  const text = f.text.trim().toLowerCase();
  return pool.filter(
    (c) =>
      (f.cost === null || (f.cost >= 7 ? c.cost >= 7 : c.cost === f.cost)) &&
      (f.type === null || c.type === f.type) &&
      (!text || c.name.toLowerCase().includes(text) || c.text.toLowerCase().includes(text)),
  );
}
