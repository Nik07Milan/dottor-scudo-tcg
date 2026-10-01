// Legalità dei mazzi (T1.3, GDD §1 e §4). Usato da createGame, dal server e dal futuro deck builder.

import { CARDS, CARDS_BY_ID, HEROES_BY_ID } from "./data";
import { DECK_SIZE, MAX_COPIES, MAX_LEGENDARY_COPIES } from "./rules";
import type { CardDefinition } from "./types";

export type DeckErrorCode =
  | "unknown_hero"
  | "unknown_card"
  | "wrong_size"
  | "too_many_copies"
  | "token_not_allowed"
  | "wrong_faction"
  | "foreign_signature";

export interface DeckError {
  code: DeckErrorCode;
  /** Carta interessata; assente per gli errori sull'intero mazzo. */
  cardId?: string;
  /** Testo per il giocatore, in italiano. */
  message: string;
}

export type DeckValidation = { ok: true } | { ok: false; errors: DeckError[] };

/** Copie massime di una carta in un mazzo. */
export const maxCopies = (card: CardDefinition): number =>
  card.rarity === "legendary" ? MAX_LEGENDARY_COPIES : MAX_COPIES;

/** Carte che l'eroe può mettere nel mazzo: propria fazione + Neutrali + proprie carte firma, niente token. */
export function legalCardsForHero(heroId: string): CardDefinition[] {
  const hero = HEROES_BY_ID.get(heroId);
  if (!hero) return [];
  return CARDS.filter((c) => cardErrorCode(c, heroId, hero.faction) === null);
}

function cardErrorCode(card: CardDefinition, heroId: string, faction: string): DeckErrorCode | null {
  if (card.rarity === "token") return "token_not_allowed";
  if (card.faction !== faction && card.faction !== "neutrale") return "wrong_faction";
  if (card.signatureOf && card.signatureOf !== heroId) return "foreign_signature";
  return null;
}

export function validateDeck(heroId: string, cardIds: readonly string[]): DeckValidation {
  const hero = HEROES_BY_ID.get(heroId);
  if (!hero) return { ok: false, errors: [{ code: "unknown_hero", message: `Eroe sconosciuto: ${heroId}` }] };

  const errors: DeckError[] = [];
  if (cardIds.length !== DECK_SIZE) {
    errors.push({ code: "wrong_size", message: `Il mazzo deve avere ${DECK_SIZE} carte, ne ha ${cardIds.length}` });
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  // Un errore per carta (non per copia), nell'ordine di prima comparsa nel mazzo.
  for (const [cardId, count] of counts) {
    const card = CARDS_BY_ID.get(cardId);
    if (!card) {
      errors.push({ code: "unknown_card", cardId, message: `Carta sconosciuta: ${cardId}` });
      continue;
    }
    const code = cardErrorCode(card, heroId, hero.faction);
    if (code === "token_not_allowed") {
      errors.push({ code, cardId, message: `${card.name} è un token: non si mette nel mazzo` });
    } else if (code === "wrong_faction") {
      errors.push({ code, cardId, message: `${card.name} non è della fazione di ${hero.name}` });
    } else if (code === "foreign_signature") {
      errors.push({ code, cardId, message: `${card.name} è una carta firma di un altro eroe` });
    }
    const max = maxCopies(card);
    if (count > max) {
      errors.push({ code: "too_many_copies", cardId, message: `${card.name}: massimo ${max} ${max === 1 ? "copia" : "copie"}, ne hai ${count}` });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
