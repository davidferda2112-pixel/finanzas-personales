-- Preserve chronology in the client; retain original movement identity in audit rows.
create or replace view jaeger.balance_history with (security_invoker=true) as
 select l.source_row_number,l.source_timestamp,l.balance_id,l.name,l.balance_type,l.action,
 l.previous_value,l.new_value,l.note,l.request_id,l.created_at,l.movement_id,l.operation_id,l.reconciliation_state,
 'log:'||l.id as history_id from jaeger.balance_log l
 union all
 select a.audit_id::integer,to_char(a.occurred_at at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),
 a.entity_id,coalesce(a.after_data->>'name',a.before_data->>'name'),
 coalesce(a.after_data->>'balance_type',a.before_data->>'balance_type'),
 case when a.action='insert' then 'create' when a.action='delete' then 'delete'
 when a.after_data->>'active'='false' and a.before_data->>'active'='true' then 'deactivate'
 when m.action='delete' then 'reversal'
 else coalesce(nullif(jaeger_private.movement_code(m.data->>'kind',m.data->>'subcategory',m.data->>'balance_id'),'ordinary'),'automatic') end,
 (a.before_data->>'current_value')::numeric,(a.after_data->>'current_value')::numeric,
 'Auditoría persistente de balance',a.request_id,a.occurred_at,m.entity_id,null::uuid,'pending','audit:'||a.audit_id
 from jaeger.audit_events a
 left join lateral (
   select f.entity_id,f.action,coalesce(f.after_data,f.before_data) data
   from jaeger.audit_events f where a.request_id is not null and f.request_id=a.request_id
   and f.entity_type='jaeger.financial_movements'
   order by f.audit_id desc limit 1
 ) m on true
 where a.entity_type='jaeger.balance_items' and not exists(
 select 1 from jaeger.balance_log l where l.request_id=a.request_id and l.balance_id=a.entity_id
 and (l.previous_value is not distinct from (a.before_data->>'current_value')::numeric
   or (a.action='insert' and a.before_data is null and l.previous_value=0))
 and l.new_value is not distinct from (a.after_data->>'current_value')::numeric);
revoke all on jaeger.balance_history from public,anon,authenticated;
grant select on jaeger.balance_history to service_role;
create or replace function public.jaeger_native_read_source(p_fn text,p_args jsonb default '[]') returns jsonb
language plpgsql set search_path='' as $body$
declare result jsonb;
begin
 result:=public.jaeger_native_read_source_financing(p_fn,p_args);
 if p_fn='getBalanceGeneral' then
   result:=result||jsonb_build_object('reconciliationCases',coalesce((
    select jsonb_agg(to_jsonb(c)||jsonb_build_object('account_name',b.name) order by c.case_key)
    from jaeger.reconciliation_cases c left join jaeger.balance_items b on b.balance_id=c.balance_id),'[]'));
 end if;
 if p_fn in ('getMesData','getBalanceGeneral','getMovimientosMes','getFlujoCaja') then
   result:=result||jsonb_build_object('cashObservation',(
     select evidence->'cash_observation' from jaeger.reconciliation_cases
     where balance_id='10101.05' and evidence ? 'cash_observation' order by updated_at desc limit 1));
 end if;
 return result;
end $body$;
revoke all on function public.jaeger_native_read_source(text,jsonb) from public,anon,authenticated;
grant execute on function public.jaeger_native_read_source(text,jsonb) to service_role;
select public.jaeger_invalidate_api_cache();

