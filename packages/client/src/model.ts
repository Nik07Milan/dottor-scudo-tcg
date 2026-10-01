// Adattatore puro (T4.2): PlayerView dell'engine → modello di scena da disegnare. Niente Phaser qui.
// Tutto ciò che il client "sa" della partita passa da questa funzione (CLAUDE.md, principio 7).

import {
  CARDS_BY_ID,
  HEROES_BY_ID,
  KEYWORDS,
  effectiveCost,
  getLegalActions,
  type Action,
  type CardType,
  type GameEndReason,
  type PlayerId,
  type PlayerView,
} from "@dottorscudo/engine";

const KEYWORD_NAMES = new Map(KEYWORDS.map((k) => [k.id, k.name]));

export interface CardModel {
  instanceId: number;
  cardId: string;
  name: string;
  type: CardType;
  /** Costo effettivo (sconti compresi). */
  cost: number;
  baseCost: number;
  text: string;
  attack?: number;
  health?: number;
  durability?: number;
  keywords: string[];
  rarity: string;
  faction: string;
  playable: boolean;
}

export interface MinionModel {
  instanceId: number;
  cardId: string;
  name: string;
  attack: number;
  health: number;
  maxHealth: number;
  /** Ferito (vita sotto il massimo) e potenziato (statistiche sopra la carta base). */
  damaged: boolean;
  buffed: boolean;
  keywords: string[];
  shielded: boolean;
  taunt: boolean;
  stealthy: boolean;
  frozen: boolean;
  canAttack: boolean;
}

export interface HeroModel {
  player: PlayerId;
  heroId: string;
  name: string;
  health: number;
  maxHealth: number;
  armor: number;
  weapon: { name: string; attack: number; durability: number } | null;
  canAttack: boolean;
  power: { name: string; text: string; cost: number; used: boolean; usable: boolean; options: string[] };
}

export interface SideModel {
  player: PlayerId;
  hero: HeroModel;
  mana: { available: number; max: number };
  deckCount: number;
  handCount: number;
  /** Solo per chi guarda; vuota per l'avversario. */
  hand: CardModel[];
  board: MinionModel[];
  task: { name: string; progress: number; goal: number } | null;
  mulliganDone: boolean;
}

export interface ChoiceOption {
  cardId: string;
  name: string;
  cost: number;
  type: CardType;
  text: string;
}

export interface BoardModel {
  viewer: PlayerId;
  phase: PlayerView["phase"];
  turn: number;
  activePlayer: PlayerId;
  /** Tocca a chi guarda (turno suo o scelta sua). */
  myTurn: boolean;
  me: SideModel;
  foe: SideModel;
  /** Opzioni di Scopri, solo se la scelta è di chi guarda. */
  choice: ChoiceOption[] | null;
  result: { outcome: "win" | "loss" | "draw"; reason: GameEndReason } | null;
}

const has = (legal: readonly Action[], pred: (a: Action) => boolean) => legal.some(pred);

function side(view: PlayerView, p: PlayerId, viewer: PlayerId, legal: readonly Action[]): SideModel {
  const ps = view.players[p];
  const mine = p === viewer;
  const heroDef = HEROES_BY_ID.get(ps.hero.heroId)!;
  const power = heroDef.heroPower;

  const hand: CardModel[] = mine
    ? ps.hand.map((c) => {
        const def = CARDS_BY_ID.get(c.cardId)!;
        return {
          instanceId: c.instanceId,
          cardId: def.id,
          name: def.name,
          type: def.type,
          cost: effectiveCost(view, p, c),
          baseCost: def.cost,
          text: def.text,
          ...(def.attack !== undefined ? { attack: def.attack } : {}),
          ...(def.health !== undefined ? { health: def.health } : {}),
          ...(def.durability !== undefined ? { durability: def.durability } : {}),
          keywords: def.keywords.map((k) => KEYWORD_NAMES.get(k) ?? k),
          rarity: def.rarity,
          faction: def.faction,
          playable: mine && has(legal, (a) => a.type === "play_card" && a.card === c.instanceId),
        };
      })
    : [];

  const board: MinionModel[] = ps.board.map((m) => {
    const def = CARDS_BY_ID.get(m.cardId)!;
    return {
      instanceId: m.instanceId,
      cardId: m.cardId,
      name: def.name,
      attack: m.attack,
      health: m.health,
      maxHealth: m.maxHealth,
      damaged: m.health < m.maxHealth,
      buffed: m.attack > (def.attack ?? 0) || m.maxHealth > (def.health ?? 0),
      keywords: m.keywords.map((k) => KEYWORD_NAMES.get(k) ?? k),
      shielded: m.keywords.includes("scudato"),
      taunt: m.keywords.includes("burocrazia"),
      stealthy: m.keywords.includes("smart_working"),
      frozen: m.frozenTurns > 0,
      canAttack: mine && has(legal, (a) => a.type === "attack" && a.attacker.kind === "minion" && a.attacker.instanceId === m.instanceId),
    };
  });

  const weaponDef = ps.weapon ? CARDS_BY_ID.get(ps.weapon.cardId) : undefined;
  const task = ps.task ? { name: CARDS_BY_ID.get(ps.task.cardId)?.name ?? ps.task.cardId, progress: ps.task.progress, goal: ps.task.goal } : null;

  return {
    player: p,
    hero: {
      player: p,
      heroId: heroDef.id,
      name: heroDef.name,
      health: ps.hero.health,
      maxHealth: ps.hero.maxHealth,
      armor: ps.hero.armor,
      weapon: ps.weapon && weaponDef ? { name: weaponDef.name, attack: ps.weapon.attack, durability: ps.weapon.durability } : null,
      canAttack: mine && has(legal, (a) => a.type === "attack" && a.attacker.kind === "hero"),
      power: {
        name: power.name,
        text: power.text,
        cost: power.cost,
        used: ps.hero.heroPowerUsed,
        usable: mine && has(legal, (a) => a.type === "hero_power"),
        options: power.options?.map((o) => o.label) ?? [],
      },
    },
    mana: { ...ps.mana },
    deckCount: ps.deck.length,
    handCount: ps.hand.length,
    hand,
    board,
    task,
    mulliganDone: ps.mulliganDone,
  };
}

export function viewToModel(view: PlayerView, viewer: PlayerId): BoardModel {
  const foe: PlayerId = viewer === "p1" ? "p2" : "p1";
  const legal = getLegalActions(view, viewer);
  const choice =
    view.pendingChoice?.player === viewer
      ? view.pendingChoice.options.map((id): ChoiceOption => {
          const def = CARDS_BY_ID.get(id)!;
          return { cardId: id, name: def.name, cost: def.cost, type: def.type, text: def.text };
        })
      : null;
  const result = view.result
    ? { outcome: view.result.winner === null ? ("draw" as const) : view.result.winner === viewer ? ("win" as const) : ("loss" as const), reason: view.result.reason }
    : null;

  return {
    viewer,
    phase: view.phase,
    turn: view.turn,
    activePlayer: view.activePlayer,
    myTurn: view.phase === "main" && (view.pendingChoice ? view.pendingChoice.player === viewer : view.activePlayer === viewer),
    me: side(view, viewer, viewer, legal),
    foe: side(view, foe, viewer, legal),
    choice,
    result,
  };
}
