// Account (T5.3): accesso con magic link via email su Supabase, profilo con nickname.
// Il client usa solo la publishable key; le regole RLS del database decidono cosa può leggere e scrivere.
// Senza VITE_SUPABASE_* il gioco funziona da ospite e questo modulo non fa nulla.

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Client Supabase, o null se non configurato. */
export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;

export interface Profile {
  id: string;
  nickname: string;
}

export interface Account {
  session: Session;
  profile: Profile | null;
}

let current: Account | null = null;
const listeners = new Set<(account: Account | null) => void>();

/** Utente collegato in questo momento (null = ospite). */
export const getAccount = (): Account | null => current;

/** Avvisa a ogni accesso o uscita; restituisce la funzione per smettere. */
export function onAccountChange(fn: (account: Account | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function setSession(session: Session | null): Promise<void> {
  current = session ? { session, profile: await loadProfile(session.user.id) } : null;
  for (const fn of listeners) fn(current);
}

async function loadProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase!.from("profiles").select("id, nickname").eq("id", id).maybeSingle();
  return (data as Profile | null) ?? null;
}

// Al ritorno dal link dell'email Supabase legge la sessione dall'URL e la conserva nel browser.
supabase?.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED" && current && session) current = { ...current, session };
  // Fuori dal callback: Supabase sconsiglia altre chiamate al client dentro onAuthStateChange.
  else setTimeout(() => void setSession(session), 0);
});

/** Token di accesso da mandare al server di gioco, o null se ospite. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Stesso vincolo del database (profiles.nickname): 3–24 caratteri. */
export function nicknameError(nickname: string): string | null {
  const n = nickname.trim();
  if (n.length < 3) return "Il nickname deve avere almeno 3 caratteri";
  if (n.length > 24) return "Il nickname può avere al massimo 24 caratteri";
  return null;
}

/** Manda il link di accesso. Restituisce un messaggio d'errore o null. */
export async function sendMagicLink(email: string): Promise<string | null> {
  if (!supabase) return "Account non disponibili";
  if (!isValidEmail(email)) return "Email non valida";
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** Cambia il nickname. Restituisce un messaggio d'errore o null. */
export async function setNickname(nickname: string): Promise<string | null> {
  if (!supabase || !current) return "Accedi per cambiare nickname";
  const invalid = nicknameError(nickname);
  if (invalid) return invalid;
  const { error } = await supabase.from("profiles").update({ nickname: nickname.trim() }).eq("id", current.session.user.id);
  if (error) return error.code === "23505" ? "Nickname già in uso" : error.message;
  await setSession(current.session);
  return null;
}
