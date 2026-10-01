// Fine partita (T1.6, GDD §1 e §1.5.7): ferie a zero, pareggio simultaneo, limite di turni, resa.

import type { Ctx } from "./context";
import type { GameResult } from "./state";

export function finishGame(ctx: Ctx, result: GameResult): void {
  ctx.state.phase = "ended";
  ctx.state.result = result;
  ctx.events.push({ type: "game_over", result });
}

/**
 * Controlla gli eroi a fine azione: uno solo a 0 ferie perde, entrambi = pareggio.
 * Va chiamata solo a risoluzione completa: un eroe a 0 a metà effetto non interrompe l'effetto.
 * Restituisce true se la partita è finita.
 */
export function checkHeroes(ctx: Ctx): boolean {
  const { p1, p2 } = ctx.state.players;
  const p1Dead = p1.hero.health <= 0;
  const p2Dead = p2.hero.health <= 0;
  if (!p1Dead && !p2Dead) return false;
  finishGame(ctx, { winner: p1Dead && p2Dead ? null : p1Dead ? "p2" : "p1", reason: "hero_defeated" });
  return true;
}
