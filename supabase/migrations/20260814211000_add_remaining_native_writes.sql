-- Remaining Jaeger Spend writes. Every call is one PostgreSQL transaction and
-- is protected by the same request-id/payload-hash idempotency ledger used by
-- movements and card events.

create or replace function public.jaeger_write_extended(
  p_operation text,p_request_id uuid,p_payload_hash text,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'moverBalanceItemOrden','repararCatalogoFinanciero','congelarBalanceGeneral',
    'guardarBalanceGrupo','renombrarBalanceGrupo','ordenarBalanceGrupos',
    'limpiarPinturasMes','actualizarBalance','guardarBalanceItem','eliminarBalanceItem',
    'actualizarJapon','guardarPinturasMes','gestionarItemCategoria','marcarNotifLeida',
    'crearMesNuevo','registrarDiferidoTdc','liquidarDiferidoTdc'
  ];
  v_existing jaeger.operation_requests%rowtype;
  v_result jsonb := jsonb_build_object('ok',true);
  v_item jaeger.balance_items%rowtype;
  v_other record;
  v_installment jaeger.card_installments%rowtype;
  v_id text;
  v_name text;
  v_old_name text;
  v_type text;
  v_group text;
  v_month text;
  v_base_month text;
  v_card text;
  v_action text;
  v_section text;
  v_state text;
  v_balance_id text;
  v_asset_id text;
  v_movement_id text;
  v_note text;
  v_value numeric;
  v_budget numeric;
  v_amount numeric;
  v_total numeric;
  v_cash_amount numeric;
  v_asset_amount numeric;
  v_remaining numeric;
  v_installment_amount numeric;
  v_sold numeric;
  v_opening numeric;
  v_added numeric;
  v_current numeric;
  v_self numeric;
  v_discount numeric;
  v_order integer;
  v_index integer;
  v_date date;
  v_month_date date;
  v_base_date date;
  v_plan_id bigint;
  v_new_balance boolean := false;
  v_payload2 jsonb;
  v_groups jsonb;
  v_group_name text;
begin
  if not (p_operation=any(v_allowed)) then
    raise exception 'Escritura nativa extendida no implementada: %',p_operation;
  end if;
  if p_request_id is null or btrim(coalesce(p_payload_hash,''))='' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then
    raise exception 'Carga de escritura inválida';
  end if;

  insert into jaeger.operation_requests(request_id,operation,payload_hash,status)
  values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
  select * into v_existing from jaeger.operation_requests where request_id=p_request_id for update;
  if v_existing.operation<>p_operation or v_existing.payload_hash<>p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operación';
  end if;
  if v_existing.status='completed' then return v_existing.response; end if;
  perform set_config('jaeger.request_id',p_request_id::text,true);

  if p_operation in ('actualizarBalance','guardarBalanceItem') and
     (p_operation='actualizarBalance' or nullif(btrim(coalesce(p_payload->>'codigo','')),'') is not null) then
    v_id:=nullif(btrim(coalesce(p_payload->>'codigo','')),'');
    select * into v_item from jaeger.balance_items where balance_id=v_id and active for update;
    if not found then raise exception 'Item de balance no encontrado'; end if;
    v_value:=greatest(replace(btrim(coalesce(p_payload->>'valor','0')),',','.')::numeric,0);
    v_name:=coalesce(nullif(btrim(p_payload->>'nombre'),''),v_item.name);
    v_group:=coalesce(nullif(btrim(p_payload->>'grupo'),''),v_item.group_name,
      case when v_item.balance_type='Pasivo' then 'Préstamos' else 'Activos Financieros' end);
    update jaeger.balance_items set name=v_name,base_value=v_value,adjustment_delta=0,current_value=v_value,
      group_name=v_group,note=nullif(btrim(coalesce(p_payload->>'nota','')),''),source_kind='supabase',request_id=p_request_id
    where balance_id=v_id;
    perform jaeger_private.record_balance_change(v_id,v_name,v_item.balance_type,'ajuste manual',
      v_item.current_value,v_value,p_payload->>'nota',p_request_id);
    v_result:=jsonb_build_object('ok',true,'codigo',v_id);

  elsif p_operation='guardarBalanceItem' then
    v_type:=case when lower(btrim(coalesce(p_payload->>'tipo',p_payload->>'operacion','Activo'))) like 'pas%' then 'Pasivo' else 'Activo' end;
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    v_value:=greatest(replace(btrim(coalesce(p_payload->>'valor','0')),',','.')::numeric,0);
    v_group:=coalesce(nullif(btrim(p_payload->>'grupo'),''),case when v_type='Pasivo' then 'Préstamos' else 'Activos Financieros' end);
    v_id:=jaeger_private.new_balance_item(v_type,v_name,v_value,v_group,p_payload->>'nota',p_request_id);
    perform jaeger_private.record_balance_change(v_id,v_name,v_type,'crear',0,v_value,p_payload->>'nota',p_request_id);
    v_result:=jsonb_build_object('ok',true,'codigo',v_id);

  elsif p_operation='eliminarBalanceItem' then
    v_id:=nullif(btrim(coalesce(p_payload->>'codigo','')),'');
    select * into v_item from jaeger.balance_items where balance_id=v_id and active for update;
    if not found then raise exception 'Código de balance no encontrado'; end if;
    update jaeger.balance_items set active=false,note=nullif(btrim(coalesce(p_payload->>'nota','')),''),request_id=p_request_id
    where balance_id=v_id;
    update jaeger.catalog_items set state='inactivo',request_id=p_request_id where balance_id=v_id and state='activo';
    perform jaeger_private.record_balance_change(v_id,v_item.name,v_item.balance_type,'eliminar',
      v_item.current_value,0,p_payload->>'nota',p_request_id);

  elsif p_operation='moverBalanceItemOrden' then
    v_id:=nullif(btrim(coalesce(p_payload->>'codigo','')),'');
    select * into v_item from jaeger.balance_items where balance_id=v_id and active for update;
    if not found then raise exception 'Item de balance no encontrado'; end if;
    v_index:=case when coalesce((p_payload->>'dir')::integer,0)>=0 then 1 else -1 end;
    with ordered as (
      select bi.*,row_number() over(order by bg.sort_order,bi.sort_order,coalesce(bi.source_row_number,2147483647),bi.name) rn
      from jaeger.balance_items bi join jaeger.balance_groups bg
        on bg.balance_type=bi.balance_type and bg.name=bi.group_name and bg.active
      where bi.balance_type=v_item.balance_type and bi.active
    ), current_row as (select rn from ordered where balance_id=v_id)
    select o.* into v_other from ordered o,current_row c where o.rn=c.rn+v_index;
    if found then
      update jaeger.balance_items set group_name=v_other.group_name,sort_order=v_other.sort_order,request_id=p_request_id where balance_id=v_id;
      update jaeger.balance_items set group_name=v_item.group_name,sort_order=v_item.sort_order,request_id=p_request_id where balance_id=v_other.balance_id;
      perform jaeger_private.record_balance_change(v_id,v_item.name,v_item.balance_type,'ordenar',0,0,'',p_request_id);
    end if;

  elsif p_operation='guardarBalanceGrupo' then
    v_type:=case when lower(btrim(coalesce(p_payload->>'tipo','Activo'))) like 'pas%' then 'Pasivo' else 'Activo' end;
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    if v_name='' then raise exception 'Escribe el nombre del grupo'; end if;
    select name into v_old_name from jaeger.balance_groups where balance_type=v_type and lower(name)=lower(v_name) limit 1 for update;
    if found then
      update jaeger.balance_groups set active=true,request_id=p_request_id where balance_type=v_type and name=v_old_name;
    else
      insert into jaeger.balance_groups(balance_type,name,sort_order,active,source_kind,request_id,source_row_number)
      values(v_type,v_name,(select coalesce(max(sort_order),0)+1 from jaeger.balance_groups where balance_type=v_type),
        true,'supabase',p_request_id,(select coalesce(max(source_row_number),0)+1 from jaeger.balance_groups));
    end if;

  elsif p_operation='renombrarBalanceGrupo' then
    v_type:=case when lower(btrim(coalesce(p_payload->>'tipo','Activo'))) like 'pas%' then 'Pasivo' else 'Activo' end;
    v_old_name:=btrim(coalesce(p_payload->>'oldNombre',''));
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    if v_old_name='' or v_name='' then raise exception 'Selecciona grupo y escribe nombre'; end if;
    select * into v_item from jaeger.balance_items where false;
    insert into jaeger.balance_groups(balance_type,name,sort_order,active,source_kind,request_id,source_row_number)
    select balance_type,v_name,sort_order,active,'supabase',p_request_id,source_row_number
    from jaeger.balance_groups where balance_type=v_type and name=v_old_name
    on conflict(balance_type,name) do update set active=true,request_id=excluded.request_id;
    if not found then raise exception 'Grupo no encontrado'; end if;
    update jaeger.balance_items set group_name=v_name,request_id=p_request_id where balance_type=v_type and group_name=v_old_name;
    update jaeger.catalog_items set group_name=v_name,request_id=p_request_id where balance_type=v_type and group_name=v_old_name;
    delete from jaeger.balance_groups where balance_type=v_type and name=v_old_name and name<>v_name;

  elsif p_operation='ordenarBalanceGrupos' then
    v_type:=case when lower(btrim(coalesce(p_payload->>'tipo','Activo'))) like 'pas%' then 'Pasivo' else 'Activo' end;
    v_groups:=coalesce(p_payload->'grupos','[]'::jsonb);
    if jsonb_typeof(v_groups)<>'array' then raise exception 'Orden de grupos inválido'; end if;
    for v_group_name,v_order in select value,ordinality::integer from jsonb_array_elements_text(v_groups) with ordinality loop
      update jaeger.balance_groups set sort_order=v_order,request_id=p_request_id
      where balance_type=v_type and name=v_group_name;
    end loop;

  elsif p_operation in ('congelarBalanceGeneral','repararCatalogoFinanciero') then
    -- Imported formulas are already materialized values in Postgres. Repair is
    -- intentionally validation-only after the source-of-truth cutover.
    v_result:=jsonb_build_object('ok',true,'validated',true);

  elsif p_operation='actualizarJapon' then
    v_name:=btrim(coalesce(p_payload->>'item',''));
    v_value:=greatest(replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric,0);
    update jaeger.japan_budget_items set actual=v_value,remaining=budget-v_value,
      source_kind='supabase',request_id=p_request_id where name=v_name;
    if not found then raise exception 'Ítem de Japón no encontrado'; end if;
    select coalesce(sum(actual),0) into v_total from jaeger.japan_budget_items
      where section='viaje' and name not in ('Total','Presupuesto Real');
    update jaeger.japan_budget_items set actual=v_total,remaining=budget-v_total,
      source_kind='supabase',request_id=p_request_id
      where section='tramites' and name='Viaje a Japón';

  elsif p_operation in ('guardarPinturasMes','limpiarPinturasMes') then
    v_month:=jaeger_private.normalize_month(coalesce(p_payload->>'mes',p_payload->>'id'));
    perform jaeger_private.ensure_month(v_month);
    if p_operation='limpiarPinturasMes' then
      v_opening:=0;v_added:=0;v_current:=0;v_self:=0;v_discount:=0;
    else
      v_opening:=greatest(replace(btrim(coalesce(p_payload->>'stockInicial','0')),',','.')::numeric,0);
      v_added:=greatest(replace(btrim(coalesce(p_payload->>'stockAgregado','0')),',','.')::numeric,0);
      v_current:=greatest(replace(btrim(coalesce(p_payload->>'stockActual','0')),',','.')::numeric,0);
      v_self:=greatest(replace(btrim(coalesce(p_payload->>'autoconsumo','0')),',','.')::numeric,0);
      v_discount:=greatest(replace(btrim(coalesce(p_payload->>'descuento','0')),',','.')::numeric,0);
      v_sold:=greatest(v_opening+v_added-v_current,0);
      if v_self+v_discount>v_sold then
        raise exception 'Autoconsumo y descuento no pueden superar las pinturas vendidas';
      end if;
      if not coalesce((p_payload->>'confirmReset')::boolean,false) and
         v_opening=0 and v_added=0 and v_current=0 and v_self=0 and v_discount=0 and
         exists(select 1 from jaeger.paintings_months where month_key=v_month and
           (opening_stock<>0 or added_stock<>0 or current_stock<>0 or self_consumption<>0 or discounted<>0)) then
        raise exception 'Para borrar pinturas usa el botón Limpiar mes';
      end if;
    end if;
    insert into jaeger.paintings_months(month_key,opening_stock,added_stock,current_stock,self_consumption,discounted,
      updated_at,source_kind,request_id,source_row_number)
    values(v_month,v_opening,v_added,v_current,v_self,v_discount,
      to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),'supabase',p_request_id,
      (select coalesce(max(source_row_number),0)+1 from jaeger.paintings_months))
    on conflict(month_key) do update set opening_stock=excluded.opening_stock,added_stock=excluded.added_stock,
      current_stock=excluded.current_stock,self_consumption=excluded.self_consumption,discounted=excluded.discounted,
      updated_at=excluded.updated_at,source_kind='supabase',request_id=p_request_id,row_version=jaeger.paintings_months.row_version+1;
    v_result:=jsonb_build_object('ok',true,'mes',v_month);

  elsif p_operation='marcarNotifLeida' then
    update jaeger.notifications set read_at=now() where notification_id=(p_payload->>'id')::bigint;

  elsif p_operation='crearMesNuevo' then
    v_month:=jaeger_private.normalize_month(coalesce(p_payload->>'nombre',p_payload->>'id'));
    v_month_date:=jaeger_private.month_start(v_month);
    if exists(select 1 from jaeger.monthly_plan_items where month_key=v_month) then
      v_result:=jsonb_build_object('ok',true,'msg','Ya existe','mes',v_month);
    else
      select m.month_key,m.starts_on into v_base_month,v_base_date from jaeger.months m
      where exists(select 1 from jaeger.monthly_plan_items p where p.month_key=m.month_key)
        and m.starts_on<v_month_date order by m.starts_on desc limit 1;
      if v_base_month is null then
        select m.month_key,m.starts_on into v_base_month,v_base_date from jaeger.months m
        where exists(select 1 from jaeger.monthly_plan_items p where p.month_key=m.month_key)
        order by m.starts_on desc limit 1;
      end if;
      if v_base_month is null then raise exception 'No hay mes base'; end if;
      perform jaeger_private.ensure_month(v_month);
      insert into jaeger.monthly_plan_items(source_row_number,month_key,section,name,budget,actual,remaining,due_text,source_kind,request_id)
      select source_row_number,v_month,section,name,budget,0,budget,due_text,'supabase',p_request_id
      from jaeger.monthly_plan_items where month_key=v_base_month order by source_row_number,section;
      insert into jaeger.monthly_summary_values(source_row_number,month_key,metric,budget,actual,source_kind,request_id)
      select source_row_number,v_month,metric,budget,
        case when metric='saldo_inicial' then coalesce((select actual from jaeger.monthly_summary_values
          where month_key=v_base_month and metric='saldo_final' order by source_row_number limit 1),0) else 0 end,
        'supabase',p_request_id from jaeger.monthly_summary_values where month_key=v_base_month;
      insert into jaeger.monthly_distribution_metrics(source_row_number,month_key,metric,estimated_pct,estimated_value,
        actual_pct,actual_value,source_kind,request_id)
      select source_row_number,v_month,metric,estimated_pct,estimated_value,0,0,'supabase',p_request_id
      from jaeger.monthly_distribution_metrics where month_key=v_base_month;
      v_result:=jsonb_build_object('ok',true,'msg','Mes creado: '||v_month,'mes',v_month);
    end if;

  elsif p_operation='gestionarItemCategoria' then
    v_month:=jaeger_private.normalize_month(p_payload->>'mes');
    if not exists(select 1 from jaeger.monthly_plan_items where month_key=v_month) then raise exception 'Mes no encontrado: %',v_month; end if;
    v_action:=lower(btrim(coalesce(p_payload->>'accion',p_payload->>'action','')));
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    v_old_name:=btrim(coalesce(p_payload->>'oldNombre',p_payload->>'item',''));
    v_budget:=greatest(replace(btrim(coalesce(p_payload->>'presupuesto','0')),',','.')::numeric,0);
    v_section:=case btrim(coalesce(p_payload->>'categoria',''))
      when 'Ahorros' then 'ahorro' when 'Deudas' then 'deuda' when 'Necesidades' then 'necesidad'
      when 'Deseos' then 'deseo' when 'Ingresos' then 'ingreso' else null end;
    if v_section is null then raise exception 'Categoría no soportada'; end if;
    if v_action in ('agregar','add') then
      if v_name='' then raise exception 'Escribe el nombre del item'; end if;
      if exists(select 1 from jaeger.monthly_plan_items where month_key=v_month and section=v_section and lower(btrim(name))=lower(v_name)) then
        raise exception 'Ese item ya existe';
      end if;
      if v_section in ('ahorro','deuda') then
        v_payload2:=p_payload||jsonb_build_object('tipo',v_section,'nota','Gestionar '||(p_payload->>'categoria'));
        perform jaeger_private.upsert_catalog_item(v_payload2,p_request_id);
      end if;
      select coalesce(max(source_row_number),0)+1 into v_order from jaeger.monthly_plan_items where month_key=v_month;
      insert into jaeger.monthly_plan_items(source_row_number,month_key,section,name,budget,actual,remaining,source_kind,request_id)
      values(v_order,v_month,v_section,v_name,v_budget,0,v_budget,'supabase',p_request_id);
    elsif v_action in ('editar','edit') then
      select id into v_plan_id from jaeger.monthly_plan_items where month_key=v_month and section=v_section
        and lower(btrim(name))=lower(v_old_name) order by source_row_number limit 1 for update;
      if v_plan_id is null then raise exception 'Item no encontrado'; end if;
      if v_name='' then raise exception 'Escribe el nuevo nombre'; end if;
      if lower(v_name)<>lower(v_old_name) and exists(select 1 from jaeger.monthly_plan_items where month_key=v_month and section=v_section
        and lower(btrim(name))=lower(v_name) and id<>v_plan_id) then raise exception 'Ya existe un item con ese nombre'; end if;
      if v_section in ('ahorro','deuda') then
        v_payload2:=p_payload||jsonb_build_object('tipo',v_section,'nota','Gestionar '||(p_payload->>'categoria'));
        perform jaeger_private.upsert_catalog_item(v_payload2,p_request_id);
      end if;
      update jaeger.monthly_plan_items set name=v_name,budget=v_budget,remaining=v_budget-actual,
        source_kind='supabase',request_id=p_request_id where id=v_plan_id;
      if v_name<>v_old_name then
        update jaeger.financial_movements set subcategory=v_name,request_id=p_request_id
        where economic_month=v_month and kind=v_section and lower(btrim(subcategory))=lower(v_old_name);
      end if;
    elsif v_action in ('eliminar','delete') then
      if v_old_name='' then raise exception 'Selecciona el item a eliminar'; end if;
      if v_section in ('ahorro','deuda') then
        update jaeger.catalog_items set state='inactivo',request_id=p_request_id
        where kind=v_section and lower(btrim(name))=lower(v_old_name);
      end if;
      delete from jaeger.monthly_plan_items p using jaeger.months m
      where p.month_key=m.month_key and p.section=v_section and lower(btrim(p.name))=lower(v_old_name)
        and m.starts_on>=jaeger_private.month_start(v_month) and p.actual=0
        and not exists(select 1 from jaeger.financial_movements f where f.economic_month=p.month_key
          and f.kind=v_section and lower(btrim(f.subcategory))=lower(v_old_name));
    else
      raise exception 'Acción no soportada';
    end if;
    v_result:=jsonb_build_object('ok',true,'mes',v_month);

  elsif p_operation='registrarDiferidoTdc' then
    v_card:=upper(btrim(coalesce(p_payload->>'tarjeta','')));
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    v_total:=replace(btrim(coalesce(p_payload->>'inicial','0')),',','.')::numeric;
    v_installment_amount:=replace(btrim(coalesce(p_payload->>'cuota','0')),',','.')::numeric;
    v_month:=jaeger_private.normalize_month(p_payload->>'mesInicio');
    v_balance_id:=nullif(btrim(coalesce(p_payload->>'balanceId','')),'');
    v_group:=coalesce(nullif(btrim(p_payload->>'grupo'),''),'Tarjeta de Crédito');
    if v_card not in ('VISA','MC') then raise exception 'Tarjeta inválida'; end if;
    if v_name='' then raise exception 'Escribe el nombre del diferido'; end if;
    if v_total<=0 or v_installment_amount<=0 then raise exception 'Ingresa saldo y cuota válidos'; end if;
    perform jaeger_private.ensure_month(v_month);
    if v_balance_id is null and nullif(btrim(p_payload->>'balanceNombreNuevo'),'') is not null then
      v_balance_id:=jaeger_private.new_balance_item('Pasivo',p_payload->>'balanceNombreNuevo',v_total,v_group,
        'Nuevo diferido '||v_card,p_request_id);
      v_new_balance:=true;
      perform jaeger_private.record_balance_change(v_balance_id,p_payload->>'balanceNombreNuevo','Pasivo','crear',0,v_total,
        'Nuevo diferido '||v_card,p_request_id);
    end if;
    select * into v_item from jaeger.balance_items where balance_id=v_balance_id and balance_type='Pasivo' and active for update;
    if not found then raise exception 'Selecciona o crea el pasivo relacionado'; end if;
    if not v_new_balance then
      perform jaeger_private.apply_balance_delta(v_balance_id,v_total,p_request_id);
      perform jaeger_private.record_balance_change(v_balance_id,v_item.name,'Pasivo','nuevo diferido',v_item.current_value,
        v_item.current_value+v_total,v_name,p_request_id);
    end if;
    v_payload2:=jsonb_build_object('tipo','deuda','nombre',v_name,'estado','activo','balanceCodigo',v_balance_id,
      'grupo',v_group,'nota','Diferido '||v_card);
    perform jaeger_private.upsert_catalog_item(v_payload2,p_request_id);
    v_id:='DIF-'||v_card||'-'||floor(extract(epoch from clock_timestamp())*1000)::bigint::text||'-'||left(gen_random_uuid()::text,8);
    insert into jaeger.card_installments(legacy_id,source_row_number,card_code,name,initial_balance,installment_amount,
      installments_at_base_month,base_month,state,balance_id,source_kind,request_id,source_timestamp)
    values(v_id,(select coalesce(max(source_row_number),0)+1 from jaeger.card_installments),v_card,v_name,v_total,
      v_installment_amount,1,v_month,'activo',v_balance_id,'supabase',p_request_id,
      to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'));
    v_remaining:=v_total;v_month_date:=jaeger_private.month_start(v_month);v_index:=0;
    while v_remaining>0.004 and v_index<120 loop
      v_month:=jaeger_private.ensure_month(jaeger_private.month_name(v_month_date));
      v_amount:=least(v_installment_amount,v_remaining);
      insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
        notes,origin,installment_legacy_id,source_kind,request_id)
      values(gen_random_uuid()::text,(select coalesce(max(source_row_number),0)+1 from jaeger.card_events),now(),v_month,
        v_card,'cargo',round(v_amount,2),v_name,'diferido',v_id,'supabase',p_request_id);
      v_remaining:=round(v_remaining-v_amount,2);v_month_date:=(v_month_date+interval '1 month')::date;v_index:=v_index+1;
    end loop;
    if v_remaining>0.004 then raise exception 'El diferido excede 120 cuotas'; end if;
    v_result:=jsonb_build_object('ok',true,'id',v_id,'cardId',v_card,'mesAplicado',jaeger_private.normalize_month(p_payload->>'mesInicio'));

  elsif p_operation='liquidarDiferidoTdc' then
    v_card:=upper(btrim(coalesce(p_payload->>'tarjeta','')));
    v_id:=btrim(coalesce(p_payload->>'diferidoId',''));
    v_month:=jaeger_private.normalize_month(p_payload->>'mesPago');
    v_total:=replace(btrim(coalesce(p_payload->>'total','0')),',','.')::numeric;
    v_cash_amount:=replace(btrim(coalesce(p_payload->>'montoSaldo','0')),',','.')::numeric;
    v_asset_amount:=replace(btrim(coalesce(p_payload->>'montoActivo','0')),',','.')::numeric;
    v_asset_id:=nullif(btrim(coalesce(p_payload->>'activoId','')),'');
    v_date:=nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
    if v_total<=0 or abs(v_cash_amount+v_asset_amount-v_total)>0.01 then
      raise exception 'Los orígenes deben sumar el total a liquidar';
    end if;
    if v_asset_amount>0 and v_asset_id is null then raise exception 'Selecciona el activo de donde sale el dinero'; end if;
    select * into v_installment from jaeger.card_installments where legacy_id=v_id and card_code=v_card for update;
    if not found or v_installment.state<>'activo' then raise exception 'Diferido no encontrado o ya liquidado'; end if;
    perform jaeger_private.ensure_month(v_month);
    perform 1 from jaeger.balance_items where balance_id in (v_asset_id,v_installment.balance_id) order by balance_id for update;
    if v_asset_amount>0 and not exists(select 1 from jaeger.balance_items where balance_id=v_asset_id and balance_type='Activo' and active) then
      raise exception 'Activo de origen no encontrado';
    end if;
    if v_cash_amount>0 then
      v_payload2:=jsonb_build_object('mes',jaeger_private.normalize_month(coalesce(p_payload->>'mesGasto',p_payload->>'homeMes',v_month)),
        'mesRegistro',jaeger_private.normalize_month(coalesce(case when v_date is not null then jaeger_private.month_from_date(v_date) end,p_payload->>'homeMes',v_month)),
        'tipo','deuda','categoria','deuda','subcategoria',v_installment.name,'monto',v_cash_amount,
        'fecha',coalesce(p_payload->>'fecha',''),'notas','Liquidación '||v_installment.name||' · '||v_card);
      v_result:=jaeger_private.create_movement(v_payload2,p_request_id);
      v_movement_id:=v_result->>'id';
    end if;
    if v_asset_amount>0 then
      select * into v_item from jaeger.balance_items where balance_id=v_asset_id;
      perform jaeger_private.apply_balance_delta(v_asset_id,-v_asset_amount,p_request_id);
      perform jaeger_private.record_balance_change(v_asset_id,v_item.name,'Activo','liquidar diferido',v_item.current_value,
        v_item.current_value-v_asset_amount,v_installment.name,p_request_id);
      if v_installment.balance_id is not null then
        select * into v_other from jaeger.balance_items where balance_id=v_installment.balance_id;
        perform jaeger_private.apply_balance_delta(v_installment.balance_id,-v_asset_amount,p_request_id);
        perform jaeger_private.record_balance_change(v_installment.balance_id,v_other.name,'Pasivo','liquidar diferido',
          v_other.current_value,greatest(0,v_other.current_value-v_asset_amount-v_cash_amount),v_card,p_request_id);
      end if;
    end if;
    delete from jaeger.card_charge_allocations a using jaeger.card_events e
      where (a.charge_event_id=e.legacy_id or a.payment_event_id=e.legacy_id)
        and e.installment_legacy_id=v_id and e.event_type='cargo'
        and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
    update jaeger.card_events p set charge_legacy_id=null,request_id=p_request_id
      where p.charge_legacy_id in (select e.legacy_id from jaeger.card_events e where e.installment_legacy_id=v_id
        and e.event_type='cargo' and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month));
    delete from jaeger.card_events e where e.installment_legacy_id=v_id and e.event_type='cargo'
      and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
    select coalesce(max(source_row_number),0)+1 into v_order from jaeger.card_events;
    insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
      transaction_date,notes,origin,movement_legacy_id,category,subcategory,installment_legacy_id,source_kind,request_id)
    values(gen_random_uuid()::text,v_order,now(),v_month,v_card,'abono',v_total,v_date,'Liquidación '||v_installment.name,
      'liquidacion',v_movement_id,'deuda',v_installment.name,v_id,'supabase',p_request_id);
    update jaeger.card_installments set state='liquidado',liquidation_month=v_month,
      source_timestamp=to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),request_id=p_request_id
    where legacy_id=v_id;
    update jaeger.catalog_items set state='inactivo',request_id=p_request_id
      where kind='deuda' and lower(btrim(name))=lower(btrim(v_installment.name));
    if v_installment.balance_id is not null then
      update jaeger.balance_items set active=false,request_id=p_request_id where balance_id=v_installment.balance_id;
    end if;
    v_result:=jsonb_build_object('ok',true,'id',v_id,'registroId',coalesce(v_movement_id,''),'cardId',v_card,
      'mesAplicado',v_month,'linkedMovement',v_movement_id is not null);
  end if;

  update jaeger.operation_requests set status='completed',response=v_result,error_message=null,
    completed_at=now(),updated_at=now() where request_id=p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$$;

revoke all on function public.jaeger_write_extended(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.jaeger_write_extended(text,uuid,text,jsonb) to service_role;

comment on function public.jaeger_write_extended(text,uuid,text,jsonb) is
  'Escrituras restantes de Jaeger Spend: transaccionales, idempotentes y exclusivas de service_role.';
