// Poteri eroe (T1.16, GDD §4): costo, una volta per turno, eventuale scelta tra opzioni e bersaglio.

import type { Ctx } from "./context";
import { HEROES_BY_ID } from "./data";
import { runEffects } from "./effects";
import type { Action, CharacterRef, GameState, PlayerId } from "./state";
import { chosenTargetsFor } from "./targeting";
import type { Effect, HeroPowerDefinition } from "./types";

export function heroPowerOf(state: GameState, player: PlayerId): HeroPowerDefinition {
  return HEROES_BY_ID.get(state.players[player].hero.heroId)!.heroPower;
}

/** Effetti del potere per l'opzione scelta; `null` se l'opzione non è valida. */
export function powerEffects(power: HeroPowerDefinition, option: number | undefined): readonly Effect[] | null {
  if (!power.options) return option === undefined ? power.effects : null;
  if (option === undefined) return null;
  return power.options[option]?.effects ?? null;
}

/** Il potere si può usare ora (a parte opzione e bersaglio)? */
export function heroPowerReady(state: GameState, player: PlayerId): boolean {
  const ps = state.players[player];
  return !ps.hero.heroPowerUsed && heroPowerOf(state, player).cost <= ps.mana.available;
}

/** Mosse legali del potere: una per opzione × bersaglio; un'opzione con bersaglio ma senza bersagli non c'è. */
export function heroPowerActions(state: GameState, player: PlayerId): Action[] {
  if (!heroPowerReady(state, player)) return [];
  const power = heroPowerOf(state, player);
  const variants: { option?: number; effects: readonly Effect[] }[] = power.options
    ? power.options.map((o, option) => ({ option, effects: o.effects }))
    : [{ effects: power.effects }];

  const actions: Action[] = [];
  for (const { option, effects } of variants) {
    const base = { type: "hero_power" as const, player, ...(option === undefined ? {} : { option }) };
    const targets = chosenTargetsFor(state, player, effects);
    if (targets === null) actions.push(base);
    else for (const target of targets) actions.push({ ...base, target });
  }
  return actions;
}

export function useHeroPower(ctx: Ctx, player: PlayerId, option: number | undefined, target: CharacterRef | undefined): void {
  const ps = ctx.state.players[player];
  const power = heroPowerOf(ctx.state, player);
  ps.mana.available -= power.cost;
  ps.hero.heroPowerUsed = true;
  ctx.events.push({ type: "hero_power_used", player, ...(target ? { target } : {}) });
  ctx.events.push({ type: "mana_changed", player, max: ps.mana.max, available: ps.mana.available });
  runEffects(ctx, powerEffects(power, option)!, { player, cardId: ps.hero.heroId, ...(target ? { target } : {}) });
}
