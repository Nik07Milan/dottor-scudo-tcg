/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** Supabase (T5.3): senza queste due variabili niente account, mazzi salvati e storico. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable key: pubblica per costruzione, protetta dalle regole RLS. Mai la secret key qui. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
