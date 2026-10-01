// Errore lanciato da applyAction per un'azione non legale. In T1.5 i codici si allineano a getLegalActions.

export type IllegalActionCode =
  | "game_over"
  | "wrong_phase"
  | "not_your_turn"
  | "already_done"
  | "card_not_in_hand"
  | "duplicate_card"
  | "pending_choice"
  | "not_implemented";

export class IllegalActionError extends Error {
  constructor(
    readonly code: IllegalActionCode,
    message: string,
  ) {
    super(message);
    this.name = "IllegalActionError";
  }
}
