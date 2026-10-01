// Utilità comuni ai test delle keyword.
import { applyAction } from "../../src/apply";
import { getLegalActions } from "../../src/legal";
import type { CharacterRef, GameState } from "../../src/state";
import { other, startedGame } from "../helpers";

/** Turno 1 appena iniziato: `me` è il giocatore attivo. */
export function table() {
  const state = startedGame();
  return { state, me: state.activePlayer, foe: other(state.activePlayer) };
}

export const attack = (state: GameState, attacker: CharacterRef, defender: CharacterRef) =>
  applyAction(state, { type: "attack", player: state.activePlayer, attacker, defender });

const sameRef = (a: CharacterRef, b: CharacterRef) => JSON.stringify(a) === JSON.stringify(b);

/** Bersagli legali di `attacker` per il giocatore attivo. */
export const attackTargets = (state: GameState, attacker: CharacterRef): CharacterRef[] =>
  getLegalActions(state, state.activePlayer).flatMap((a) => (a.type === "attack" && sameRef(a.attacker, attacker) ? [a.defender] : []));

/** Bersagli legali di una carta in mano del giocatore attivo. */
export const playTargets = (state: GameState, card: number): (CharacterRef | undefined)[] =>
  getLegalActions(state, state.activePlayer).flatMap((a) => (a.type === "play_card" && a.card === card ? [a.target] : []));
