create index if not exists card_installments_request_id_idx
  on jaeger.card_installments (request_id) where request_id is not null;
create index if not exists catalog_items_request_id_idx
  on jaeger.catalog_items (request_id) where request_id is not null;
create index if not exists balance_items_request_id_idx
  on jaeger.balance_items (request_id) where request_id is not null;
create index if not exists balance_groups_request_id_idx
  on jaeger.balance_groups (request_id) where request_id is not null;
create index if not exists notifications_month_key_idx
  on jaeger.notifications (month_key) where month_key is not null;
