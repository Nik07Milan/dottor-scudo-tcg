// Partita tra due bot (T1.20): stesso setup, stessi bot, stesso seed ⇒ stessa partita.
// Usato dalla CLI `simulate`, da `botmatch` (M2) e dai test di robustezza.

import { applyAction } from "./apply";
import type { Bot } from "./bots/bot";
import { createGame, type GameSetup } from "./game";
import { getLegalActions } from "./legal";
import type { Action, GameEvent, GameResult, GameState, PlayerId } from "./state";
import { getPlayerView } from "./view";

/** Rete di sicurezza: una partita normale ne usa poche centinaia. */
export const MAX_ACTIONS_PER_GAME = 10_000;

export interface GameRecord {
  setup: GameSetup;
  bots: [string, string];
  actions: Action[];
  events: GameEvent[];
  result: GameResult;
  /** Turni giocati (GameState.turn finale). */
  turns: number;
  final: GameState;
}

/** Chi deve agire ora: nel mulligan p1 poi p2, poi chi ha una scelta in sospeso, altrimenti il giocatore di turno. */
export function actorOf(state: GameState): PlayerId {
  if (state.phase === "mulligan") return state.players.p1.mulliganDone ? "p2" : "p1";
  return state.pendingChoice?.player ?? state.activePlayer;
}

/** `onStep` è chiamato dopo ogni azione con lo stato risultante (es. per controllare gli invarianti). */
export function playGame(
  setup: GameSetup,
  bots: readonly [Bot, Bot],
  seed: number,
  onStep?: (state: GameState, action: Action) => void,
): GameRecord {
  const start = createGame(setup);
  let state = start.state;
  const events = [...start.events];
  const actions: Action[] = [];
  const rngs: [number, number] = [seed >>> 0, (seed * 31 + 7) >>> 0];

  while (state.phase !== "ended") {
    if (actions.length >= MAX_ACTIONS_PER_GAME) throw new Error(`partita oltre ${MAX_ACTIONS_PER_GAME} azioni (seed ${setup.seed})`);
    const player = actorOf(state);
    const index = player === "p1" ? 0 : 1;
    const legal = getLegalActions(state, player);
    const decision = bots[index]!.choose(getPlayerView(state, player), player, legal, rngs[index]!);
    rngs[index] = decision.rng;
    const r = applyAction(state, decision.action);
    state = r.state;
    actions.push(decision.action);
    events.push(...r.events);
    onStep?.(state, decision.action);
  }

  return { setup, bots: [bots[0].name, bots[1].name], actions, events, result: state.result!, turns: state.turn, final: state };
}
