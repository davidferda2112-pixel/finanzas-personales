-- Invalidate by generation first, then remove only obsolete cache entries.
-- The explicit predicate is required by the database safety guard and keeps
-- financial writes from being rolled back during cache cleanup.
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

  delete from public.jaeger_api_cache
  where generation < next_generation;

  return next_generation;
end;
$$;

revoke all on function public.jaeger_invalidate_api_cache() from public, anon, authenticated;
grant execute on function public.jaeger_invalidate_api_cache() to service_role;
