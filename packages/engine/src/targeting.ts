// Bersagli scelti (selettore `chosen`, T1.12): quali personaggi può scegliere chi gioca una carta.
// Unica fonte per getLegalActions e per la diagnosi degli errori.

import { opponentOf } from "./context";
import type { CharacterRef, GameState, PlayerId } from "./state";
import type { CardDefinition, EffectAction } from "./types";

/** Danni e cure colpiscono anche gli eroi; tutto il resto solo servitori. */
const HITS_HEROES: ReadonlySet<EffectAction["kind"]> = new Set(["damage", "heal"]);

/**
 * Bersagli validi per la giocata di `card`, oppure `null` se la carta non chiede un bersaglio.
 * Ordine: propri servitori, proprio eroe, servitori nemici, eroe nemico.
 */
export function chosenTargets(state: GameState, player: PlayerId, card: CardDefinition): CharacterRef[] | null {
  const chosen = card.effects.filter((e) => e.trigger === "on_play" && "target" in e.action && e.action.target === "chosen").map((e) => e.action);
  if (chosen.length === 0) return null;

  const heroesOk = chosen.every((a) => HITS_HEROES.has(a.kind));
  const maxAttack = Math.min(...chosen.map((a) => (a.kind === "destroy" && a.maxAttack !== undefined ? a.maxAttack : Infinity)));

  const targets: CharacterRef[] = [];
  for (const p of [player, opponentOf(player)]) {
    for (const m of state.players[p].board) {
      // Smart working (non bersagliabile dagli avversari): T1.10.
      if (m.attack <= maxAttack) targets.push({ kind: "minion", instanceId: m.instanceId });
    }
    if (heroesOk) targets.push({ kind: "hero", player: p });
  }
  return targets;
}
