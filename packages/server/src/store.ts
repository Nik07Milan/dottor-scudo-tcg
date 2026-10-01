// Persistenza (T5.3): utenti, mazzi salvati e storico delle partite. Il server ne vede solo questa interfaccia;
// l'implementazione vera è su Supabase (supabase-store.ts), nei test c'è MemoryStore.
// Senza store configurato il server funziona come prima: ospiti, mazzi precostruiti, niente storico.

import { validateDeck, deckFromCounts, type Action, type GameResult, type GameSetup, type PlayerId } from "@dottorscudo/engine";
import { JoinError } from "./session";

export interface SavedDeck {
  heroId: string;
  /** `{ cardId: copie }`, come data/decks.json. */
  cards: Record<string, number>;
}

/** Una partita finita: con `setup` + `actions` si rigioca identica (engine `replay`). */
export interface MatchRecord {
  code: string;
  setup: GameSetup;
  actions: Action[];
  result: GameResult;
  /** Impronta dei dati di gioco al momento della partita (engine `DATA_VERSION`). */
  dataVersion: string;
  users: Record<PlayerId, string | null>;
  turns: number;
  startedAt: number;
  endedAt: number;
}

export interface Store {
  /** Id dell'utente se il token di accesso è valido, altrimenti null. */
  verifyUser(token: string): Promise<string | null>;
  /** Mazzo salvato, solo se appartiene a `userId`. */
  loadDeck(userId: string, deckId: string): Promise<SavedDeck | null>;
  saveMatch(record: MatchRecord): Promise<void>;
}

/**
 * Lista delle carte del mazzo scelto per un posto al tavolo. Lancia JoinError se il mazzo non c'è,
 * non è dell'utente, è di un altro eroe o non è legale: il server non si fida del client.
 */
export async function loadSeatDeck(store: Store | null, userId: string | null, heroId: string, deckId: string): Promise<string[]> {
  if (!store) throw new JoinError("i mazzi personalizzati non sono disponibili su questo server");
  if (!userId) throw new JoinError("accedi per usare i tuoi mazzi");
  const saved = await store.loadDeck(userId, deckId);
  if (!saved) throw new JoinError("mazzo non trovato");
  if (saved.heroId !== heroId) throw new JoinError("il mazzo è di un altro eroe");
  const deck = deckFromCounts(saved.cards);
  const validation = validateDeck(heroId, deck);
  if (!validation.ok) throw new JoinError(`mazzo non valido: ${validation.errors[0]!.message}`);
  return deck;
}

/** Store in memoria per i test. */
export class MemoryStore implements Store {
  readonly tokens = new Map<string, string>();
  readonly decks = new Map<string, SavedDeck & { owner: string }>();
  readonly matches: MatchRecord[] = [];

  async verifyUser(token: string): Promise<string | null> {
    return this.tokens.get(token) ?? null;
  }

  async loadDeck(userId: string, deckId: string): Promise<SavedDeck | null> {
    const deck = this.decks.get(deckId);
    return deck && deck.owner === userId ? { heroId: deck.heroId, cards: deck.cards } : null;
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    // Come in un database: si salva una copia serializzata, non il riferimento.
    this.matches.push(JSON.parse(JSON.stringify(record)) as MatchRecord);
  }
}
