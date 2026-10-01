// Creazione della partita (T1.2, GDD §1.1). Il Caffettino del secondo giocatore arriva a fine mulligan (T1.4).

import { CARDS_BY_ID, HEROES_BY_ID } from "./data";
import { randomInt, shuffle } from "./rng";
import { HERO_MAX_HEALTH, STARTING_HAND_FIRST, STARTING_HAND_SECOND } from "./rules";
import type { ApplyResult, CardInstance, GameEvent, PlayerId, PlayerState } from "./state";

export interface PlayerSetup {
  heroId: string;
  /** Id carta del mazzo scelto. La legalità del mazzo è compito di validateDeck (T1.3). */
  deck: string[];
}

export interface GameSetup {
  seed: number;
  /** Indice 0 = "p1", indice 1 = "p2". Chi gioca per primo lo decide l'RNG. */
  players: readonly [PlayerSetup, PlayerSetup];
}

const PLAYER_IDS = ["p1", "p2"] as const satisfies readonly PlayerId[];

export function createGame(setup: GameSetup): ApplyResult {
  for (const p of setup.players) {
    if (!HEROES_BY_ID.has(p.heroId)) throw new Error(`eroe sconosciuto: ${p.heroId}`);
    for (const id of p.deck) if (!CARDS_BY_ID.has(id)) throw new Error(`carta sconosciuta: ${id}`);
  }

  // Ordine fisso di consumo dell'RNG: primo giocatore, mazzo p1, mazzo p2.
  let seed = setup.seed >>> 0;
  const first = randomInt(seed, 2);
  seed = first.seed;
  const firstPlayer = PLAYER_IDS[first.value]!;

  let nextInstanceId = 1;
  const players = {} as Record<PlayerId, PlayerState>;
  PLAYER_IDS.forEach((id, i) => {
    const { heroId, deck } = setup.players[i]!;
    const shuffled = shuffle(seed, deck);
    seed = shuffled.seed;
    // Id assegnati dopo la mescolata: dipendono dalla posizione, non rivelano quale carta è.
    const cards: CardInstance[] = shuffled.value.map((cardId) => ({ instanceId: nextInstanceId++, cardId, costModifier: 0 }));
    players[id] = {
      id,
      hero: { heroId, health: HERO_MAX_HEALTH, maxHealth: HERO_MAX_HEALTH, armor: 0, attacksThisTurn: 0, heroPowerUsed: false },
      weapon: null,
      mana: { max: 0, available: 0 },
      deck: cards,
      hand: [],
      board: [],
      graveyard: [],
      played: [],
      task: null,
      costModifiers: [],
      fatigue: 0,
      mulliganDone: false,
    };
  });

  const events: GameEvent[] = [{ type: "game_started", firstPlayer }];
  const secondPlayer: PlayerId = firstPlayer === "p1" ? "p2" : "p1";
  for (const [player, count] of [
    [firstPlayer, STARTING_HAND_FIRST],
    [secondPlayer, STARTING_HAND_SECOND],
  ] as const) {
    const ps = players[player];
    const drawn = ps.deck.splice(0, count);
    ps.hand.push(...drawn);
    for (const c of drawn) events.push({ type: "card_drawn", player, instanceId: c.instanceId, cardId: c.cardId });
  }

  return {
    state: {
      rng: seed,
      phase: "mulligan",
      turn: 0,
      activePlayer: firstPlayer,
      firstPlayer,
      players,
      pendingChoice: null,
      result: null,
      nextInstanceId,
    },
    events,
  };
}
