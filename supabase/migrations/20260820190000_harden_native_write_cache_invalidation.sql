-- Every native write, including movement and card deletion, finishes by
-- invalidating the shared API cache. Keep this function guarded by a WHERE
-- clause: the database safety policy rejects unrestricted DELETE statements
-- and would otherwise roll the complete financial transaction back.
--
-- This definition is deliberately idempotent so it also repairs deployments
-- where the prior cache migration was only partially applied.

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

comment on function public.jaeger_invalidate_api_cache() is
  'Invalida la caché por generación sin revertir escrituras financieras por una eliminación sin predicado.';
