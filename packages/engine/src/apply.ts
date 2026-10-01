// Punto di ingresso del reducer: applyAction(state, action) -> { state, events }.
// Accetta un'azione solo se è in getLegalActions (forma canonica); altrimenti IllegalActionError.
// Lo stato in ingresso non viene mai modificato: si lavora su una copia profonda.

import type { Ctx } from "./context";
import { IllegalActionError } from "./errors";
import { actionKey, checkShape, diagnose, getLegalActions } from "./legal";
import type { Action, ApplyResult, GameState } from "./state";
import { endTurn, mulligan } from "./turn";

export function applyAction(state: GameState, action: Action): ApplyResult {
  // L'azione può arrivare dal client come JSON qualsiasi: prima la forma, poi la legalità.
  const shape = checkShape(action);
  if (shape) throw new IllegalActionError(shape, shape === "malformed" ? "Azione malformata" : "Azione sconosciuta");

  const key = actionKey(action);
  if (!getLegalActions(state, action.player).some((a) => actionKey(a) === key)) {
    const code = diagnose(state, action);
    throw new IllegalActionError(code, MESSAGES[code] ?? "Azione non consentita");
  }

  const ctx: Ctx = { state: structuredClone(state), events: [] };
  switch (action.type) {
    case "mulligan":
      mulligan(ctx, action.player, action.replace);
      break;
    case "end_turn":
      endTurn(ctx, action.player);
      break;
    default:
      // Irraggiungibile: getLegalActions non propone altri tipi finché non sono implementati qui.
      throw new IllegalActionError("not_implemented", `Azione non ancora supportata: ${action.type}`);
  }
  return { state: ctx.state, events: ctx.events };
}

const MESSAGES: Partial<Record<string, string>> = {
  game_over: "La partita è finita",
  wrong_phase: "Azione non consentita in questa fase",
  not_your_turn: "Non è il tuo turno",
  already_done: "Mulligan già fatto",
  card_not_in_hand: "Carta non in mano",
  duplicate_card: "Carta ripetuta",
  pending_choice: "C'è una scelta in sospeso",
  not_implemented: "Azione non ancora supportata",
};
