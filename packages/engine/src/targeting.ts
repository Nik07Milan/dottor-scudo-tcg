// Bersagli scelti (selettore `chosen`, T1.12–T1.13): quali personaggi può scegliere chi gioca una carta
// o usa un potere. Unica fonte per getLegalActions e per la diagnosi degli errori.

import { opponentOf } from "./context";
import { matchesFilter } from "./effects";
import type { CharacterRef, GameState, PlayerId } from "./state";
import type { Effect, EffectAction, TargetFilter } from "./types";

/** Danni e cure colpiscono anche gli eroi; tutto il resto solo servitori. */
const HITS_HEROES: ReadonlySet<EffectAction["kind"]> = new Set(["damage", "heal"]);

/**
 * Bersagli validi per effetti `on_play` con selettore `chosen`, oppure `null` se nessuno ne chiede uno.
 * Un bersaglio deve andare bene per tutti gli effetti scelti (intersezione dei filtri).
 * Ordine: propri servitori, proprio eroe, servitori nemici, eroe nemico.
 */
export function chosenTargetsFor(state: GameState, player: PlayerId, effects: readonly Effect[]): CharacterRef[] | null {
  const chosen = effects.filter((e) => e.trigger === "on_play" && "target" in e.action && e.action.target === "chosen").map((e) => e.action);
  if (chosen.length === 0) return null;

  const heroesOk = chosen.every((a) => HITS_HEROES.has(a.kind));
  const fits = (c: { kind: "hero" | "minion"; player: PlayerId; attack?: number }) =>
    chosen.every((a) => matchesFilter(c, targetFilterOf(a), player) && (a.kind !== "destroy" || a.maxAttack === undefined || (c.attack ?? 0) <= a.maxAttack));

  const targets: CharacterRef[] = [];
  for (const p of [player, opponentOf(player)]) {
    for (const m of state.players[p].board) {
      // Smart working: non bersagliabile dagli avversari, sì dal proprio controllore.
      if (p !== player && m.keywords.includes("smart_working")) continue;
      if (fits({ kind: "minion", player: p, attack: m.attack })) targets.push({ kind: "minion", instanceId: m.instanceId });
    }
    if (heroesOk && fits({ kind: "hero", player: p })) targets.push({ kind: "hero", player: p });
  }
  return targets;
}

/** Filtro sul bersaglio di un'azione (non quello sulle carte di `discover` / `cost_modifier`). */
function targetFilterOf(a: EffectAction): TargetFilter | undefined {
  return a.kind === "discover" || a.kind === "cost_modifier" ? undefined : "filter" in a ? a.filter : undefined;
}

/** Bersagli validi per la giocata di una carta (vedi chosenTargetsFor). */
export function chosenTargets(state: GameState, player: PlayerId, card: { effects: readonly Effect[] }): CharacterRef[] | null {
  return chosenTargetsFor(state, player, card.effects);
}
