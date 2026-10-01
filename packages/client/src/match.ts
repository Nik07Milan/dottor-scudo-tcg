// Interfaccia comune di una partita vista dalla plancia: online (Connection, server Colyseus) o locale
// (LocalMatch contro l'IA, TutorialMatch). La BoardScene parla solo con questa interfaccia.

import type { Action } from "@dottorscudo/engine";
import type { ClientAction, ServerMessages } from "../../server/src/protocol";

export type MatchHandlers = { [K in keyof ServerMessages]?: (payload: ServerMessages[K]) => void };

export interface MatchConnection {
  /** Registra i gestori; i messaggi arrivati prima vengono consegnati subito. */
  on(handlers: MatchHandlers): void;
  send(action: ClientAction): void;
  leave(): Promise<void>;
  /** Solo il tutorial: restringe le mosse proposte alla plancia (evidenziazioni e clic). */
  filterLegal?(legal: Action[]): Action[];
}
