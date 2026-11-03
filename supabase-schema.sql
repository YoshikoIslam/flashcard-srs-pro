-- Flashcard SRS Pro: Supabase schema
-- Run the entire script in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.user_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_key text not null,
  deck_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, deck_key)
);

create table if not exists public.user_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_key text not null,
  question text not null,
  answer text not null,
  level integer not null default 0,
  score integer not null default 0,
  next_review date not null default current_date,
  pass_streak integer not null default 0,
  new_consecutive integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_flashcards_streaks_nonnegative check (pass_streak >= 0 and new_consecutive >= 0)
);

create index if not exists user_flashcards_owner_deck_idx
  on public.user_flashcards (user_id, deck_key);

alter table public.user_decks enable row level security;
alter table public.user_flashcards enable row level security;

-- Remove broad default access, then allow signed-in users to operate only on their own rows.
revoke all on table public.user_decks from anon, authenticated;
revoke all on table public.user_flashcards from anon, authenticated;
grant select, insert, update, delete on table public.user_decks to authenticated;
grant select, insert, update, delete on table public.user_flashcards to authenticated;

drop policy if exists "Users manage their own decks" on public.user_decks;
create policy "Users manage their own decks"
  on public.user_decks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own flashcards" on public.user_flashcards;
create policy "Users manage their own flashcards"
  on public.user_flashcards
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
