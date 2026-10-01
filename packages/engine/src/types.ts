// Tipi di base dell'engine. Bozza iniziale: da completare in Milestone 1.

export type FactionId = "ufficio" | "soci" | "neutrale";
export type CardType = "minion" | "spell" | "weapon" | "location";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "token";
export type Keyword =
  | "deploy"
  | "burocrazia"
  | "scudato"
  | "urgente"
  | "smart_working"
  | "mani_in_merda"
  | "ultimo_sorso"
  | "bloccato"
  | "task";

/** Selettore di bersagli usato dal DSL degli effetti. */
export type TargetSelector =
  | "chosen" // scelto dal giocatore al momento della giocata
  | "self"
  | "friendly_hero"
  | "enemy_hero"
  | "all_enemy_minions"
  | "all_friendly_minions"
  | "all_other_minions"
  | "all_minions"
  | "random_enemy_minion";

/** Quando scatta un effetto. */
export type Trigger =
  | "on_play" // Deploy / effetto di una Pratica
  | "on_death" // Ultimo sorso
  | "start_of_turn"
  | "end_of_turn"
  | "on_damaged"
  | "after_hero_attack";

/** DSL degli effetti. Estendere qui invece di scrivere codice per singola carta. */
export type EffectAction =
  | { kind: "damage"; amount: number; target: TargetSelector }
  | { kind: "heal"; amount: number; target: TargetSelector }
  | { kind: "armor"; amount: number }
  | { kind: "buff"; attack: number; health: number; target: TargetSelector }
  | { kind: "give_keyword"; keyword: Keyword; target: TargetSelector }
  | { kind: "summon"; cardId: string; count: number; forOpponent?: boolean }
  | { kind: "draw"; count: number; forOpponent?: boolean }
  | { kind: "add_to_hand"; cardId: string; count: number }
  | { kind: "destroy"; target: TargetSelector; maxAttack?: number }
  | { kind: "return_to_hand"; target: TargetSelector }
  | { kind: "freeze"; target: TargetSelector; turns: number }
  | { kind: "gain_mana"; amount: number; temporary: boolean }
  | { kind: "custom"; handler: string }; // rimanda a packages/engine/src/cards/custom/<handler>.ts

export interface Effect {
  trigger: Trigger;
  action: EffectAction;
}

export interface CardDefinition {
  id: string;
  name: string;
  faction: FactionId;
  signatureOf: string | null;
  rarity: Rarity;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  durability?: number;
  keywords: Keyword[];
  text: string;
  effects: Effect[];
  /** Solo per le carte con keyword `task` (GDD §3.3). */
  task?: TaskDefinition;
  lore: string;
  art: string | null;
}

/** Obiettivo di una Task: cosa si conta, quanto serve, ricompensa risolta subito al completamento. */
export interface TaskDefinition {
  /** spells_played: Pratiche giocate dalla mano. minions_summoned: servitori entrati nel tuo campo (giocati o evocati). */
  counter: "spells_played" | "minions_summoned";
  goal: number;
  reward: EffectAction[];
}

export interface HeroDefinition {
  id: string;
  name: string;
  faction: Exclude<FactionId, "neutrale">;
  heroPower: { name: string; cost: number; text: string; effects: Effect[] };
  portrait: string | null;
  portraitConfirmed: boolean;
  lore: string;
}

export interface KeywordDefinition {
  id: Keyword;
  name: string;
  hearthstone: string;
  text: string;
}
