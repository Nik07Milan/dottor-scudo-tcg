// Punto di ingresso del reducer: applyAction(state, action) -> { state, events }.
// Accetta un'azione solo se è in getLegalActions (forma canonica); altrimenti IllegalActionError.
// Lo stato in ingresso non viene mai modificato: si lavora su una copia profonda.

import { performAttack } from "./combat";
import { newCard, opponentOf, type Ctx } from "./context";
import { IllegalActionError } from "./errors";
import { actionKey, checkShape, diagnose, getLegalActions } from "./legal";
import { checkHeroes, finishGame } from "./outcome";
import { playCard } from "./play";
import { useHeroPower } from "./powers";
import type { Action, ApplyResult, GameState } from "./state";
import { addToHand, endTurn, mulligan } from "./turn";

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
    case "play_card":
      playCard(ctx, action.player, action.card, action.position, action.target);
      break;
    case "attack":
      performAttack(ctx, action.player, action.attacker, action.defender);
      break;
    case "hero_power":
      useHeroPower(ctx, action.player, action.option, action.target);
      break;
    case "choose": {
      const choice = ctx.state.pendingChoice!;
      const cardId = choice.options[action.index]!;
      ctx.state.pendingChoice = null;
      ctx.events.push({ type: "card_chosen", player: action.player, cardId });
      addToHand(ctx, action.player, newCard(ctx, cardId));
      break;
    }
    case "end_turn":
      endTurn(ctx, action.player);
      break;
    case "concede":
      finishGame(ctx, { winner: opponentOf(action.player), reason: "concede" });
      break;
    default:
      // Irraggiungibile: ogni tipo di Action è gestito sopra (TypeScript lo verifica con `never`).
      throw new IllegalActionError("not_implemented", `Azione non supportata: ${(action as Action).type}`);
  }
  // Fine partita controllata solo a risoluzione completa (GDD §1.5.7–8).
  if (ctx.state.phase !== "ended") {
    if (ctx.aborted) finishGame(ctx, { winner: null, reason: "resolution_limit" });
    else checkHeroes(ctx);
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
  not_enough_mana: "Caffettini insufficienti",
  board_full: "Scrivanie piene",
  invalid_position: "Posizione non valida",
  invalid_attacker: "Non puoi attaccare con questo personaggio",
  cannot_attack: "Questo personaggio non può attaccare adesso",
  invalid_target: "Bersaglio non valido",
  taunt_required: "Devi prima attaccare un servitore con Burocrazia",
  task_active: "Hai già una Task attiva",
  no_pending_choice: "Non c'è nessuna scelta da fare",
  invalid_choice: "Scelta non valida",
  hero_power_used: "Potere eroe già usato in questo turno",
  invalid_option: "Opzione del potere non valida",
  not_implemented: "Azione non ancora supportata",
};
