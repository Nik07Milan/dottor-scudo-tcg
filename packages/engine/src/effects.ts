// Interprete del DSL degli effetti (T1.12). Ogni `EffectAction` di data/cards.json passa da qui.
// Bersagli relativi a chi controlla la sorgente; casualità solo dall'RNG dello stato.

import { summonMinion } from "./board";
import { CUSTOM_HANDLERS } from "./cards/custom";
import { doom, isDoomed, newCard, opponentOf, type Ctx } from "./context";
import { damageHero, damageMinion, findMinion } from "./damage";
import { CARDS_BY_ID } from "./data";
import { deathPhase } from "./deaths";
import { randomInt } from "./rng";
import { MAX_MANA } from "./rules";
import type { CharacterRef, InstanceId, MinionInstance, PlayerId } from "./state";
import { addToHand, drawCard } from "./turn";
import type { Effect, EffectAction, TargetSelector, Trigger } from "./types";

/** Da dove viene un effetto: chi lo controlla, quale carta, quale servitore, quale bersaglio scelto. */
export interface EffectSource {
  player: PlayerId;
  cardId: string;
  /** Servitore sorgente (Deploy, trigger, Ultimo sorso). Assente per Pratiche e poteri eroe. */
  minion?: InstanceId;
  /** Bersaglio scelto nell'azione, per il selettore `chosen`. */
  target?: CharacterRef;
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
  for (const effect of effects) resolveAction(ctx, effect.action, source);
  deathPhase(ctx);
}

/** Trigger dei servitori di `player` (inizio/fine turno), in ordine di entrata in gioco. */
export function runBoardTrigger(ctx: Ctx, player: PlayerId, trigger: Trigger): void {
  const sources = [...ctx.state.players[player].board].sort((a, b) => a.instanceId - b.instanceId);
  for (const m of sources) {
    const effects = effectsOf(m.cardId, trigger);
    if (effects.length === 0 || !isAlive(ctx, m.instanceId)) continue;
    runEffects(ctx, effects, { player, cardId: m.cardId, minion: m.instanceId });
  }
}

const isAlive = (ctx: Ctx, id: InstanceId): boolean => {
  const loc = findMinion(ctx.state, id);
  return !!loc && loc.minion.health > 0 && !isDoomed(ctx, id);
};

/** Personaggi selezionati, nell'ordine: giocatore della sorgente poi avversario, scrivania da sinistra, eroe per ultimo. */
function select(ctx: Ctx, selector: TargetSelector, source: EffectSource): Character[] {
  const { state } = ctx;
  const me = source.player;
  const foe = opponentOf(me);
  const minionsOf = (p: PlayerId): Character[] =>
    state.players[p].board.filter((m) => isAlive(ctx, m.instanceId)).map((minion) => ({ kind: "minion", player: p, minion }));

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
    case "all_minions":
      return [...minionsOf(me), ...minionsOf(foe)];
    case "all_other_minions":
      return [...minionsOf(me), ...minionsOf(foe)].filter((c) => c.kind === "minion" && c.minion.instanceId !== source.minion);
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

function resolveAction(ctx: Ctx, action: EffectAction, source: EffectSource): void {
  const { state } = ctx;
  const me = source.player;

  switch (action.kind) {
    case "damage":
      // Tutti i bersagli insieme (GDD §1.5.4); le morti a fine risoluzione.
      for (const c of select(ctx, action.target, source)) {
        if (c.kind === "hero") damageHero(ctx, c.player, action.amount);
        else damageMinion(ctx, c.minion, action.amount);
      }
      return;

    case "heal":
      for (const c of select(ctx, action.target, source)) {
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
      for (const { minion } of minionsIn(select(ctx, action.target, source))) {
        minion.attack += action.attack;
        minion.health += action.health;
        minion.maxHealth += action.health;
        ctx.events.push({ type: "stats_changed", instanceId: minion.instanceId, attack: minion.attack, health: minion.health });
      }
      return;

    case "give_keyword":
      for (const { minion } of minionsIn(select(ctx, action.target, source))) {
        if (minion.keywords.includes(action.keyword)) continue;
        minion.keywords.push(action.keyword);
        ctx.events.push({ type: "keyword_gained", instanceId: minion.instanceId, keyword: action.keyword });
      }
      return;

    case "summon": {
      const side = action.forOpponent ? opponentOf(me) : me;
      // Da un servitore: alla sua destra, nell'ordine. Altrimenti in fondo a destra.
      const sourceLoc = !action.forOpponent && source.minion !== undefined ? findMinion(state, source.minion) : null;
      let position = sourceLoc && sourceLoc.player === side ? sourceLoc.index + 1 : undefined;
      for (let i = 0; i < action.count; i++) {
        const summoned = summonMinion(ctx, side, action.cardId, position);
        if (!summoned) break; // scrivania piena
        if (position !== undefined) position += 1;
      }
      return;
    }

    case "draw": {
      const who = action.forOpponent ? opponentOf(me) : me;
      for (let i = 0; i < action.count; i++) drawCard(ctx, who);
      return;
    }

    case "add_to_hand":
      for (let i = 0; i < action.count; i++) addToHand(ctx, me, newCard(ctx, action.cardId));
      return;

    case "destroy":
      for (const { minion } of minionsIn(select(ctx, action.target, source))) {
        if (action.maxAttack !== undefined && minion.attack > action.maxAttack) continue;
        doom(ctx, minion.instanceId);
      }
      return;

    case "return_to_hand":
      for (const { player, minion } of minionsIn(select(ctx, action.target, source))) {
        const board = state.players[player].board;
        board.splice(board.indexOf(minion), 1);
        ctx.events.push({ type: "returned_to_hand", player: minion.owner, instanceId: minion.instanceId, cardId: minion.cardId });
        // Torna come carta base al proprietario; a mano piena è scartata, senza Ultimo sorso (GDD §1.6).
        addToHand(ctx, minion.owner, newCard(ctx, minion.cardId));
      }
      return;

    case "freeze":
      for (const { minion } of minionsIn(select(ctx, action.target, source))) {
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

    case "custom": {
      const handler = CUSTOM_HANDLERS[action.handler];
      if (!handler) throw new Error(`effetto custom sconosciuto: ${action.handler} (carta ${source.cardId})`);
      handler(ctx, source);
      return;
    }
  }
}
