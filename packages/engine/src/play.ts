// Giocare una carta dalla mano (T1.7, GDD §1.5.2–3). L'azione è già validata da getLegalActions.

import { equipWeapon, summonMinion } from "./board";
import type { Ctx } from "./context";
import { effectiveCost, modifierMatches } from "./costs";
import { deathPhase } from "./deaths";
import { CARDS_BY_ID } from "./data";
import { effectsOf, runEffects } from "./effects";
import type { CharacterRef, InstanceId, PlayerId } from "./state";

export function playCard(ctx: Ctx, player: PlayerId, cardInstanceId: InstanceId, position?: number, target?: CharacterRef): void {
  const ps = ctx.state.players[player];
  const index = ps.hand.findIndex((c) => c.instanceId === cardInstanceId);
  const card = ps.hand[index]!;
  const def = CARDS_BY_ID.get(card.cardId)!;

  // Si paga, la carta lascia la mano, gli sconti in attesa usati si consumano.
  const cost = effectiveCost(ctx.state, player, card);
  ps.mana.available -= cost;
  ps.hand.splice(index, 1);
  ps.costModifiers = ps.costModifiers.filter((m) => !modifierMatches(m, def));
  ps.played.push(def.id);
  ctx.events.push({ type: "card_played", player, instanceId: card.instanceId, cardId: def.id, ...(target ? { target } : {}) });
  ctx.events.push({ type: "mana_changed", player, max: ps.mana.max, available: ps.mana.available });

  const onPlay = effectsOf(def.id, "on_play");
  switch (def.type) {
    case "minion": {
      // Prima entra in campo, poi il Deploy. Progresso Task "evoca": T1.11.
      const minion = summonMinion(ctx, player, def.id, position)!;
      runEffects(ctx, onPlay, { player, cardId: def.id, minion: minion.instanceId, ...(target ? { target } : {}) });
      break;
    }
    case "spell":
      // Task nella zona Task: T1.11.
      runEffects(ctx, onPlay, { player, cardId: def.id, ...(target ? { target } : {}) });
      break;
    case "weapon":
      equipWeapon(ctx, player, def.id);
      deathPhase(ctx);
      break;
    case "location":
      throw new Error("I Luoghi non sono previsti in v1");
  }
}
