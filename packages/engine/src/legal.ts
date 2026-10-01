// Mosse legali (T1.5). getLegalActions è l'unica fonte di cosa si può fare: applyAction accetta
// un'azione solo se la sua forma canonica compare qui. Ogni nuova azione va aggiunta in questo file.

import { effectiveCost } from "./costs";
import { CARDS_BY_ID } from "./data";
import type { IllegalActionCode } from "./errors";
import { MAX_BOARD } from "./rules";
import type { Action, ActionType, GameState, PlayerId } from "./state";

const PLAYER_IDS: readonly string[] = ["p1", "p2"];
const ACTION_TYPES: readonly ActionType[] = ["mulligan", "play_card", "attack", "hero_power", "choose", "end_turn", "concede"];

export function getLegalActions(state: GameState, player: PlayerId): Action[] {
  if (state.phase === "ended" || !PLAYER_IDS.includes(player)) return [];
  // Arrendersi è sempre possibile, per entrambi, finché la partita è in corso.
  return [...phaseActions(state, player), { type: "concede", player }];
}

function phaseActions(state: GameState, player: PlayerId): Action[] {
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
  return [...playCardActions(state, player), { type: "end_turn", player }];
}

/** Una mossa per carta giocabile; per i servitori una per ogni posizione 0..n sulla scrivania. */
function playCardActions(state: GameState, player: PlayerId): Action[] {
  const ps = state.players[player];
  const actions: Action[] = [];
  for (const card of ps.hand) {
    const def = CARDS_BY_ID.get(card.cardId)!;
    if (effectiveCost(state, player, card) > ps.mana.available) continue;
    if (def.type === "minion") {
      if (ps.board.length >= MAX_BOARD) continue;
      for (let position = 0; position <= ps.board.length; position++) {
        actions.push({ type: "play_card", player, card: card.instanceId, position });
      }
    } else {
      // Bersagli delle Pratiche: arrivano con gli effetti (T1.12).
      actions.push({ type: "play_card", player, card: card.instanceId });
    }
  }
  return actions;
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
      return isId(a.card) && (a.position === undefined || isId(a.position)) ? null : "malformed";
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

    case "play_card": {
      if (state.phase !== "main") return "wrong_phase";
      if (action.player !== state.activePlayer) return "not_your_turn";
      if (state.pendingChoice) return "pending_choice";
      const card = ps.hand.find((c) => c.instanceId === action.card);
      if (!card) return "card_not_in_hand";
      if (effectiveCost(state, action.player, card) > ps.mana.available) return "not_enough_mana";
      const isMinion = CARDS_BY_ID.get(card.cardId)!.type === "minion";
      if (isMinion && ps.board.length >= MAX_BOARD) return "board_full";
      const { position } = action;
      if (isMinion ? position === undefined || position < 0 || position > ps.board.length : position !== undefined) return "invalid_position";
      return "not_legal";
    }

    default:
      // attack, hero_power, choose: arrivano nei task T1.8–T1.16.
      return "not_implemented";
  }
}
