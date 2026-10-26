alter table jaeger.goal_asset_allocations add column allocation_mode text not null default 'fixed' check(allocation_mode in ('fixed','full'));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='jaeger.goal_asset_allocations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%allocated_amount%' loop
  execute format('alter table jaeger.goal_asset_allocations drop constraint %I',c.conname);
 end loop;
end $$;
alter table jaeger.goal_asset_allocations add constraint goal_asset_allocations_amount_check check(allocated_amount>=0 and (allocation_mode='full' or allocated_amount>0));
alter table jaeger.japan_budget_items add column active boolean not null default true, add column is_summary boolean not null default false;
update jaeger.japan_budget_items set is_summary=true where name in ('Total','Presupuesto Real','Tramites pre Viaje','Viaje a Japón');
CREATE OR REPLACE FUNCTION public.jaeger_goal_read_source(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_fn <> 'getViajeJapon' then
    raise exception 'Lectura de meta no permitida';
  end if;
  return jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil',
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
      from (
        select id, source_row_number, section, name, budget, actual, remaining, active, is_summary
        from jaeger.japan_budget_items
      ) x
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.asset_name, x.balance_id)
      from (
        select
          a.balance_id,
          b.name as asset_name,
          b.group_name,
          a.allocated_amount, a.allocation_mode,
          b.current_value as asset_value,
          b.active as asset_active,
          case when b.active then case when a.allocation_mode='full' then greatest(b.current_value,0) else least(a.allocated_amount,greatest(b.current_value,0)) end else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.jaeger_configuration_source(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_fn <> 'getConfiguracion' then
    raise exception 'Lectura de configuracion no permitida';
  end if;
  return jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil',
    'activeSource', 'supabase',
    'cards', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.card_code)
      from (
        select card_code, display_name, issuer, last_four, network, card_style,
               active, sort_order, row_version
        from jaeger.credit_cards
      ) x
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.group_name, x.sort_order, x.asset_name)
      from (
        select
          b.balance_id,
          b.name as asset_name,
          b.group_name,
          b.current_value as asset_value,
          b.active as asset_active,
          b.sort_order
        from jaeger.balance_items b
        where b.balance_type = 'Activo'
          and (b.active or exists (
            select 1 from jaeger.goal_asset_allocations a where a.balance_id = b.balance_id
          ))
      ) x
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.balance_id)
      from (
        select
          a.goal_key,
          a.balance_id,
          a.allocated_amount, a.allocation_mode,
          case when b.active then case when a.allocation_mode='full' then greatest(b.current_value,0) else least(a.allocated_amount,greatest(b.current_value,0)) end else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$function$
;

create or replace function public.jaeger_goal_write(p_operation text,p_request_id uuid,p_payload_hash text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jaeger.operation_requests%rowtype; a jaeger.balance_items%rowtype; item jaeger.japan_budget_items%rowtype;
result jsonb; mode text; amount numeric; v_budget numeric; v_actual numeric; code text; item_id bigint; action text; title text; v_section text;
begin
 if p_operation not in ('guardarAsignacionMeta','gestionarItemJapon','actualizarJapon') then raise exception 'Operación de meta no permitida'; end if;
 if p_request_id is null or coalesce(p_payload_hash,'')='' then raise exception 'Solicitud requerida'; end if;
 perform pg_advisory_xact_lock(74123581);
 insert into jaeger.operation_requests(request_id,operation,payload_hash,status) values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
 select * into r from jaeger.operation_requests where request_id=p_request_id for update;
 if r.payload_hash<>p_payload_hash or r.operation<>p_operation then raise exception 'Solicitud reutilizada con datos diferentes'; end if;
 if r.status='completed' then return r.response; end if;
 perform set_config('jaeger.request_id',p_request_id::text,true);
 if p_operation='guardarAsignacionMeta' then
   if coalesce(p_payload->>'meta','japan')<>'japan' then raise exception 'Meta no permitida'; end if;
   code:=btrim(p_payload->>'balanceCodigo');mode:=coalesce(p_payload->>'modo','fixed');
   if mode not in ('fixed','full') then raise exception 'Modo inválido'; end if;
   amount:=replace(coalesce(nullif(p_payload->>'monto',''),'0'),',','.')::numeric;
   if amount::text in ('NaN','Infinity','-Infinity') or amount<0 or amount<>round(amount,2) then raise exception 'Importe inválido'; end if;
   if coalesce((p_payload->>'eliminar')::boolean,false) or (mode='fixed' and amount=0) then
     delete from jaeger.goal_asset_allocations where goal_key='japan' and balance_id=code;
   else
     select * into a from jaeger.balance_items where balance_id=code and balance_type='Activo' and active for update;
     if not found or code='10101.05' then raise exception 'Selecciona un activo vigente del balance'; end if;
     if mode='fixed' and amount>a.current_value then raise exception 'La asignación supera el activo'; end if;
     insert into jaeger.goal_asset_allocations(goal_key,balance_id,allocated_amount,allocation_mode,request_id)
     values('japan',code,case when mode='full' then 0 else amount end,mode,p_request_id)
     on conflict(goal_key,balance_id) do update set allocated_amount=excluded.allocated_amount,allocation_mode=excluded.allocation_mode,request_id=excluded.request_id;
   end if;
   result:=jsonb_build_object('ok',true,'balanceCodigo',code);
 else
   item_id:=nullif(p_payload->>'id','')::bigint;action:=coalesce(p_payload->>'accion','guardar');
   if p_operation='actualizarJapon' and item_id is null then
     select id into item_id from jaeger.japan_budget_items where active and not is_summary and name=p_payload->>'item' order by id limit 1;
     if item_id is null then raise exception 'Partida no encontrada'; end if;
   end if;
   if item_id is not null then
     select * into item from jaeger.japan_budget_items where id=item_id and active and not is_summary for update;
     if not found then raise exception 'Partida no encontrada'; end if;
   end if;
   if action='eliminar' then
     if item_id is null then raise exception 'Selecciona una partida'; end if;
     update jaeger.japan_budget_items set active=false,request_id=p_request_id where id=item_id;
   elsif action='guardar' then
     title:=btrim(coalesce(p_payload->>'nombre',item.name));v_section:=coalesce(p_payload->>'seccion',item.section);
     v_budget:=replace(coalesce(p_payload->>'presupuesto',item.budget::text,'0'),',','.')::numeric;
     v_actual:=replace(coalesce(p_payload->>'actual',p_payload->>'monto',item.actual::text,'0'),',','.')::numeric;
     if coalesce(title,'')='' or length(title)>120 or coalesce(v_section,'') not in ('viaje','tramites') then raise exception 'Nombre y sección requeridos'; end if;
     if v_budget::text in ('NaN','Infinity','-Infinity') or v_actual::text in ('NaN','Infinity','-Infinity') or v_budget<0 or v_actual<0 or v_budget<>round(v_budget,2) or v_actual<>round(v_actual,2) then raise exception 'Importes inválidos'; end if;
     if item_id is null then
       insert into jaeger.japan_budget_items(source_row_number,section,name,budget,actual,remaining,source_kind,request_id)
       values((select coalesce(max(source_row_number),0)+1 from jaeger.japan_budget_items),v_section,title,v_budget,v_actual,v_budget-v_actual,'supabase',p_request_id) returning id into item_id;
     else
       update jaeger.japan_budget_items set name=title,section=v_section,budget=v_budget,actual=v_actual,remaining=v_budget-v_actual,request_id=p_request_id,source_kind='supabase' where id=item_id;
     end if;
   else raise exception 'Acción no permitida'; end if;
   result:=jsonb_build_object('ok',true,'id',item_id);
 end if;
 update jaeger.operation_requests set status='completed',response=result,completed_at=now(),updated_at=now() where request_id=p_request_id;
 perform public.jaeger_invalidate_api_cache();
 return result;
end $$;
revoke all on function public.jaeger_goal_write(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.jaeger_goal_write(text,uuid,text,jsonb) to service_role;
select public.jaeger_invalidate_api_cache();

