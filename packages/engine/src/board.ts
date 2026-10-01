// Scrivanie e Strumenti: evocare servitori ed equipaggiare armi. Riusato da play_card e dagli effetti.

import { newInstanceId, type Ctx } from "./context";
import { CARDS_BY_ID } from "./data";
import { MAX_BOARD } from "./rules";
import type { MinionInstance, PlayerId } from "./state";

/**
 * Mette un servitore sulla scrivania di `player` in `position` (default: a destra).
 * Con la scrivania piena non succede nulla e restituisce null (GDD §1.6). Non risolve il Deploy.
 */
export function summonMinion(ctx: Ctx, player: PlayerId, cardId: string, position?: number): MinionInstance | null {
  const board = ctx.state.players[player].board;
  if (board.length >= MAX_BOARD) return null;
  const def = CARDS_BY_ID.get(cardId);
  if (!def || def.type !== "minion") throw new Error(`non è un servitore: ${cardId}`);

  const minion: MinionInstance = {
    instanceId: newInstanceId(ctx),
    cardId,
    owner: player,
    attack: def.attack!,
    health: def.health!,
    maxHealth: def.health!,
    keywords: [...def.keywords],
    frozenTurns: 0,
    frozenOnTurn: null,
    attacksThisTurn: 0,
    summonedThisTurn: true,
  };
  const at = Math.min(position ?? board.length, board.length);
  board.splice(at, 0, minion);
  ctx.events.push({ type: "minion_summoned", player, instanceId: minion.instanceId, cardId, position: at });
  return minion;
}

/** Equipaggia uno Strumento; quello già equipaggiato viene distrutto. */
export function equipWeapon(ctx: Ctx, player: PlayerId, cardId: string): void {
  const ps = ctx.state.players[player];
  const def = CARDS_BY_ID.get(cardId);
  if (!def || def.type !== "weapon") throw new Error(`non è uno Strumento: ${cardId}`);
  if (ps.weapon) ctx.events.push({ type: "weapon_destroyed", player, cardId: ps.weapon.cardId });
  ps.weapon = { instanceId: newInstanceId(ctx), cardId, attack: def.attack!, durability: def.durability! };
  ctx.events.push({ type: "weapon_equipped", player, instanceId: ps.weapon.instanceId, cardId });
}
