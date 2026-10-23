create table jaeger.reconciliation_cases (
  case_key text primary key,
  balance_id text references jaeger.balance_items(balance_id),
  period text not null,
  state text not null check(state in ('reconciled','adjusted','partial','pending')),
  note text not null,
  evidence jsonb not null default '{}',
  request_id uuid,
  updated_at timestamptz not null default now()
);
create index reconciliation_cases_balance_idx on jaeger.reconciliation_cases(balance_id);
alter table jaeger.reconciliation_cases enable row level security;
revoke all on jaeger.reconciliation_cases from public,anon,authenticated;
grant all on jaeger.reconciliation_cases to service_role;
create trigger audit_reconciliation_cases after insert or update or delete on jaeger.reconciliation_cases
for each row execute function jaeger_private.audit_operational_row('case_key');
alter function public.jaeger_native_read_source(text,jsonb) rename to jaeger_native_read_source_financing;
create function public.jaeger_native_read_source(p_fn text,p_args jsonb default '[]') returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
 result:=public.jaeger_native_read_source_financing(p_fn,p_args);
 if p_fn='getBalanceGeneral' then
   result:=result||jsonb_build_object('reconciliationCases',coalesce((
    select jsonb_agg(to_jsonb(c)||jsonb_build_object('account_name',b.name) order by c.case_key)
    from jaeger.reconciliation_cases c left join jaeger.balance_items b on b.balance_id=c.balance_id),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.jaeger_native_read_source(text,jsonb) from public,anon,authenticated;
grant execute on function public.jaeger_native_read_source(text,jsonb) to service_role;
