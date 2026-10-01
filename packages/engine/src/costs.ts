// Costo effettivo delle carte (GDD §1.2): base + sconto sulla carta + sconti in attesa che corrispondono.
// Usato da getLegalActions, da play_card e dal client per mostrare i costi.

import { CARDS_BY_ID } from "./data";
import type { CardInstance, GameState, PendingCostModifier, PlayerId } from "./state";
import type { CardDefinition } from "./types";

export function modifierMatches(mod: PendingCostModifier, card: CardDefinition): boolean {
  return (mod.filter.type === undefined || mod.filter.type === card.type) && (mod.filter.cardId === undefined || mod.filter.cardId === card.id);
}

export function effectiveCost(state: GameState, player: PlayerId, card: CardInstance): number {
  const def = CARDS_BY_ID.get(card.cardId);
  if (!def) throw new Error(`carta sconosciuta: ${card.cardId}`);
  const pending = state.players[player].costModifiers.filter((m) => modifierMatches(m, def)).reduce((sum, m) => sum + m.amount, 0);
  return Math.max(0, def.cost + card.costModifier + pending);
}
