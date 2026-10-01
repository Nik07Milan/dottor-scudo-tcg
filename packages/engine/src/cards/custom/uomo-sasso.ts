// Uomo Sasso — Deploy: +1/+1 per ogni Sasso giocato in questa partita.
// Custom perché il DSL ha solo buff di valore fisso: qui il valore dipende dallo storico delle carte
// giocate (`PlayerState.played`), che nessun selettore o azione del DSL legge.

import type { Ctx } from "../../context";
import { findMinion } from "../../damage";
import type { EffectSource } from "../../effects";

const STONE = "sasso";

export function uomoSasso(ctx: Ctx, source: EffectSource): void {
  if (source.minion === undefined) return;
  const loc = findMinion(ctx.state, source.minion);
  if (!loc) return;
  const stones = ctx.state.players[source.player].played.filter((id) => id === STONE).length;
  if (stones === 0) return;
  const m = loc.minion;
  m.attack += stones;
  m.health += stones;
  m.maxHealth += stones;
  ctx.events.push({ type: "stats_changed", instanceId: m.instanceId, attack: m.attack, health: m.health });
}
