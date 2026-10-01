// Fase morti (GDD §1.5.5–6): dopo ogni risoluzione completa escono insieme i servitori con vita ≤ 0
// e quelli distrutti (ctx.doomed). Ordine: prima quelli del giocatore di turno, poi dell'avversario;
// a parità, ordine di entrata (instanceId).
// T1.9 aggiunge la coda degli Ultimo sorso e la ripetizione finché lo stato è stabile.

import { isDoomed, type Ctx } from "./context";
import type { MinionInstance, PlayerId } from "./state";

export function deathPhase(ctx: Ctx): void {
  const { state } = ctx;
  const order: PlayerId[] = [state.activePlayer, state.activePlayer === "p1" ? "p2" : "p1"];
  const isDead = (m: MinionInstance) => m.health <= 0 || isDoomed(ctx, m.instanceId);
  const dead: { player: PlayerId; minion: MinionInstance }[] = [];
  for (const player of order) {
    const ps = state.players[player];
    const dying = ps.board.filter(isDead).sort((a, b) => a.instanceId - b.instanceId);
    ps.board = ps.board.filter((m) => !isDead(m));
    for (const minion of dying) dead.push({ player, minion });
  }
  ctx.doomed?.clear();
  for (const { player, minion } of dead) {
    // Il cimitero è di chi controllava il servitore al momento della morte (GDD §3.1).
    state.players[player].graveyard.push(minion.cardId);
    ctx.events.push({ type: "minion_died", player, instanceId: minion.instanceId, cardId: minion.cardId });
  }
}
