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
  | "all_other_friendly_minions" // "tutti gli altri tuoi colleghi": esclude la sorgente
  | "all_minions"
  | "random_enemy_minion";

/**
 * Filtro sui bersagli, relativo a chi controlla la sorgente. Per `chosen` restringe i bersagli legali;
 * per gli altri selettori scarta i personaggi che non corrispondono.
 */
export interface TargetFilter {
  side?: "enemy" | "friendly";
  maxAttack?: number;
}

/** Filtro sulle carte (Scopri). Le carte firma di altri eroi e i token sono sempre esclusi. */
export interface CardFilter {
  type?: CardType;
  faction?: FactionId;
}

/** Quando scatta un effetto. */
export type Trigger =
  | "on_play" // Deploy / effetto di una Pratica
  | "on_death" // Ultimo sorso
  | "start_of_turn"
  | "end_of_turn"
  | "on_damaged" // quando il servitore subisce danni > 0
  | "after_hero_attack" // Strumenti: dopo che il tuo eroe attacca
  | "static"; // sempre attivo finché la carta è in gioco (es. extra_attack di uno Strumento)

/** DSL degli effetti. Estendere qui invece di scrivere codice per singola carta. */
export type EffectAction =
  | { kind: "damage"; amount: number; target: TargetSelector; filter?: TargetFilter }
  | { kind: "heal"; amount: number; target: TargetSelector; filter?: TargetFilter }
  | { kind: "armor"; amount: number }
  | { kind: "buff"; attack: number; health: number; target: TargetSelector; filter?: TargetFilter }
  | { kind: "give_keyword"; keyword: Keyword; target: TargetSelector; filter?: TargetFilter }
  | { kind: "lose_keyword"; keyword: Keyword; target: TargetSelector; filter?: TargetFilter }
  | { kind: "summon"; cardId: string; count: number; forOpponent?: boolean }
  /** Evoca a destra del bersaglio una copia della sua carta con statistiche fisse (keyword base, niente buff). */
  | { kind: "summon_copy"; target: TargetSelector; attack: number; health: number; filter?: TargetFilter }
  /** `costModifier` si applica alle carte pescate (es. Re Klaudio: -1). */
  | { kind: "draw"; count: number; forOpponent?: boolean; costModifier?: number }
  | { kind: "add_to_hand"; cardId: string; count: number }
  | { kind: "discover"; filter: CardFilter }
  | { kind: "destroy"; target: TargetSelector; maxAttack?: number; filter?: TargetFilter }
  /** `costModifier` si applica alla carta che torna in mano (es. Fuga dalla riunione: -1). */
  | { kind: "return_to_hand"; target: TargetSelector; filter?: TargetFilter; costModifier?: number }
  | { kind: "take_control"; target: TargetSelector; filter?: TargetFilter }
  | { kind: "freeze"; target: TargetSelector; turns: number; filter?: TargetFilter }
  | { kind: "gain_mana"; amount: number; temporary: boolean }
  /** Sconto sulla prossima carta che corrisponde al filtro (GDD §1.2). */
  | { kind: "cost_modifier"; filter: { type?: CardType; cardId?: string }; amount: number; expiresEndOfTurn: boolean }
  /** Attacchi in più per turno dell'eroe (trigger `static` di uno Strumento). */
  | { kind: "extra_attack"; amount: number }
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
  heroPower: HeroPowerDefinition;
  portrait: string | null;
  portraitConfirmed: boolean;
  lore: string;
}

/** Potere eroe (GDD §4): costo, una volta per turno. Con `options` il giocatore sceglie quale effetto usare. */
export interface HeroPowerDefinition {
  name: string;
  cost: number;
  text: string;
  /** Effetti `on_play` del potere; vuoto se il potere ha `options`. */
  effects: Effect[];
  options?: { label: string; effects: Effect[] }[];
}

export interface KeywordDefinition {
  id: Keyword;
  name: string;
  hearthstone: string;
  text: string;
}
