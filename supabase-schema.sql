-- Executar no Supabase: SQL Editor → New query → Run
-- Tabela de tarefas por dia e por utilizador (login com email)

create table if not exists public.day_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint day_tasks_user_date unique (user_id, date_key)
);

create index if not exists day_tasks_user_id_idx on public.day_tasks (user_id);

alter table public.day_tasks enable row level security;

create policy "day_tasks_select_own"
  on public.day_tasks for select
  using (auth.uid() = user_id);

create policy "day_tasks_insert_own"
  on public.day_tasks for insert
  with check (auth.uid() = user_id);

create policy "day_tasks_update_own"
  on public.day_tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "day_tasks_delete_own"
  on public.day_tasks for delete
  using (auth.uid() = user_id);
