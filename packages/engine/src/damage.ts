// Danni a eroi e servitori. La morte non avviene qui: la gestisce la fase morti a fine effetto (deaths.ts).

import type { Ctx } from "./context";
import type { CharacterRef, GameState, InstanceId, MinionInstance, PlayerId } from "./state";

export interface MinionLocation {
  /** Controllore: il lato del campo su cui sta. */
  player: PlayerId;
  minion: MinionInstance;
  index: number;
}

export function findMinion(state: GameState, instanceId: InstanceId): MinionLocation | null {
  for (const player of ["p1", "p2"] as const) {
    const index = state.players[player].board.findIndex((m) => m.instanceId === instanceId);
    if (index >= 0) return { player, minion: state.players[player].board[index]!, index };
  }
  return null;
}

/** Danno all'eroe: prima l'armatura, poi le ferie. La sconfitta si controlla a fine azione (checkHeroes). */
export function damageHero(ctx: Ctx, player: PlayerId, amount: number): void {
  if (amount <= 0) return;
  const hero = ctx.state.players[player].hero;
  const absorbed = Math.min(hero.armor, amount);
  hero.armor -= absorbed;
  hero.health -= amount - absorbed;
  ctx.events.push({ type: "damage", target: { kind: "hero", player }, amount });
}

/** Danno a un servitore. Scudato e Mani in merda: T1.10. */
export function damageMinion(ctx: Ctx, minion: MinionInstance, amount: number): void {
  if (amount <= 0) return;
  minion.health -= amount;
  ctx.events.push({ type: "damage", target: { kind: "minion", instanceId: minion.instanceId }, amount });
}

export function damageCharacter(ctx: Ctx, target: CharacterRef, amount: number): void {
  if (target.kind === "hero") return damageHero(ctx, target.player, amount);
  const loc = findMinion(ctx.state, target.instanceId);
  if (loc) damageMinion(ctx, loc.minion, amount);
}
