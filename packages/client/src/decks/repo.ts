// Mazzi salvati su Supabase (T5.3). Le regole RLS fanno vedere e modificare a ognuno solo i propri;
// il server li rivalida comunque prima di usarli in partita.

import { supabase } from "../account";
import type { DeckDraft } from "./model";

export interface SavedDeck extends Required<DeckDraft> {
  updatedAt: string;
}

interface Row {
  id: string;
  hero_id: string;
  name: string;
  cards: Record<string, number>;
  updated_at: string;
}

const fromRow = (r: Row): SavedDeck => ({ id: r.id, heroId: r.hero_id, name: r.name, cards: r.cards, updatedAt: r.updated_at });

/** I mazzi dell'utente collegato, dal più recente. */
export async function listDecks(): Promise<SavedDeck[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("decks").select("id, hero_id, name, cards, updated_at").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

/** Crea o aggiorna il mazzo; restituisce quello salvato. */
export async function saveDeck(draft: DeckDraft): Promise<SavedDeck> {
  if (!supabase) throw new Error("Account non disponibili");
  const fields = { hero_id: draft.heroId, name: draft.name.trim() || "Senza nome", cards: draft.cards };
  const query = draft.id ? supabase.from("decks").update(fields).eq("id", draft.id) : supabase.from("decks").insert(fields);
  const { data, error } = await query.select("id, hero_id, name, cards, updated_at").single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function deleteDeck(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("decks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
