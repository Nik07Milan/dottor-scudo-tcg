// Interfaccia comune di una partita vista dalla plancia: online (Connection, server Colyseus) o locale
// (LocalMatch contro l'IA, TutorialMatch). La BoardScene parla solo con questa interfaccia.

import type { Action } from "@dottorscudo/engine";
import type { ClientAction, ServerMessages } from "../../server/src/protocol";

export type MatchHandlers = { [K in keyof ServerMessages]?: (payload: ServerMessages[K]) => void };

/** Evento della BoardScene a fine coda di animazioni: il replay lo usa per non correre avanti (T5.3). */
export const BOARD_IDLE = "board-idle";

export interface MatchConnection {
  /** Registra i gestori; i messaggi arrivati prima vengono consegnati subito. */
  on(handlers: MatchHandlers): void;
  send(action: ClientAction): void;
  leave(): Promise<void>;
  /** Solo il tutorial: restringe le mosse proposte alla plancia (evidenziazioni e clic). */
  filterLegal?(legal: Action[]): Action[];
}
