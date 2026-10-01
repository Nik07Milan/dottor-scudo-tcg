// Parametri del server (GDD §1 e §7).

/** Durata di un turno: allo scadere il turno finisce da solo. */
export const TURN_SECONDS = 75;
/** Durata del mulligan: allo scadere chi non ha scelto tiene la mano. */
export const MULLIGAN_SECONDS = 45;
/** Finestra di riconnessione dopo una disconnessione: un turno intero. Poi è abbandono. */
export const RECONNECT_SECONDS = TURN_SECONDS;
/** Porta di default. */
export const DEFAULT_PORT = 2567;
