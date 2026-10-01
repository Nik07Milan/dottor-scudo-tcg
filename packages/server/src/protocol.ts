// Messaggi tra client e server (T3.3). Il client importa questi tipi per parlare con la stanza `game`.

import type { Action, GameEvent, PlayerId, PlayerView } from "@dottorscudo/engine";

/** Nome della stanza Colyseus. */
export const ROOM_NAME = "game";

/** Opzioni di create/joinById. Il mazzo è quello precostruito dell'eroe. */
export interface JoinOptions {
  heroId: string;
}

/** Client → server. `player` viene ignorato: lo decide il server dalla connessione. */
export type ClientAction = Action extends infer A ? (A extends { player: PlayerId } ? Omit<A, "player"> & { player?: PlayerId } : never) : never;

export interface ClientMessages {
  action: ClientAction;
}

/** Server → client. */
export interface ServerMessages {
  /** Seduto al tavolo con questo id giocatore. */
  joined: { player: PlayerId; code: string };
  /** In attesa dell'avversario: condividi il codice. */
  waiting: { code: string };
  /**
   * Nuovo stato visto da te + eventi dell'ultima azione. `deadline`: scadenza del turno (ms epoch).
   * `actor`: chi ha causato l'aggiornamento (null all'avvio e alla riconnessione). Un client con un'azione
   * in volo aspetta l'update con `actor` uguale a sé (o un `error`) prima di decidere di nuovo.
   */
  update: {
    view: PlayerView;
    events: GameEvent[];
    deadline: number | null;
    actor: PlayerId | null;
    /** Solo nel tutorial (client): suggerimento da mostrare al giocatore. Il server non lo invia. */
    hint?: string;
  };
  /** Azione rifiutata. */
  error: { code: string; message: string };
  /** L'avversario si è disconnesso o è tornato. */
  opponent: { connected: boolean };
}
