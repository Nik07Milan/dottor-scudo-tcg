// Store su Supabase (T5.3). Usa la secret key: scavalca le regole RLS, quindi vive solo nel server
// e la chiave non deve mai arrivare al client. Schema in supabase/migrations/.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchRecord, SavedDeck, Store } from "./store";

export class SupabaseStore implements Store {
  private readonly db: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async verifyUser(token: string): Promise<string | null> {
    // Chiede al server Auth: un token scaduto o revocato viene rifiutato anche se la firma è valida.
    const { data, error } = await this.db.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  }

  async loadDeck(userId: string, deckId: string): Promise<SavedDeck | null> {
    const { data, error } = await this.db.from("decks").select("hero_id, cards").eq("id", deckId).eq("owner", userId).maybeSingle();
    if (error) throw new Error(`lettura del mazzo fallita: ${error.message}`);
    return data ? { heroId: data.hero_id as string, cards: data.cards as Record<string, number> } : null;
  }

  async saveMatch(r: MatchRecord): Promise<void> {
    const winner = r.result.winner;
    const { error } = await this.db.from("matches").insert({
      code: r.code,
      setup: r.setup,
      actions: r.actions,
      result: r.result,
      data_version: r.dataVersion,
      p1_user: r.users.p1,
      p2_user: r.users.p2,
      winner_user: winner ? r.users[winner] : null,
      reason: r.result.reason,
      turns: r.turns,
      started_at: new Date(r.startedAt).toISOString(),
      ended_at: new Date(r.endedAt).toISOString(),
    });
    if (error) throw new Error(`salvataggio della partita fallito: ${error.message}`);
  }
}

/** Store dalle variabili d'ambiente, o null se mancano (server senza persistenza). */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  return url && key ? new SupabaseStore(url, key) : null;
}
