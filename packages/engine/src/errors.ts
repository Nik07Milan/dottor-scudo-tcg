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
  /** L'attaccante non esiste o non è un tuo personaggio. */
  | "invalid_attacker"
  /** Esiste ma ora non può attaccare: appena entrato, 0 attacco, ha già attaccato, eroe senza Strumento. */
  | "cannot_attack"
  /** Il difensore non esiste o non è un personaggio nemico attaccabile. */
  | "invalid_target"
  /** C'è una Burocrazia nemica: va attaccata prima lei. */
  | "taunt_required"
  /** C'è già una Task attiva: non se ne gioca un'altra. */
  | "task_active"
  /** `choose` senza nessuna scelta in sospeso. */
  | "no_pending_choice"
  /** Indice fuori dalle opzioni offerte. */
  | "invalid_choice"
  /** Potere eroe già usato in questo turno. */
  | "hero_power_used"
  /** Opzione del potere eroe mancante o inesistente. */
  | "invalid_option"
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
