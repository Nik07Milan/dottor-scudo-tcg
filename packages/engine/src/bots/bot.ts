// Interfaccia comune dei bot (T1.20, T2.1). Un bot vede solo la propria PlayerView e le mosse legali:
// non può barare. È deterministico: la sua casualità passa da un seed che riceve e restituisce.

import type { Action, PlayerId } from "../state";
import type { PlayerView } from "../view";

export interface BotDecision {
  action: Action;
  /** Seed aggiornato del bot. */
  rng: number;
}

export interface Bot {
  name: string;
  choose(view: PlayerView, player: PlayerId, legal: readonly Action[], rng: number): BotDecision;
}
