// Interprete del DSL degli effetti (T1.12, T1.13). Ogni `EffectAction` di data/cards.json passa da qui.
// Bersagli relativi a chi controlla la sorgente; casualità solo dall'RNG dello stato.

import { summonMinion } from "./board";
import { CUSTOM_HANDLERS } from "./cards/custom";
import { doom, isDoomed, newCard, opponentOf, type Ctx } from "./context";
import { damageHero, damageMinion, findMinion, loseKeyword } from "./damage";
import { CARDS, CARDS_BY_ID } from "./data";
import { deathPhase } from "./deaths";
import { randomInt, shuffle } from "./rng";
import { DISCOVER_OPTIONS, MAX_BOARD, MAX_MANA, RESOLUTION_STEP_LIMIT } from "./rules";
import type { CharacterRef, InstanceId, MinionInstance, PlayerId } from "./state";
import { addToHand, drawCard } from "./turn";
import type { CardFilter, Effect, EffectAction, TargetFilter, TargetSelector, Trigger } from "./types";

/** Da dove viene un effetto: chi lo controlla, quale carta, quale servitore, quale bersaglio scelto. */
export interface EffectSource {
  player: PlayerId;
  cardId: string;
  /** Servitore sorgente (Deploy, trigger, Ultimo sorso). Assente per Pratiche e poteri eroe. */
  minion?: InstanceId;
  /** Bersaglio scelto nell'azione, per il selettore `chosen`. */
  target?: CharacterRef;
  /** Posto che occupava il servitore sorgente, se non è più in campo (Ultimo sorso): lì entrano gli evocati. */
  slot?: number;
}

type Character = { kind: "hero"; player: PlayerId } | { kind: "minion"; player: PlayerId; minion: MinionInstance };

/** Effetti di una carta per un certo trigger. */
export function effectsOf(cardId: string, trigger: Trigger): Effect[] {
  return CARDS_BY_ID.get(cardId)?.effects.filter((e) => e.trigger === trigger) ?? [];
}

/**
 * Risolve gli effetti in ordine come un'unica risoluzione, poi la fase morti (GDD §1.5.5).
 * Il trigger degli effetti non viene controllato: chi chiama passa quelli giusti.
 */
export function runEffects(ctx: Ctx, effects: readonly Effect[], source: EffectSource): void {
  resolveEffects(ctx, effects, source);
  deathPhase(ctx);
}

/**
 * Risolve gli effetti senza fase morti (la usa la fase morti stessa per gli Ultimo sorso).
 * Ogni azione è un passo: oltre RESOLUTION_STEP_LIMIT la risoluzione si interrompe (ctx.aborted).
 * Dopo ogni azione scattano i trigger "quando subisce danni" dei servitori colpiti (GDD §1.5.4).
 */
export function resolveEffects(ctx: Ctx, effects: readonly Effect[], source: EffectSource): void {
  for (const effect of effects) {
    if (ctx.aborted) return;
    ctx.steps = (ctx.steps ?? 0) + 1;
    if (ctx.steps > RESOLUTION_STEP_LIMIT) {
      ctx.aborted = true;
      return;
    }
    resolveAction(ctx, effect.action, source);
    flushDamageTriggers(ctx);
  }
}

/** Trigger `on_damaged` in coda, nell'ordine in cui i servitori sono stati colpiti. */
export function flushDamageTriggers(ctx: Ctx): void {
  while (ctx.damaged && ctx.damaged.length > 0 && !ctx.aborted) {
    const id = ctx.damaged.shift()!;
    const loc = findMinion(ctx.state, id);
    if (!loc) continue;
    const effects = effectsOf(loc.minion.cardId, "on_damaged");
    if (effects.length > 0) resolveEffects(ctx, effects, { player: loc.player, cardId: loc.minion.cardId, minion: id });
  }
}

/** Trigger dei servitori di `player` (inizio/fine turno), in ordine di entrata in gioco. */
export function runBoardTrigger(ctx: Ctx, player: PlayerId, trigger: Trigger): void {
  const sources = [...ctx.state.players[player].board].sort((a, b) => a.instanceId - b.instanceId);
  for (const m of sources) {
    if (ctx.aborted) return;
    const effects = effectsOf(m.cardId, trigger);
    if (effects.length === 0 || !isAlive(ctx, m.instanceId)) continue;
    runEffects(ctx, effects, { player, cardId: m.cardId, minion: m.instanceId });
  }
}

const isAlive = (ctx: Ctx, id: InstanceId): boolean => {
  const loc = findMinion(ctx.state, id);
  return !!loc && loc.minion.health > 0 && !isDoomed(ctx, id);
};

/** Il personaggio rispetta il filtro, guardando da `me`. */
export function matchesFilter(c: { kind: "hero" | "minion"; player: PlayerId; attack?: number }, filter: TargetFilter | undefined, me: PlayerId): boolean {
  if (!filter) return true;
  if (filter.side === "enemy" && c.player === me) return false;
  if (filter.side === "friendly" && c.player !== me) return false;
  if (filter.maxAttack !== undefined && (c.kind !== "minion" || (c.attack ?? 0) > filter.maxAttack)) return false;
  return true;
}

/** Personaggi selezionati, nell'ordine: giocatore della sorgente poi avversario, scrivania da sinistra, eroe per ultimo. */
function select(ctx: Ctx, selector: TargetSelector, source: EffectSource, filter?: TargetFilter): Character[] {
  const me = source.player;
  return selectRaw(ctx, selector, source).filter((c) =>
    matchesFilter({ kind: c.kind, player: c.player, ...(c.kind === "minion" ? { attack: c.minion.attack } : {}) }, filter, me),
  );
}

function selectRaw(ctx: Ctx, selector: TargetSelector, source: EffectSource): Character[] {
  const { state } = ctx;
  const me = source.player;
  const foe = opponentOf(me);
  const minionsOf = (p: PlayerId): Character[] =>
    state.players[p].board.filter((m) => isAlive(ctx, m.instanceId)).map((minion) => ({ kind: "minion", player: p, minion }));
  const notSource = (c: Character) => c.kind === "minion" && c.minion.instanceId !== source.minion;

  switch (selector) {
    case "chosen": {
      const t = source.target;
      if (!t) return [];
      if (t.kind === "hero") return [{ kind: "hero", player: t.player }];
      if (!isAlive(ctx, t.instanceId)) return [];
      const loc = findMinion(state, t.instanceId)!;
      return [{ kind: "minion", player: loc.player, minion: loc.minion }];
    }
    case "self": {
      if (source.minion === undefined || !isAlive(ctx, source.minion)) return [];
      const loc = findMinion(state, source.minion)!;
      return [{ kind: "minion", player: loc.player, minion: loc.minion }];
    }
    case "friendly_hero":
      return [{ kind: "hero", player: me }];
    case "enemy_hero":
      return [{ kind: "hero", player: foe }];
    case "all_enemy_minions":
      return minionsOf(foe);
    case "all_friendly_minions":
      return minionsOf(me);
    case "all_other_friendly_minions":
      return minionsOf(me).filter(notSource);
    case "all_minions":
      return [...minionsOf(me), ...minionsOf(foe)];
    case "all_other_minions":
      return [...minionsOf(me), ...minionsOf(foe)].filter(notSource);
    case "random_enemy_minion": {
      const pool = minionsOf(foe);
      if (pool.length === 0) return [];
      const r = randomInt(state.rng, pool.length);
      state.rng = r.seed;
      return [pool[r.value]!];
    }
  }
}

const minionsIn = (chars: Character[]): { player: PlayerId; minion: MinionInstance }[] =>
  chars.flatMap((c) => (c.kind === "minion" ? [{ player: c.player, minion: c.minion }] : []));

const refOf = (c: Character): CharacterRef => (c.kind === "hero" ? { kind: "hero", player: c.player } : { kind: "minion", instanceId: c.minion.instanceId });

/** Carte proponibili da Scopri a `player`: niente token né firme di altri eroi (GDD §3.2). */
export function discoverPool(ctxState: Ctx["state"], player: PlayerId, filter: CardFilter): string[] {
  const heroId = ctxState.players[player].hero.heroId;
  return CARDS.filter(
    (c) =>
      c.rarity !== "token" &&
      (!c.signatureOf || c.signatureOf === heroId) &&
      (filter.type === undefined || c.type === filter.type) &&
      (filter.faction === undefined || c.faction === filter.faction),
  ).map((c) => c.id);
}

function resolveAction(ctx: Ctx, action: EffectAction, source: EffectSource): void {
  const { state } = ctx;
  const me = source.player;

  switch (action.kind) {
    case "damage": {
      // Tutti i bersagli insieme (GDD §1.5.4); le morti a fine risoluzione.
      // Un servitore sorgente con Mani in merda avvelena anche i danni dei suoi effetti.
      const poisoner = source.minion !== undefined ? findMinion(state, source.minion)?.minion : undefined;
      for (const c of select(ctx, action.target, source, action.filter)) {
        if (c.kind === "hero") damageHero(ctx, c.player, action.amount);
        else damageMinion(ctx, c.minion, action.amount, poisoner);
      }
      return;
    }

    case "heal":
      for (const c of select(ctx, action.target, source, action.filter)) {
        const holder = c.kind === "hero" ? state.players[c.player].hero : c.minion;
        const healed = Math.min(action.amount, holder.maxHealth - holder.health);
        if (healed <= 0) continue;
        holder.health += healed;
        ctx.events.push({ type: "heal", target: refOf(c), amount: healed });
      }
      return;

    case "armor":
      state.players[me].hero.armor += action.amount;
      ctx.events.push({ type: "armor_gained", player: me, amount: action.amount });
      return;

    case "buff":
      for (const { minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        minion.attack += action.attack;
        minion.health += action.health;
        minion.maxHealth += action.health;
        ctx.events.push({ type: "stats_changed", instanceId: minion.instanceId, attack: minion.attack, health: minion.health });
      }
      return;

    case "give_keyword":
      for (const { minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        if (minion.keywords.includes(action.keyword)) continue;
        minion.keywords.push(action.keyword);
        ctx.events.push({ type: "keyword_gained", instanceId: minion.instanceId, keyword: action.keyword });
      }
      return;

    case "lose_keyword":
      for (const { minion } of minionsIn(select(ctx, action.target, source, action.filter))) loseKeyword(ctx, minion, action.keyword);
      return;

    case "summon": {
      const side = action.forOpponent ? opponentOf(me) : me;
      // Da un servitore in campo: alla sua destra. Da un Ultimo sorso: al posto del morto. Altrimenti in fondo.
      const sourceLoc = !action.forOpponent && source.minion !== undefined ? findMinion(state, source.minion) : null;
      let position =
        sourceLoc && sourceLoc.player === side ? sourceLoc.index + 1 : !action.forOpponent && source.slot !== undefined ? source.slot : undefined;
      for (let i = 0; i < action.count; i++) {
        const summoned = summonMinion(ctx, side, action.cardId, position);
        if (!summoned) break; // scrivania piena
        if (position !== undefined) position += 1;
      }
      return;
    }

    case "summon_copy":
      for (const { player, minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        const index = state.players[player].board.indexOf(minion);
        const copy = summonMinion(ctx, player, minion.cardId, index + 1);
        if (!copy) continue;
        copy.attack = action.attack;
        copy.health = copy.maxHealth = action.health;
        ctx.events.push({ type: "stats_changed", instanceId: copy.instanceId, attack: copy.attack, health: copy.health });
      }
      return;

    case "draw": {
      const who = action.forOpponent ? opponentOf(me) : me;
      for (let i = 0; i < action.count; i++) {
        const card = drawCard(ctx, who);
        if (card && action.costModifier) card.costModifier += action.costModifier;
      }
      return;
    }

    case "add_to_hand":
      for (let i = 0; i < action.count; i++) addToHand(ctx, me, newCard(ctx, action.cardId));
      return;

    case "discover": {
      // Una scelta alla volta: un secondo Scopri nella stessa risoluzione viene ignorato.
      if (state.pendingChoice) return;
      const pool = discoverPool(state, me, action.filter);
      if (pool.length === 0) return;
      const shuffled = shuffle(state.rng, pool);
      state.rng = shuffled.seed;
      const options = shuffled.value.slice(0, DISCOVER_OPTIONS);
      state.pendingChoice = { kind: "discover", player: me, options };
      ctx.events.push({ type: "discover_offered", player: me, options });
      return;
    }

    case "destroy":
      for (const { minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        if (action.maxAttack !== undefined && minion.attack > action.maxAttack) continue;
        doom(ctx, minion.instanceId);
      }
      return;

    case "return_to_hand":
      for (const { player, minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        const board = state.players[player].board;
        board.splice(board.indexOf(minion), 1);
        ctx.events.push({ type: "returned_to_hand", player: minion.owner, instanceId: minion.instanceId, cardId: minion.cardId });
        // Torna come carta base al proprietario; a mano piena è scartata, senza Ultimo sorso (GDD §1.6).
        const card = newCard(ctx, minion.cardId);
        card.costModifier = action.costModifier ?? 0;
        addToHand(ctx, minion.owner, card);
      }
      return;

    case "take_control":
      for (const { player, minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        if (player === me || state.players[me].board.length >= MAX_BOARD) continue; // scrivania piena: nessun effetto
        const from = state.players[player].board;
        from.splice(from.indexOf(minion), 1);
        minion.summonedThisTurn = true; // non attacca in questo turno, salvo Urgente
        minion.attacksThisTurn = 0;
        state.players[me].board.push(minion);
        ctx.events.push({ type: "control_changed", instanceId: minion.instanceId, from: player, to: me });
      }
      return;

    case "freeze":
      for (const { minion } of minionsIn(select(ctx, action.target, source, action.filter))) {
        minion.frozenTurns = Math.max(minion.frozenTurns, action.turns);
        minion.frozenOnTurn = state.turn;
        ctx.events.push({ type: "frozen", instanceId: minion.instanceId, turns: minion.frozenTurns });
      }
      return;

    case "gain_mana": {
      const mana = state.players[me].mana;
      if (!action.temporary) mana.max = Math.min(MAX_MANA, mana.max + action.amount);
      mana.available = Math.min(MAX_MANA, mana.available + action.amount);
      ctx.events.push({ type: "mana_changed", player: me, max: mana.max, available: mana.available });
      return;
    }

    case "cost_modifier":
      state.players[me].costModifiers.push({ filter: { ...action.filter }, amount: action.amount, expiresEndOfTurn: action.expiresEndOfTurn });
      return;

    case "extra_attack":
      // Effetto statico: lo legge il combattimento (heroAttacksPerTurn), non si "risolve".
      return;

    case "custom": {
      const handler = CUSTOM_HANDLERS[action.handler];
      if (!handler) throw new Error(`effetto custom sconosciuto: ${action.handler} (carta ${source.cardId})`);
      handler(ctx, source);
      return;
    }
  }
}
