// Mosse legali (T1.5). getLegalActions è l'unica fonte di cosa si può fare: applyAction accetta
// un'azione solo se la sua forma canonica compare qui. Ogni nuova azione va aggiunta in questo file.

import type { IllegalActionCode } from "./errors";
import type { Action, ActionType, GameState, PlayerId } from "./state";

const PLAYER_IDS: readonly string[] = ["p1", "p2"];
const ACTION_TYPES: readonly ActionType[] = ["mulligan", "play_card", "attack", "hero_power", "choose", "end_turn", "concede"];

export function getLegalActions(state: GameState, player: PlayerId): Action[] {
  if (state.phase === "ended" || !PLAYER_IDS.includes(player)) return [];
  const ps = state.players[player];

  if (state.phase === "mulligan") {
    if (ps.mulliganDone) return [];
    // Ogni sottoinsieme della mano (al massimo 2^4 = 16).
    const ids = ps.hand.map((c) => c.instanceId);
    const actions: Action[] = [];
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const replace = ids.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b);
      actions.push({ type: "mulligan", player, replace });
    }
    return actions;
  }

  if (player !== state.activePlayer) return [];
  // Con una scelta in sospeso l'unica azione sarà `choose` (Scopri, T1.13).
  if (state.pendingChoice) return [];
  return [{ type: "end_turn", player }];
}

/** Forma canonica e confrontabile di un'azione: chiavi ordinate, campi assenti omessi, `replace` ordinato. */
export function actionKey(action: Action): string {
  // Robusta anche su input non validato: ordina `replace` solo se è davvero un array.
  const canonical =
    action.type === "mulligan" && Array.isArray(action.replace) ? { ...action, replace: [...action.replace].sort((a, b) => a - b) } : action;
  return stableStringify(canonical);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const isId = (v: unknown): v is number => Number.isSafeInteger(v);

/**
 * Controlla la forma di un'azione arrivata da fuori (JSON non fidato). `null` = forma valida.
 * Non dice se l'azione è legale: lo decide getLegalActions.
 */
export function checkShape(action: unknown): "malformed" | "unknown_action" | null {
  if (typeof action !== "object" || action === null) return "malformed";
  const a = action as Record<string, unknown>;
  if (typeof a.type !== "string") return "malformed";
  if (!(ACTION_TYPES as readonly string[]).includes(a.type)) return "unknown_action";
  if (typeof a.player !== "string" || !PLAYER_IDS.includes(a.player)) return "malformed";
  switch (a.type as ActionType) {
    case "mulligan":
      return Array.isArray(a.replace) && a.replace.every(isId) ? null : "malformed";
    case "play_card":
      return isId(a.card) ? null : "malformed";
    case "choose":
      return isId(a.index) ? null : "malformed";
    default:
      return null;
  }
}

/** Motivo più utile per cui un'azione ben formata non è legale. */
export function diagnose(state: GameState, action: Action): IllegalActionCode {
  if (state.phase === "ended") return "game_over";
  const ps = state.players[action.player];

  switch (action.type) {
    case "mulligan":
      if (state.phase !== "mulligan") return "wrong_phase";
      if (ps.mulliganDone) return "already_done";
      if (new Set(action.replace).size !== action.replace.length) return "duplicate_card";
      if (action.replace.some((id) => !ps.hand.some((c) => c.instanceId === id))) return "card_not_in_hand";
      return "not_legal";

    case "end_turn":
      if (state.phase !== "main") return "wrong_phase";
      if (action.player !== state.activePlayer) return "not_your_turn";
      if (state.pendingChoice) return "pending_choice";
      return "not_legal";

    default:
      // play_card, attack, hero_power, choose, concede: arrivano nei task T1.6–T1.16.
      return "not_implemented";
  }
}
