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

create index if not exists results_quiz_score_idx on public.results (quiz_id, score desc);
create index if not exists results_quiz_player_idx on public.results (quiz_id, lower(player_name));

alter table public.results enable row level security;

drop policy if exists "Public can read quiz results" on public.results;
create policy "Public can read quiz results"
on public.results for select to anon using (true);

drop policy if exists "Public can submit valid quiz results" on public.results;
create policy "Public can submit valid quiz results"
on public.results for insert to anon
with check (
  quiz_id = 'den-kalde-krigen'
  and char_length(trim(player_name)) between 1 and 24
  and player_name ~ '^[[:alnum:] æøåÆØÅ._-]+$'
  and score between 0 and 21000
  and correct_answers between 0 and total_questions
  and total_questions = 10
  and best_streak between 0 and correct_answers
  and played_at between now() - interval '10 minutes' and now() + interval '1 minute'
);

revoke all on public.results from anon, authenticated;
grant select, insert on public.results to anon;
revoke all on sequence public.results_id_seq from anon, authenticated;
grant usage, select on sequence public.results_id_seq to anon;
