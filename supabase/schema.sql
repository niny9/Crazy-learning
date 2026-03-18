create extension if not exists pgcrypto;

create table if not exists public.learning_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('vocab', 'sentence', 'diary', 'writing_entry')),
  item_id text not null,
  language text,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, item_type, item_id)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists learning_items_set_updated_at on public.learning_items;
create trigger learning_items_set_updated_at
before update on public.learning_items
for each row
execute procedure public.set_updated_at();

alter table public.learning_items enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "Users can manage their own learning items" on public.learning_items;
create policy "Users can manage their own learning items"
on public.learning_items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own usage events" on public.usage_events;
create policy "Users can manage their own usage events"
on public.usage_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
