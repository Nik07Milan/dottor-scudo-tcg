// Costanti delle regole base (GDD §1). Unica fonte per i numeri: l'engine non usa valori letterali altrove.

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;
export const MAX_LEGENDARY_COPIES = 1;

export const STARTING_HAND_FIRST = 3;
export const STARTING_HAND_SECOND = 4;
/** Carta data al secondo giocatore dopo il mulligan. */
export const COIN_CARD_ID = "caffettino";

export const HERO_MAX_HEALTH = 30;
export const MAX_MANA = 10;
export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const HERO_POWER_COST = 2;

/** Limite di turni totali (45 a testa): poi pareggio. */
export const TURN_LIMIT = 90;
/** Rete di sicurezza contro le catene infinite (GDD §1.5.8). */
export const RESOLUTION_STEP_LIMIT = 200;
/** Carte offerte da Scopri (GDD §3.2). */
export const DISCOVER_OPTIONS = 3;
