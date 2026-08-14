-- Cover the operational request foreign keys used by audits/idempotency.
create index if not exists monthly_plan_items_request_id_idx
  on jaeger.monthly_plan_items(request_id) where request_id is not null;
create index if not exists monthly_summary_values_request_id_idx
  on jaeger.monthly_summary_values(request_id) where request_id is not null;
create index if not exists monthly_distribution_metrics_request_id_idx
  on jaeger.monthly_distribution_metrics(request_id) where request_id is not null;
create index if not exists japan_budget_items_request_id_idx
  on jaeger.japan_budget_items(request_id) where request_id is not null;
create index if not exists paintings_months_request_id_idx
  on jaeger.paintings_months(request_id) where request_id is not null;
create index if not exists balance_log_request_id_idx
  on jaeger.balance_log(request_id) where request_id is not null;
