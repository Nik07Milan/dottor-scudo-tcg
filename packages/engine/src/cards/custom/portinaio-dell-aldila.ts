// Portinaio dell'aldilà — Ultimo sorso: riporta in mano un tuo collega morto in questa partita.
// Custom perché il DSL non ha selettori sul cimitero: si sceglie a caso (RNG della partita) tra i
// servitori nel cimitero del controllore, escluso il Portinaio stesso appena morto.

import { newCard, type Ctx } from "../../context";
import { CARDS_BY_ID } from "../../data";
import type { EffectSource } from "../../effects";
import { randomInt } from "../../rng";
import { addToHand } from "../../turn";

const SELF = "portinaio-dell-aldila";

export function portinaioDellAldila(ctx: Ctx, source: EffectSource): void {
  const graveyard = [...ctx.state.players[source.player].graveyard];
  // Il Portinaio è già nel cimitero (la fase morti lo aggiunge prima degli Ultimo sorso): ne togliamo una copia.
  const self = graveyard.lastIndexOf(SELF);
  if (self >= 0) graveyard.splice(self, 1);
  const pool = graveyard.filter((id) => CARDS_BY_ID.get(id)?.type === "minion");
  if (pool.length === 0) return;
  const r = randomInt(ctx.state.rng, pool.length);
  ctx.state.rng = r.seed;
  addToHand(ctx, source.player, newCard(ctx, pool[r.value]!));
}
