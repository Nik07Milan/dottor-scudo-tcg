// Stato di gioco, azioni ed eventi (T1.1). Regole di riferimento: docs/GDD.md v0.4.
// Tutto è dato JSON puro (niente Map, Set, classi): lo stato si serializza, si confronta e si rigioca.

import type { CardType, Keyword } from "./types";

export type PlayerId = "p1" | "p2";

/**
 * Identificativo di una carta o di un servitore in partita, assegnato da `GameState.nextInstanceId`.
 * Ogni cambio di zona (mazzo → mano → campo → mano) crea un nuovo id: ordinare per id dà l'ordine
 * di entrata in gioco usato per risolvere i trigger simultanei (GDD §1.5.6).
 */
export type InstanceId = number;

// ---------------------------------------------------------------------------------------------
// Carte e personaggi
// ---------------------------------------------------------------------------------------------

/** Carta nel mazzo o in mano. */
export interface CardInstance {
  instanceId: InstanceId;
  cardId: string;
  /** Modificatore di costo legato a questa carta (es. Re Klaudio, Fuga dalla riunione). */
  costModifier: number;
}

/** Servitore sulla scrivania. */
export interface MinionInstance {
  instanceId: InstanceId;
  cardId: string;
  /** Proprietario: in mano a chi torna se rimandato. Il controllore è il lato del campo su cui sta. */
  owner: PlayerId;
  attack: number;
  health: number;
  maxHealth: number;
  /** Keyword attuali: base della carta + ottenute − perse (Scudato e Smart working si perdono). */
  keywords: Keyword[];
  /** Turni di Bloccato in riunione rimanenti (GDD §3.1). 0 = libero. */
  frozenTurns: number;
  /** `GameState.turn` in cui è stato bloccato l'ultima volta: quel turno non scala il contatore. */
  frozenOnTurn: number | null;
  attacksThisTurn: number;
  /** Entrato in campo (o passato di controllo) in questo turno: attacca solo con Urgente. */
  summonedThisTurn: boolean;
}

/** Strumento equipaggiato. */
export interface WeaponInstance {
  instanceId: InstanceId;
  cardId: string;
  attack: number;
  durability: number;
}

export interface HeroState {
  heroId: string;
  health: number;
  maxHealth: number;
  armor: number;
  attacksThisTurn: number;
  heroPowerUsed: boolean;
}

/** Riferimento a un personaggio: bersaglio di effetti, attaccante o difensore. */
export type CharacterRef = { kind: "hero"; player: PlayerId } | { kind: "minion"; instanceId: InstanceId };

// ---------------------------------------------------------------------------------------------
// Giocatore
// ---------------------------------------------------------------------------------------------

export interface ManaState {
  /** Caffettini massimi, fino a MAX_MANA. */
  max: number;
  /** Caffettini spendibili ora, temporanei compresi. */
  available: number;
}

/**
 * Sconto in attesa sulla prossima carta che rispetta il filtro (GDD §1.2).
 * Es. La via del Giappi: { type: "spell" }, -2, fine turno. Margherita: { cardId: "il-grappolaccio" }, -3.
 */
export interface PendingCostModifier {
  filter: { type?: CardType; cardId?: string };
  amount: number;
  expiresEndOfTurn: boolean;
}

/** Task attiva nella zona Task (GDD §3.3). Progresso pubblico. */
export interface TaskState {
  cardId: string;
  progress: number;
  goal: number;
}

export interface PlayerState {
  id: PlayerId;
  hero: HeroState;
  weapon: WeaponInstance | null;
  mana: ManaState;
  /** Indice 0 = prossima carta da pescare. */
  deck: CardInstance[];
  hand: CardInstance[];
  /** Scrivanie da sinistra a destra, max MAX_BOARD. */
  board: MinionInstance[];
  /** Id carta dei servitori di questo giocatore morti in partita, in ordine (Portinaio dell'aldilà). */
  graveyard: string[];
  /** Id carta giocate dalla mano in partita, in ordine (es. Uomo Sasso conta i Sassi). */
  played: string[];
  task: TaskState | null;
  costModifiers: PendingCostModifier[];
  /** Danno del prossimo burnout − 1: parte da 0, cresce a ogni pesca a vuoto. */
  fatigue: number;
  mulliganDone: boolean;
}

// ---------------------------------------------------------------------------------------------
// Partita
// ---------------------------------------------------------------------------------------------

export type GamePhase = "mulligan" | "main" | "ended";

/** Scelta in sospeso: finché esiste l'unica azione legale è `choose` (GDD §3.2). */
export interface PendingChoice {
  kind: "discover";
  player: PlayerId;
  /** Id carta offerti; nascosti all'avversario nella vista. */
  options: string[];
}

export type GameEndReason = "hero_defeated" | "concede" | "turn_limit" | "resolution_limit";

export interface GameResult {
  /** `null` = pareggio. */
  winner: PlayerId | null;
  reason: GameEndReason;
}

export interface GameState {
  /** Stato dell'RNG (seed corrente di `nextRandom`). Mai inviato ai client. */
  rng: number;
  phase: GamePhase;
  /** Turno globale, da 1. Pareggio oltre TURN_LIMIT. */
  turn: number;
  activePlayer: PlayerId;
  firstPlayer: PlayerId;
  players: Record<PlayerId, PlayerState>;
  pendingChoice: PendingChoice | null;
  result: GameResult | null;
  nextInstanceId: InstanceId;
}

// ---------------------------------------------------------------------------------------------
// Azioni (input del giocatore) — validate da getLegalActions, applicate da applyAction
// ---------------------------------------------------------------------------------------------

export type Action =
  | { type: "mulligan"; player: PlayerId; replace: InstanceId[] }
  | {
      type: "play_card";
      player: PlayerId;
      card: InstanceId;
      /** Posizione sulla scrivania (servitori), 0 = sinistra. */
      position?: number;
      target?: CharacterRef;
      /** Indice dell'opzione per carte con scelta. */
      option?: number;
    }
  | { type: "attack"; player: PlayerId; attacker: CharacterRef; defender: CharacterRef }
  | { type: "hero_power"; player: PlayerId; target?: CharacterRef; option?: number }
  | { type: "choose"; player: PlayerId; index: number }
  | { type: "end_turn"; player: PlayerId }
  | { type: "concede"; player: PlayerId };

export type ActionType = Action["type"];

// ---------------------------------------------------------------------------------------------
// Eventi (output) — log, animazioni del client, replay
// ---------------------------------------------------------------------------------------------

export type GameEvent =
  | { type: "game_started"; firstPlayer: PlayerId }
  | { type: "mulligan_done"; player: PlayerId; replaced: number }
  | { type: "turn_started"; player: PlayerId; turn: number }
  | { type: "turn_ended"; player: PlayerId; turn: number }
  | { type: "card_drawn"; player: PlayerId; instanceId: InstanceId; cardId: string }
  /** Mano piena: carta scartata, visibile a entrambi (GDD §1.6). */
  | { type: "card_burned"; player: PlayerId; cardId: string }
  | { type: "fatigue"; player: PlayerId; damage: number }
  | { type: "mana_changed"; player: PlayerId; max: number; available: number }
  | { type: "card_played"; player: PlayerId; instanceId: InstanceId; cardId: string; target?: CharacterRef }
  | { type: "hero_power_used"; player: PlayerId; target?: CharacterRef }
  | { type: "minion_summoned"; player: PlayerId; instanceId: InstanceId; cardId: string; position: number }
  | { type: "weapon_equipped"; player: PlayerId; instanceId: InstanceId; cardId: string }
  | { type: "weapon_destroyed"; player: PlayerId; cardId: string }
  | { type: "attack"; attacker: CharacterRef; defender: CharacterRef }
  | { type: "damage"; target: CharacterRef; amount: number }
  | { type: "shield_broken"; target: CharacterRef }
  | { type: "heal"; target: CharacterRef; amount: number }
  | { type: "armor_gained"; player: PlayerId; amount: number }
  | { type: "stats_changed"; instanceId: InstanceId; attack: number; health: number }
  | { type: "keyword_gained"; instanceId: InstanceId; keyword: Keyword }
  | { type: "keyword_lost"; instanceId: InstanceId; keyword: Keyword }
  | { type: "frozen"; instanceId: InstanceId; turns: number }
  | { type: "minion_died"; player: PlayerId; instanceId: InstanceId; cardId: string }
  | { type: "returned_to_hand"; player: PlayerId; instanceId: InstanceId; cardId: string }
  | { type: "control_changed"; instanceId: InstanceId; from: PlayerId; to: PlayerId }
  | { type: "discover_offered"; player: PlayerId; options: string[] }
  | { type: "card_chosen"; player: PlayerId; cardId: string }
  | { type: "task_progress"; player: PlayerId; cardId: string; progress: number; goal: number }
  | { type: "task_completed"; player: PlayerId; cardId: string }
  | { type: "game_over"; result: GameResult };

export type GameEventType = GameEvent["type"];

/** Risultato di `applyAction`: nuovo stato + eventi nell'ordine in cui sono avvenuti. */
export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
