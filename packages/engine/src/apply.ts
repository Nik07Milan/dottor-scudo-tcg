// Punto di ingresso del reducer: applyAction(state, action) -> { state, events }.
// Lo stato in ingresso non viene mai modificato: si lavora su una copia profonda.

import type { Ctx } from "./context";
import { IllegalActionError } from "./errors";
import type { Action, ApplyResult, GameState } from "./state";
import { endTurn, mulligan } from "./turn";

export function applyAction(state: GameState, action: Action): ApplyResult {
  const ctx: Ctx = { state: structuredClone(state), events: [] };
  const s = ctx.state;

  if (s.phase === "ended") throw new IllegalActionError("game_over", "La partita è finita");

  switch (action.type) {
    case "mulligan":
      mulligan(ctx, action.player, action.replace);
      break;

    case "end_turn":
      if (s.phase !== "main") throw new IllegalActionError("wrong_phase", "Non si può finire il turno adesso");
      if (action.player !== s.activePlayer) throw new IllegalActionError("not_your_turn", "Non è il tuo turno");
      if (s.pendingChoice) throw new IllegalActionError("pending_choice", "C'è una scelta in sospeso");
      endTurn(ctx, action.player);
      break;

    default:
      throw new IllegalActionError("not_implemented", `Azione non ancora supportata: ${action.type}`);
  }

  return { state: ctx.state, events: ctx.events };
}
