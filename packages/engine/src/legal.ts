// Mosse legali (T1.5). getLegalActions è l'unica fonte di cosa si può fare: applyAction accetta
// un'azione solo se la sua forma canonica compare qui. Ogni nuova azione va aggiunta in questo file.

import { attackersOf, attackTargetsOf, canAttackNow, controls, tauntBlocks } from "./combat";
import { opponentOf } from "./context";
import { effectiveCost } from "./costs";
import { CARDS_BY_ID } from "./data";
import type { IllegalActionCode } from "./errors";
import { MAX_BOARD } from "./rules";
import type { Action, ActionType, CharacterRef, GameState, PlayerId } from "./state";
import { chosenTargets } from "./targeting";

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

  // Con una scelta in sospeso l'unica azione di chi sceglie è `choose` (Scopri, GDD §3.2).
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== player) return [];
    return state.pendingChoice.options.map((_, index): Action => ({ type: "choose", player, index }));
  }
  if (player !== state.activePlayer) return [];
  return [...playCardActions(state, player), ...attackActions(state, player), { type: "end_turn", player }];
}

function attackActions(state: GameState, player: PlayerId): Action[] {
  return attackersOf(state, player).flatMap((attacker) =>
    attackTargetsOf(state, player, attacker).map((defender): Action => ({ type: "attack", player, attacker, defender })),
  );
}

/**
 * Una mossa per carta giocabile × posizione (servitori, 0..n) × bersaglio scelto (se la carta lo chiede).
 * Pratica che chiede un bersaglio senza bersagli validi: non giocabile.
 * Servitore con Deploy senza bersagli validi: si gioca senza bersaglio e il Deploy non ha effetto.
 */
function playCardActions(state: GameState, player: PlayerId): Action[] {
  const ps = state.players[player];
  const actions: Action[] = [];
  for (const card of ps.hand) {
    const def = CARDS_BY_ID.get(card.cardId)!;
    if (effectiveCost(state, player, card) > ps.mana.available) continue;
    if (def.task && ps.task) continue; // una sola Task attiva (GDD §3.3)
    const targets = chosenTargets(state, player, def);
    const targetOptions: (CharacterRef | undefined)[] = targets && targets.length > 0 ? targets : [undefined];
    if (def.type === "minion") {
      if (ps.board.length >= MAX_BOARD) continue;
      for (let position = 0; position <= ps.board.length; position++) {
        for (const target of targetOptions) actions.push({ type: "play_card", player, card: card.instanceId, position, ...(target ? { target } : {}) });
      }
    } else {
      if (targets && targets.length === 0) continue;
      for (const target of targetOptions) actions.push({ type: "play_card", player, card: card.instanceId, ...(target ? { target } : {}) });
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
      return isId(a.card) && (a.position === undefined || isId(a.position)) && (a.target === undefined || isCharacterRef(a.target)) ? null : "malformed";
    case "choose":
      return isId(a.index) ? null : "malformed";
    case "attack":
      return isCharacterRef(a.attacker) && isCharacterRef(a.defender) ? null : "malformed";
    default:
      return null;
  }
}

const sameRef = (a: CharacterRef, b: CharacterRef): boolean =>
  a.kind === "hero" ? b.kind === "hero" && a.player === b.player : b.kind === "minion" && a.instanceId === b.instanceId;

function isCharacterRef(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.kind === "hero") return typeof r.player === "string" && PLAYER_IDS.includes(r.player);
  if (r.kind === "minion") return isId(r.instanceId);
  return false;
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
      if (CARDS_BY_ID.get(card.cardId)!.task && ps.task) return "task_active";
      const def = CARDS_BY_ID.get(card.cardId)!;
      const isMinion = def.type === "minion";
      if (isMinion && ps.board.length >= MAX_BOARD) return "board_full";
      const { position, target } = action;
      if (isMinion ? position === undefined || position < 0 || position > ps.board.length : position !== undefined) return "invalid_position";
      const targets = chosenTargets(state, action.player, def);
      const wanted = targets && targets.length > 0;
      if (!wanted ? target !== undefined || (targets !== null && !isMinion) : !target || !targets.some((t) => sameRef(t, target))) {
        return "invalid_target";
      }
      return "not_legal";
    }

    case "attack": {
      if (state.phase !== "main") return "wrong_phase";
      if (action.player !== state.activePlayer) return "not_your_turn";
      if (state.pendingChoice) return "pending_choice";
      if (!controls(state, action.player, action.attacker)) return "invalid_attacker";
      if (!canAttackNow(state, action.player, action.attacker)) return "cannot_attack";
      if (!controls(state, opponentOf(action.player), action.defender)) return "invalid_target";
      if (!attackTargetsOf(state, action.player, action.attacker).some((t) => sameRef(t, action.defender))) {
        return tauntBlocks(state, action.player) ? "taunt_required" : "invalid_target";
      }
      return "not_legal";
    }

    case "choose": {
      if (state.phase !== "main") return "wrong_phase";
      const choice = state.pendingChoice;
      if (!choice) return "no_pending_choice";
      if (choice.player !== action.player) return "not_your_turn";
      if (action.index < 0 || action.index >= choice.options.length) return "invalid_choice";
      return "not_legal";
    }

    default:
      // hero_power: arriva con T1.16.
      return "not_implemented";
  }
}
