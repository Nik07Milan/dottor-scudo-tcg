// Storico partite su Supabase (T5.3). Le regole RLS fanno vedere a ognuno solo le partite in cui ha giocato;
// le scrive solo il server.

import type { Action, GameSetup } from "@dottorscudo/engine";
import { supabase } from "../account";
import type { MatchSummaryRow } from "./model";

export const PAGE_SIZE = 15;

interface Row {
  id: string;
  setup: GameSetup;
  result: MatchSummaryRow["result"];
  data_version: string;
  p1_user: string | null;
  p2_user: string | null;
  turns: number;
  ended_at: string;
}

/** Una pagina delle mie partite, dalla più recente. */
export async function listMatches(page: number): Promise<MatchSummaryRow[]> {
  if (!supabase) return [];
  const from = page * PAGE_SIZE;
  const { data, error } = await supabase
    .from("matches")
    .select("id, setup, result, data_version, p1_user, p2_user, turns, ended_at")
    .order("ended_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return (data as Row[]).map((r) => ({
    id: r.id,
    heroes: [r.setup.players[0].heroId, r.setup.players[1].heroId],
    result: r.result,
    dataVersion: r.data_version,
    users: { p1: r.p1_user, p2: r.p2_user },
    turns: r.turns,
    endedAt: r.ended_at,
  }));
}

/** Setup e azioni di una partita, per il replay. */
export async function loadMatch(id: string): Promise<{ setup: GameSetup; actions: Action[] }> {
  if (!supabase) throw new Error("Account non disponibili");
  const { data, error } = await supabase.from("matches").select("setup, actions").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as { setup: GameSetup; actions: Action[] };
}

/** Nickname degli utenti indicati. */
export async function nicknames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!supabase || unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, nickname").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map((data as { id: string; nickname: string }[]).map((p) => [p.id, p.nickname]));
}
