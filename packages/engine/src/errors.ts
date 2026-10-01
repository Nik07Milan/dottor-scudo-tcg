// Errore lanciato da applyAction per un'azione non legale (T1.5). Il codice è per il programma,
// il messaggio (in italiano) per il giocatore.

export type IllegalActionCode =
  /** Non è un'azione: tipo mancante, giocatore inesistente, campi del tipo sbagliato. */
  | "malformed"
  | "unknown_action"
  | "game_over"
  | "wrong_phase"
  | "not_your_turn"
  | "already_done"
  | "card_not_in_hand"
  | "duplicate_card"
  | "pending_choice"
  | "not_enough_mana"
  | "board_full"
  /** Servitore senza posizione o fuori da 0..n, oppure posizione data a una carta che non è un servitore. */
  | "invalid_position"
  /** Tipo di azione previsto ma non ancora implementato nell'engine. */
  | "not_implemented"
  /** Ben formata ma non tra le mosse legali, senza un motivo più preciso. */
  | "not_legal";

export class IllegalActionError extends Error {
  constructor(
    readonly code: IllegalActionCode,
    message: string,
  ) {
    super(message);
    this.name = "IllegalActionError";
  }
}
