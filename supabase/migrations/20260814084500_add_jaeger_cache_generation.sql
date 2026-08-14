alter table public.jaeger_api_cache
  add column if not exists generation bigint not null default 0;

create table if not exists public.jaeger_cache_control (
  id smallint primary key,
  generation bigint not null default 0,
  invalidated_at timestamptz not null default now(),
  constraint jaeger_cache_control_singleton check (id = 1),
  constraint jaeger_cache_control_generation_nonnegative check (generation >= 0)
);

insert into public.jaeger_cache_control (id, generation)
values (1, 0)
on conflict (id) do nothing;

alter table public.jaeger_cache_control enable row level security;
alter table public.jaeger_cache_control force row level security;

revoke all on table public.jaeger_cache_control from public, anon, authenticated;
grant select, update on table public.jaeger_cache_control to service_role;

create or replace function public.jaeger_invalidate_api_cache()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_generation bigint;
begin
  update public.jaeger_cache_control
  set generation = generation + 1,
      invalidated_at = now()
  where id = 1
  returning generation into next_generation;

  delete from public.jaeger_api_cache;
  return next_generation;
end;
$$;

revoke all on function public.jaeger_invalidate_api_cache() from public, anon, authenticated;
grant execute on function public.jaeger_invalidate_api_cache() to service_role;

comment on table public.jaeger_cache_control is
  'Generacion que impide reutilizar respuestas iniciadas antes de una escritura financiera.';

