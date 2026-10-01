// Danni a eroi e servitori. La morte non avviene qui: la gestisce la fase morti a fine effetto (deaths.ts).

import { doom, type Ctx } from "./context";
import type { CharacterRef, GameState, InstanceId, MinionInstance, PlayerId } from "./state";
import type { Keyword } from "./types";

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

/**
 * Danno a un servitore (GDD §3.1). Scudato annulla la prima istanza > 0 e si perde.
 * Se la sorgente ha Mani in merda e il danno passa, il bersaglio è distrutto.
 * Restituisce il danno effettivamente inflitto (0 se annullato).
 */
export function damageMinion(ctx: Ctx, minion: MinionInstance, amount: number, source?: MinionInstance): number {
  if (amount <= 0) return 0;
  const target: CharacterRef = { kind: "minion", instanceId: minion.instanceId };
  const shield = minion.keywords.indexOf("scudato");
  if (shield >= 0) {
    minion.keywords.splice(shield, 1);
    ctx.events.push({ type: "shield_broken", target });
    return 0;
  }
  minion.health -= amount;
  ctx.events.push({ type: "damage", target, amount });
  if (source?.keywords.includes("mani_in_merda")) doom(ctx, minion.instanceId);
  return amount;
}

/** Toglie una keyword a un servitore, se ce l'ha. */
export function loseKeyword(ctx: Ctx, minion: MinionInstance, keyword: Keyword): void {
  const i = minion.keywords.indexOf(keyword);
  if (i < 0) return;
  minion.keywords.splice(i, 1);
  ctx.events.push({ type: "keyword_lost", instanceId: minion.instanceId, keyword });
}

export function damageCharacter(ctx: Ctx, target: CharacterRef, amount: number): void {
  if (target.kind === "hero") return damageHero(ctx, target.player, amount);
  const loc = findMinion(ctx.state, target.instanceId);
  if (loc) damageMinion(ctx, loc.minion, amount);
}
