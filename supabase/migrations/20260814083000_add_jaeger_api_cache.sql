create table if not exists public.jaeger_api_cache (
  cache_key text primary key,
  fn text not null,
  args jsonb not null default '[]'::jsonb,
  response jsonb not null,
  response_hash text not null,
  source_refreshed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jaeger_api_cache_args_array check (jsonb_typeof(args) = 'array'),
  constraint jaeger_api_cache_response_object check (jsonb_typeof(response) = 'object')
);

alter table public.jaeger_api_cache enable row level security;
alter table public.jaeger_api_cache force row level security;

revoke all on table public.jaeger_api_cache from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.jaeger_api_cache to service_role;

create index if not exists jaeger_api_cache_expires_at_idx
  on public.jaeger_api_cache (expires_at);

comment on table public.jaeger_api_cache is
  'Copia transitoria de respuestas calculadas por Google Sheets. No es la fuente financiera de verdad.';
