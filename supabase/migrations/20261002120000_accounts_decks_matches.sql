-- T5.3: profili, mazzi personalizzati e storico delle partite.
-- Applicata dall'integrazione GitHub di Supabase al push su main. Rieseguibile senza danni.
--
-- Chi scrive cosa:
--   profiles  creato dal trigger alla registrazione; l'utente cambia solo il proprio nickname
--   decks     ogni utente gestisce i propri (publishable key + RLS); il server li rivalida prima di usarli
--   matches   solo il server (secret key, scavalca RLS); i partecipanti li leggono

-- Profili --------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 3 and 24),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profili leggibili dagli utenti" on public.profiles;
create policy "profili leggibili dagli utenti" on public.profiles
  for select to authenticated using (true);

drop policy if exists "ognuno cambia il proprio profilo" on public.profiles;
create policy "ognuno cambia il proprio profilo" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;

-- Profilo creato alla registrazione: nickname dalla parte locale dell'email più un suffisso dall'id.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := left(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g'), 16);
begin
  if char_length(base) < 3 then
    base := 'giocatore';
  end if;
  insert into public.profiles (id, nickname)
  values (new.id, base || '-' || left(replace(new.id::text, '-', ''), 6))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mazzi ----------------------------------------------------------------------------------------------

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hero_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  -- { "cardId": copie }, come data/decks.json. La legalità la controllano client e server con validateDeck.
  cards jsonb not null check (jsonb_typeof(cards) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decks_owner_idx on public.decks (owner);

alter table public.decks enable row level security;

drop policy if exists "ognuno gestisce i propri mazzi" on public.decks;
create policy "ognuno gestisce i propri mazzi" on public.decks
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

revoke all on public.decks from anon, authenticated;
grant select, insert, update, delete on public.decks to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists decks_touch_updated_at on public.decks;
create trigger decks_touch_updated_at
  before update on public.decks
  for each row execute function public.touch_updated_at();

-- Partite --------------------------------------------------------------------------------------------

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  -- GameSetup dell'engine (seed + eroi + liste delle carte) e azioni in ordine: replay(setup, actions).
  setup jsonb not null,
  actions jsonb not null,
  result jsonb not null,
  -- DATA_VERSION dell'engine: se le carte cambiano, il replay di una partita vecchia può divergere.
  data_version text not null,
  p1_user uuid references auth.users (id) on delete set null,
  p2_user uuid references auth.users (id) on delete set null,
  winner_user uuid references auth.users (id) on delete set null,
  reason text not null,
  turns integer not null,
  started_at timestamptz not null,
  ended_at timestamptz not null
);

create index if not exists matches_p1_user_idx on public.matches (p1_user, ended_at desc);
create index if not exists matches_p2_user_idx on public.matches (p2_user, ended_at desc);

alter table public.matches enable row level security;

drop policy if exists "i partecipanti vedono le proprie partite" on public.matches;
create policy "i partecipanti vedono le proprie partite" on public.matches
  for select to authenticated
  using ((select auth.uid()) in (p1_user, p2_user));

revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;
