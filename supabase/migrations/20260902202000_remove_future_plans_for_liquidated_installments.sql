-- A liquidated installment no longer belongs to debt planning after its
-- liquidation month. Keep historical months and any month with real movements.

create or replace function jaeger_private.remove_future_liquidated_installment_plans()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.state = 'liquidado' and new.liquidation_month is not null then
    delete from jaeger.monthly_plan_items p
    using jaeger.months plan_month, jaeger.months liquidation_month
    where plan_month.month_key = p.month_key
      and liquidation_month.month_key = new.liquidation_month
      and plan_month.starts_on > liquidation_month.starts_on
      and p.section = 'deuda'
      and lower(btrim(p.name)) = lower(btrim(new.name))
      and p.actual = 0
      and not exists (
        select 1
        from jaeger.financial_movements f
        where f.economic_month = p.month_key
          and f.kind = 'deuda'
          and lower(btrim(f.subcategory)) = lower(btrim(p.name))
      );
  end if;
  return new;
end;
$$;

drop trigger if exists card_installments_cleanup_future_plans_insert
  on jaeger.card_installments;
create trigger card_installments_cleanup_future_plans_insert
after insert on jaeger.card_installments
for each row execute function jaeger_private.remove_future_liquidated_installment_plans();

drop trigger if exists card_installments_cleanup_future_plans_update
  on jaeger.card_installments;
create trigger card_installments_cleanup_future_plans_update
after update of state, liquidation_month on jaeger.card_installments
for each row execute function jaeger_private.remove_future_liquidated_installment_plans();

-- Repair only future, unused plan rows left by already-liquidated installments.
delete from jaeger.monthly_plan_items p
using jaeger.card_installments i, jaeger.months plan_month, jaeger.months liquidation_month
where i.state = 'liquidado'
  and i.liquidation_month is not null
  and plan_month.month_key = p.month_key
  and liquidation_month.month_key = i.liquidation_month
  and plan_month.starts_on > liquidation_month.starts_on
  and p.section = 'deuda'
  and lower(btrim(p.name)) = lower(btrim(i.name))
  and p.actual = 0
  and not exists (
    select 1
    from jaeger.financial_movements f
    where f.economic_month = p.month_key
      and f.kind = 'deuda'
      and lower(btrim(f.subcategory)) = lower(btrim(p.name))
  );

select public.jaeger_invalidate_api_cache();
