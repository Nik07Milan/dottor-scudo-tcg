// Storico partite (T5.3): dai dati salvati alle righe della lista. Puro, testato senza Supabase.

import { DATA_VERSION, HEROES_BY_ID, type GameResult, type PlayerId } from "@dottorscudo/engine";

/** Una partita come arriva dalla tabella matches (senza le azioni, caricate solo per il replay). */
export interface MatchSummaryRow {
  id: string;
  heroes: [string, string];
  result: GameResult;
  dataVersion: string;
  users: Record<PlayerId, string | null>;
  turns: number;
  endedAt: string;
}

export interface MatchLine {
  id: string;
  /** Il mio posto al tavolo: il replay si guarda da qui. */
  viewer: PlayerId;
  myHero: string;
  foeHero: string;
  /** Id dell'avversario (null = ospite). */
  foeUser: string | null;
  outcome: "Vittoria" | "Sconfitta" | "Pareggio";
  reason: string;
  turns: number;
  endedAt: string;
  /** Le carte sono cambiate dopo la partita: il replay potrebbe non riuscire. */
  outdated: boolean;
}

const REASONS: Record<GameResult["reason"], string> = {
  hero_defeated: "ferie a zero",
  concede: "resa o abbandono",
  turn_limit: "limite di turni",
  resolution_limit: "partita bloccata",
};

const heroName = (id: string) => HEROES_BY_ID.get(id)?.name ?? id;

export function matchLine(row: MatchSummaryRow, me: string): MatchLine {
  const viewer: PlayerId = row.users.p1 === me ? "p1" : "p2";
  const foe: PlayerId = viewer === "p1" ? "p2" : "p1";
  const winner = row.result.winner;
  return {
    id: row.id,
    viewer,
    myHero: heroName(row.heroes[viewer === "p1" ? 0 : 1]),
    foeHero: heroName(row.heroes[viewer === "p1" ? 1 : 0]),
    foeUser: row.users[foe],
    outcome: winner === null ? "Pareggio" : winner === viewer ? "Vittoria" : "Sconfitta",
    reason: REASONS[row.result.reason] ?? row.result.reason,
    turns: row.turns,
    endedAt: row.endedAt,
    outdated: row.dataVersion !== DATA_VERSION,
  };
}

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
