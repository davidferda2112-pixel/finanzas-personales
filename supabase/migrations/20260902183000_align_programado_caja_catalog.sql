-- Align the active savings catalog identity with the name used by the monthly
-- plans. Preserve the stable catalog id and its linked balance item; historical
-- movements and monthly budgets are deliberately left untouched.

do $$
declare
  v_name text;
  v_balance_id text;
begin
  select name, balance_id
    into v_name, v_balance_id
  from jaeger.catalog_items
  where legacy_id = 'CAT-ahorro-programado-caja'
    and kind = 'ahorro'
    and state = 'activo'
  for update;

  if not found then
    raise exception 'No se encontró el ahorro activo CAT-ahorro-programado-caja';
  end if;
  if lower(btrim(v_name)) not in (lower('Ahorro Caja'), lower('Programado Caja')) then
    raise exception 'Nombre inesperado para CAT-ahorro-programado-caja: %', v_name;
  end if;
  if v_balance_id is null or not exists (
    select 1 from jaeger.balance_items
    where balance_id = v_balance_id and balance_type = 'Activo' and active
  ) then
    raise exception 'El ahorro Programado Caja no tiene un activo vigente';
  end if;
  if exists (
    select 1 from jaeger.catalog_items
    where kind = 'ahorro' and state = 'activo'
      and lower(btrim(name)) = lower('Programado Caja')
      and legacy_id <> 'CAT-ahorro-programado-caja'
  ) then
    raise exception 'Ya existe otro ahorro activo llamado Programado Caja';
  end if;

  update jaeger.catalog_items
  set name = 'Programado Caja',
      balance_name = (
        select name from jaeger.balance_items where balance_id = v_balance_id
      )
  where legacy_id = 'CAT-ahorro-programado-caja'
    and name is distinct from 'Programado Caja';
end;
$$;

select public.jaeger_invalidate_api_cache();
