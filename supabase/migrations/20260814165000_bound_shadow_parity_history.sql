create or replace function jaeger.prune_read_parity_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.check_id % 100 = 0 then
    delete from public.jaeger_read_parity_checks
    where created_at < now() - interval '30 days'
       or check_id not in (
         select check_id
         from public.jaeger_read_parity_checks
         order by check_id desc
         limit 5000
       );
  end if;
  return new;
end;
$$;

revoke all on function jaeger.prune_read_parity_history() from public, anon, authenticated;

drop trigger if exists jaeger_prune_read_parity_history
  on public.jaeger_read_parity_checks;

create trigger jaeger_prune_read_parity_history
after insert on public.jaeger_read_parity_checks
for each row execute function jaeger.prune_read_parity_history();

comment on function jaeger.prune_read_parity_history() is
  'Mantiene como maximo 5000 comparaciones y 30 dias de historial para controlar almacenamiento.';
