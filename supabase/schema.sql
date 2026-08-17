create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (
    char_length(trim(username)) between 2 and 24
    and username ~ '^[[:alnum:] æøåÆØÅ._-]+$'
  ),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(trim(username)));

alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select, insert on public.profiles to authenticated;

create table if not exists public.teacher_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Lærer',
  created_at timestamptz not null default now()
);

alter table public.teacher_users enable row level security;

drop policy if exists "Teachers can verify their own role" on public.teacher_users;
create policy "Teachers can verify their own role"
on public.teacher_users for select to authenticated
using ((select auth.uid()) = id);

revoke all on public.teacher_users from anon, authenticated;
grant select on public.teacher_users to authenticated;

create table if not exists public.results (
  id bigint generated always as identity primary key,
  quiz_id text not null check (char_length(quiz_id) between 1 and 80),
  player_name text not null check (
    char_length(trim(player_name)) between 1 and 24
    and player_name ~ '^[[:alnum:] æøåÆØÅ._-]+$'
  ),
  score integer not null check (score between 0 and 21000),
  correct_answers integer not null check (correct_answers between 0 and 100),
  total_questions integer not null check (total_questions between 1 and 100),
  best_streak integer not null check (best_streak between 0 and 100),
  played_at timestamptz not null default now(),
  constraint valid_answers check (correct_answers <= total_questions and best_streak <= correct_answers)
);

alter table public.results
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.results
alter column user_id set default auth.uid();

create index if not exists results_quiz_score_idx on public.results (quiz_id, score desc);
create index if not exists results_quiz_player_idx on public.results (quiz_id, lower(player_name));
create index if not exists results_user_id_idx on public.results (user_id);

alter table public.results enable row level security;

drop policy if exists "Public can read quiz results" on public.results;
drop policy if exists "Authenticated users can read quiz results" on public.results;
create policy "Authenticated users can read quiz results"
on public.results for select to authenticated using (true);

drop policy if exists "Public can submit valid quiz results" on public.results;
drop policy if exists "Users can submit their own quiz results" on public.results;
create policy "Users can submit their own quiz results"
on public.results for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and player_name = (select username from public.profiles where id = (select auth.uid()))
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and quiz_id = 'den-kalde-krigen'
  and char_length(trim(player_name)) between 1 and 24
  and player_name ~ '^[[:alnum:] æøåÆØÅ._-]+$'
  and score between 0 and 21000
  and correct_answers between 0 and total_questions
  and total_questions = 10
  and best_streak between 0 and correct_answers
  and played_at between now() - interval '10 minutes' and now() + interval '1 minute'
);

revoke all on public.results from anon, authenticated;
grant select, insert on public.results to authenticated;
revoke all on sequence public.results_id_seq from anon, authenticated;
grant usage, select on sequence public.results_id_seq to authenticated;
