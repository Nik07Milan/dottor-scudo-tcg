// Tema "ufficio" (T4.6): scrivanie di legno, fogli, timbri. Solo costanti di presentazione.

export const WIDTH = 1280;
export const HEIGHT = 720;

export const FONT = "'Trebuchet MS', 'Segoe UI', sans-serif";

export const COLORS = {
  background: 0x2b2f3a,
  desk: 0x6b4a2f,
  deskEdge: 0x4a3220,
  paper: 0xf4eedc,
  ink: 0x22262f,
  text: "#f4eedc",
  textDark: "#22262f",
  muted: "#a9b0bf",
  highlight: 0x7cf27a,
  target: 0xffb347,
  danger: 0xe05a47,
  heal: 0x5ad17a,
  mana: 0x3f8fe0,
  attack: 0xf2c14e,
  health: 0xd9534f,
  armor: 0x9aa4b2,
  frozen: 0x8fd3ff,
  shield: 0xffe27a,
};

/** Cornice delle carte per fazione. */
export const FACTION_COLORS: Record<string, number> = {
  ufficio: 0x2f6fb5,
  soci: 0xa8323e,
  neutrale: 0x6f7480,
};

/** Gemma della rarità. */
export const RARITY_COLORS: Record<string, number> = {
  common: 0xdcdcdc,
  rare: 0x3f8fe0,
  epic: 0xa65de0,
  legendary: 0xf2a33a,
  token: 0x8a8f99,
};

export const DURATION = {
  /** Durata base delle animazioni guidate dagli eventi (ms). */
  step: 260,
  banner: 900,
};
