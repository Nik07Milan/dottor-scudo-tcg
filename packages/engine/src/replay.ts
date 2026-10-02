// Replay (T1.19): stesso setup (seed + mazzi) e stesse azioni ⇒ stessa partita, passo per passo.
// È la base di test, anti-cheat e storico partite (M5): basta salvare setup e azioni.

import { applyAction } from "./apply";
import { createGame, type GameSetup } from "./game";
import type { Action, GameEvent, GameState } from "./state";

export interface ReplayResult {
  /** Stato iniziale e uno stato dopo ogni azione: `states.length === actions.length + 1`. */
  states: GameState[];
  /** Eventi di createGame e di ogni azione, in ordine. */
  events: GameEvent[];
  /** Gli stessi eventi divisi per passo: `stepEvents[0]` di createGame, `stepEvents[i]` dell'azione i-1. */
  stepEvents: GameEvent[][];
  final: GameState;
}

/** Rigioca la partita; un'azione illegale lancia IllegalActionError come in applyAction. */
export function replay(setup: GameSetup, actions: readonly Action[]): ReplayResult {
  const start = createGame(setup);
  const states = [start.state];
  const stepEvents = [start.events];
  let state = start.state;
  for (const action of actions) {
    const r = applyAction(state, action);
    state = r.state;
    states.push(state);
    stepEvents.push(r.events);
  }
  return { states, events: stepEvents.flat(), stepEvents, final: state };
}
