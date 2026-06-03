create extension if not exists pgcrypto;

create table if not exists public.jaeger_app_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'apps_script',
  exported_at timestamptz,
  synced_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.jaeger_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.jaeger_months (
  month_key text primary key,
  name text not null,
  year integer,
  month_index integer,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.jaeger_movements (
  id text primary key,
  month_key text,
  cash_month_key text,
  movement_date date,
  type text,
  category text,
  subcategory text,
  amount numeric,
  balance_after numeric,
  payload jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.jaeger_credit_card_months (
  card_month_key text primary key,
  card_id text not null,
  month_key text not null,
  year integer,
  payload jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.jaeger_credit_card_events (
  id text primary key,
  card_id text,
  month_key text,
  applied_month_key text,
  movement_date date,
  type text,
  amount numeric,
  linked_movement_id text,
  charge_id text,
  payload jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.jaeger_balance_snapshots (
  id text primary key,
  synced_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.jaeger_cashflow_snapshots (
  id text primary key,
  synced_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.jaeger_japan_goal (
  id text primary key,
  synced_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.jaeger_paintings_months (
  month_key text primary key,
  synced_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists jaeger_movements_month_idx on public.jaeger_movements (month_key);
create index if not exists jaeger_movements_cash_month_idx on public.jaeger_movements (cash_month_key);
create index if not exists jaeger_movements_date_idx on public.jaeger_movements (movement_date);
create index if not exists jaeger_card_events_month_idx on public.jaeger_credit_card_events (month_key);
create index if not exists jaeger_card_events_applied_month_idx on public.jaeger_credit_card_events (applied_month_key);
