import { applyAction } from "../src/apply";
import { legalCardsForHero, maxCopies } from "../src/deck";
import { CARDS_BY_ID, HEROES_BY_ID } from "../src/data";
import { IllegalActionError } from "../src/errors";
import { createGame, type GameSetup } from "../src/game";
import { DECK_SIZE } from "../src/rules";
import type { Action, CharacterRef, GameState, MinionInstance, PlayerId } from "../src/state";
import type { CardDefinition } from "../src/types";

export const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

export const setupFor = (seed: number, heroes: [string, string] = ["dottor-scudo", "dr-grappolo"]): GameSetup => ({
  seed,
  players: [
    { heroId: heroes[0], deck: testDeck(heroes[0]) },
    { heroId: heroes[1], deck: testDeck(heroes[1]) },
  ],
});

/** Partita appena creata in cui entrambi tengono la mano: siamo all'inizio del turno 1. */
export function startedGame(seed = 1): GameState {
  let { state } = createGame(setupFor(seed));
  state = applyAction(state, { type: "mulligan", player: "p1", replace: [] }).state;
  state = applyAction(state, { type: "mulligan", player: "p2", replace: [] }).state;
  return state;
}

/**
 * Copia dello stato con la mano di `player` sostituita da `cardIds` (id nuovi) e caffettini a `mana`.
 * Restituisce lo stato e gli instanceId delle carte in mano, nello stesso ordine.
 */
export function withHand(state: GameState, player: PlayerId, cardIds: string[], mana = 10): { state: GameState; ids: number[] } {
  const s = structuredClone(state);
  s.players[player].hand = cardIds.map((cardId) => ({ instanceId: s.nextInstanceId++, cardId, costModifier: 0 }));
  s.players[player].mana = { max: mana, available: mana };
  return { state: s, ids: s.players[player].hand.map((c) => c.instanceId) };
}

/** Riempie la scrivania di `player` con `count` copie di un servitore base. */
export function fillBoard(state: GameState, player: PlayerId, count: number, cardId = "il-crudo"): void {
  for (let i = 0; i < count; i++) {
    state.players[player].board.push({
      instanceId: state.nextInstanceId++,
      cardId,
      owner: player,
      attack: 5,
      health: 6,
      maxHealth: 6,
      keywords: [],
      frozenTurns: 0,
      frozenOnTurn: null,
      attacksThisTurn: 0,
      summonedThisTurn: false,
    });
  }
}

/** Aggiunge in fondo alla scrivania di `side` un servitore pronto ad attaccare, con i campi indicati. */
export function addMinion(state: GameState, side: PlayerId, fields: Partial<MinionInstance> = {}): MinionInstance {
  const minion: MinionInstance = {
    instanceId: state.nextInstanceId++,
    cardId: "il-crudo",
    owner: side,
    attack: 2,
    health: 3,
    maxHealth: fields.health ?? 3,
    keywords: [],
    frozenTurns: 0,
    frozenOnTurn: null,
    attacksThisTurn: 0,
    summonedThisTurn: false,
    ...fields,
  };
  state.players[side].board.push(minion);
  return minion;
}

export const minionRef = (m: { instanceId: number }): CharacterRef => ({ kind: "minion", instanceId: m.instanceId });
export const heroRef = (player: PlayerId): CharacterRef => ({ kind: "hero", player });

/** Codice dell'errore di un'azione, o "accepted". */
export function codeOf(state: GameState, action: unknown): string {
  try {
    applyAction(state, action as Action);
    return "accepted";
  } catch (e) {
    if (e instanceof IllegalActionError) return e.code;
    throw e;
  }
}

// Carte sintetiche: esistono solo durante un test. Registrare con testCard, togliere con clearTestCards (afterEach).
const registry = CARDS_BY_ID as Map<string, CardDefinition>;
const testCards: string[] = [];

export function testCard(def: Partial<CardDefinition> & Pick<CardDefinition, "id">): CardDefinition {
  const card: CardDefinition = {
    name: def.id,
    faction: "neutrale",
    signatureOf: null,
    rarity: "token",
    type: "minion",
    cost: 1,
    attack: 1,
    health: 1,
    keywords: [],
    text: "",
    effects: [],
    lore: "",
    art: null,
    ...def,
  };
  registry.set(card.id, card);
  testCards.push(card.id);
  return card;
}

export function clearTestCards(): void {
  for (const id of testCards.splice(0)) registry.delete(id);
}

/** Fine turno del giocatore attivo. */
export const endTurn = (state: GameState) => applyAction(state, { type: "end_turn", player: state.activePlayer });

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
