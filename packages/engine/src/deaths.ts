// Fase morti (T1.9, GDD §1.5.5–6). Dopo ogni risoluzione completa, a giri finché lo stato è stabile:
// 1. escono insieme i servitori con vita ≤ 0 e quelli distrutti (ctx.doomed);
// 2. ordine: prima quelli del giocatore di turno, poi dell'avversario; a parità, ordine di entrata (instanceId);
// 3. cimitero ed eventi `minion_died` per tutti, poi i loro Ultimo sorso nello stesso ordine;
// 4. se gli Ultimo sorso hanno causato nuove morti, nuovo giro. Si ferma su ctx.aborted (limite di passi).

import { isDoomed, opponentOf, type Ctx } from "./context";
import { effectsOf, resolveEffects } from "./effects";
import type { MinionInstance, PlayerId } from "./state";

interface Death {
  /** Controllore al momento della morte: suo il cimitero, relativo a lui l'Ultimo sorso (GDD §3.1). */
  player: PlayerId;
  minion: MinionInstance;
  /** Servitori sopravvissuti alla sua sinistra: il posto dove entrano gli evocati del suo Ultimo sorso. */
  slot: number;
}

export function deathPhase(ctx: Ctx): void {
  const { state } = ctx;
  const isDead = (m: MinionInstance) => m.health <= 0 || isDoomed(ctx, m.instanceId);

  while (!ctx.aborted) {
    const deaths: Death[] = [];
    for (const player of [state.activePlayer, opponentOf(state.activePlayer)]) {
      const ps = state.players[player];
      let survivors = 0;
      const dying: Death[] = [];
      for (const minion of ps.board) {
        if (isDead(minion)) dying.push({ player, minion, slot: survivors });
        else survivors++;
      }
      ps.board = ps.board.filter((m) => !isDead(m));
      deaths.push(...dying.sort((a, b) => a.minion.instanceId - b.minion.instanceId));
    }
    ctx.doomed?.clear();
    if (deaths.length === 0) return;

    for (const { player, minion } of deaths) {
      state.players[player].graveyard.push(minion.cardId);
      ctx.events.push({ type: "minion_died", player, instanceId: minion.instanceId, cardId: minion.cardId });
    }
    for (const { player, minion, slot } of deaths) {
      const lastWords = effectsOf(minion.cardId, "on_death");
      if (lastWords.length > 0) resolveEffects(ctx, lastWords, { player, cardId: minion.cardId, slot });
    }
  }
}
