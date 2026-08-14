-- Step 2: prepare the validated Jaeger data model for direct Supabase operation.
-- Financial values are not recalculated or rewritten by this migration.

create schema if not exists jaeger_private;

revoke all on schema jaeger_private from public, anon, authenticated;
grant usage on schema jaeger_private to service_role;

alter default privileges for role postgres in schema jaeger_private
  revoke execute on functions from public, anon, authenticated;

create table if not exists jaeger.system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_value_object
    check (jsonb_typeof(setting_value) = 'object')
);

insert into jaeger.system_settings (setting_key, setting_value, description)
values
  (
    'app.timezone',
    '{"name":"America/Guayaquil","utc_offset":"-05:00","observes_dst":false}'::jsonb,
    'Zona horaria de negocio. Los instantes se almacenan como timestamptz y las fechas financieras se interpretan en Guayaquil.'
  ),
  (
    'migration.state',
    '{"phase":2,"active_source":"google_sheets","target_source":"supabase","cutover_completed":false}'::jsonb,
    'Estado del cambio de fuente. El corte a Supabase requiere una validacion posterior.'
  )
on conflict (setting_key) do nothing;

create table if not exists jaeger.operation_requests (
  request_id uuid primary key,
  operation text not null,
  payload_hash text not null,
  status text not null default 'pending',
  response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint operation_requests_operation_nonempty
    check (btrim(operation) <> ''),
  constraint operation_requests_payload_hash_nonempty
    check (btrim(payload_hash) <> ''),
  constraint operation_requests_status_check
    check (status in ('pending', 'completed', 'failed'))
);

create table if not exists jaeger.audit_events (
  audit_id bigint generated always as identity primary key,
  request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  business_date date not null default ((now() at time zone 'America/Guayaquil')::date),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_events_action_check
    check (action in ('insert', 'update', 'delete', 'domain')),
  constraint audit_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create table if not exists jaeger.notifications (
  notification_id bigint generated always as identity primary key,
  event_key text unique,
  kind text not null,
  month_key text references jaeger.months(month_key) on delete restrict,
  title text not null,
  message text not null,
  occurred_at timestamptz not null default now(),
  business_date date not null default ((now() at time zone 'America/Guayaquil')::date),
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint notifications_kind_nonempty check (btrim(kind) <> ''),
  constraint notifications_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint notifications_expiry_order
    check (expires_at is null or expires_at >= occurred_at)
);

-- Imported rows retain their snapshot identity. New operational rows can be
-- created directly in Supabase and default to a UUID-compatible text key.
alter table jaeger.financial_movements
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  alter column legacy_id set default (gen_random_uuid()::text),
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

alter table jaeger.card_events
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  alter column legacy_id set default (gen_random_uuid()::text),
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

alter table jaeger.card_installments
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  alter column legacy_id set default (gen_random_uuid()::text),
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

alter table jaeger.catalog_items
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  alter column legacy_id set default (gen_random_uuid()::text),
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

alter table jaeger.balance_groups
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

alter table jaeger.balance_items
  alter column source_snapshot_id drop not null,
  alter column source_row_number drop not null,
  alter column balance_id set default ('balance_' || gen_random_uuid()::text),
  add column if not exists source_kind text,
  add column if not exists request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists row_version bigint;

update jaeger.financial_movements
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, recorded_at, now()),
    updated_at = coalesce(updated_at, recorded_at, now()),
    row_version = coalesce(row_version, 1);

update jaeger.card_events
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, recorded_at, now()),
    updated_at = coalesce(updated_at, recorded_at, now()),
    row_version = coalesce(row_version, 1);

update jaeger.card_installments
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    row_version = coalesce(row_version, 1);

update jaeger.catalog_items
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    row_version = coalesce(row_version, 1);

update jaeger.balance_groups
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    row_version = coalesce(row_version, 1);

update jaeger.balance_items
set source_kind = coalesce(source_kind, 'google_sheets'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now()),
    row_version = coalesce(row_version, 1);

alter table jaeger.financial_movements
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint financial_movements_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint financial_movements_row_version_positive check (row_version > 0);

alter table jaeger.card_events
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint card_events_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint card_events_row_version_positive check (row_version > 0);

alter table jaeger.card_installments
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint card_installments_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint card_installments_row_version_positive check (row_version > 0);

alter table jaeger.catalog_items
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint catalog_items_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint catalog_items_row_version_positive check (row_version > 0);

alter table jaeger.balance_groups
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint balance_groups_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint balance_groups_row_version_positive check (row_version > 0);

alter table jaeger.balance_items
  alter column source_kind set default 'supabase',
  alter column source_kind set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column row_version set default 1,
  alter column row_version set not null,
  add constraint balance_items_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  add constraint balance_items_row_version_positive check (row_version > 0);

-- These relationships were validated against the imported production snapshot
-- before being enforced: all orphan counts were zero.
alter table jaeger.card_events
  add constraint card_events_movement_legacy_id_fkey
    foreign key (movement_legacy_id) references jaeger.financial_movements(legacy_id) on delete restrict,
  add constraint card_events_charge_legacy_id_fkey
    foreign key (charge_legacy_id) references jaeger.card_events(legacy_id) on delete restrict,
  add constraint card_events_installment_legacy_id_fkey
    foreign key (installment_legacy_id) references jaeger.card_installments(legacy_id) on delete restrict;

alter table jaeger.financial_movements
  add constraint financial_movements_balance_id_fkey
    foreign key (balance_id) references jaeger.balance_items(balance_id) on delete restrict;

alter table jaeger.card_installments
  add constraint card_installments_balance_id_fkey
    foreign key (balance_id) references jaeger.balance_items(balance_id) on delete restrict;

alter table jaeger.catalog_items
  add constraint catalog_items_balance_id_fkey
    foreign key (balance_id) references jaeger.balance_items(balance_id) on delete restrict;

-- Formal representation of money collected/assigned to a specific card charge.
-- It does not reduce real card debt by itself.
create table if not exists jaeger.card_charge_allocations (
  allocation_id bigint generated always as identity primary key,
  payment_event_id text not null
    references jaeger.card_events(legacy_id) on delete restrict,
  charge_event_id text not null
    references jaeger.card_events(legacy_id) on delete restrict,
  amount numeric(18,2) not null,
  allocation_kind text not null default 'collection',
  source_kind text not null default 'supabase',
  request_id uuid references jaeger.operation_requests(request_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  constraint card_charge_allocations_positive check (amount > 0),
  constraint card_charge_allocations_distinct_events check (payment_event_id <> charge_event_id),
  constraint card_charge_allocations_kind_check
    check (allocation_kind in ('collection', 'release', 'application')),
  constraint card_charge_allocations_source_kind_check
    check (source_kind in ('google_sheets', 'supabase')),
  constraint card_charge_allocations_row_version_positive check (row_version > 0),
  constraint card_charge_allocations_event_pair_unique
    unique (payment_event_id, charge_event_id, allocation_kind)
);

insert into jaeger.card_charge_allocations (
  payment_event_id,
  charge_event_id,
  amount,
  allocation_kind,
  source_kind,
  created_at,
  updated_at
)
select
  legacy_id,
  charge_legacy_id,
  amount,
  'collection',
  'google_sheets',
  coalesce(recorded_at, now()),
  coalesce(recorded_at, now())
from jaeger.card_events
where event_type = 'abono'
  and charge_legacy_id is not null
on conflict (payment_event_id, charge_event_id, allocation_kind) do nothing;

create or replace function jaeger_private.business_now()
returns timestamp without time zone
language sql
stable
security invoker
set search_path = ''
as $$
  select now() at time zone 'America/Guayaquil';
$$;

create or replace function jaeger_private.business_today()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (now() at time zone 'America/Guayaquil')::date;
$$;

create or replace function jaeger_private.touch_operational_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function jaeger_private.audit_operational_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_before jsonb;
  row_after jsonb;
  resolved_entity_id text;
  resolved_request_id uuid;
  request_setting text;
begin
  if tg_op = 'INSERT' then
    row_after := to_jsonb(new);
    select string_agg(coalesce(row_after ->> key_name, ''), ':')
      into resolved_entity_id
    from unnest(tg_argv) as key_name;
  elsif tg_op = 'UPDATE' then
    row_before := to_jsonb(old);
    row_after := to_jsonb(new);
    select string_agg(coalesce(row_after ->> key_name, row_before ->> key_name, ''), ':')
      into resolved_entity_id
    from unnest(tg_argv) as key_name;
  else
    row_before := to_jsonb(old);
    select string_agg(coalesce(row_before ->> key_name, ''), ':')
      into resolved_entity_id
    from unnest(tg_argv) as key_name;
  end if;

  request_setting := nullif(current_setting('jaeger.request_id', true), '');
  if request_setting is not null then
    begin
      resolved_request_id := request_setting::uuid;
    exception when invalid_text_representation then
      resolved_request_id := null;
    end;
  end if;

  if resolved_request_id is null then
    resolved_request_id := coalesce(
      nullif(row_after ->> 'request_id', '')::uuid,
      nullif(row_before ->> 'request_id', '')::uuid
    );
  end if;

  insert into jaeger.audit_events (
    request_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    resolved_request_id,
    tg_table_schema || '.' || tg_table_name,
    resolved_entity_id,
    lower(tg_op),
    row_before,
    row_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function jaeger_private.business_now() from public, anon, authenticated;
revoke all on function jaeger_private.business_today() from public, anon, authenticated;
revoke all on function jaeger_private.touch_operational_row() from public, anon, authenticated;
revoke all on function jaeger_private.audit_operational_row() from public, anon, authenticated;
grant execute on function jaeger_private.business_now() to service_role;
grant execute on function jaeger_private.business_today() to service_role;

create trigger financial_movements_touch
before update on jaeger.financial_movements
for each row execute function jaeger_private.touch_operational_row();
create trigger financial_movements_audit
after insert or update or delete on jaeger.financial_movements
for each row execute function jaeger_private.audit_operational_row('legacy_id');

create trigger card_events_touch
before update on jaeger.card_events
for each row execute function jaeger_private.touch_operational_row();
create trigger card_events_audit
after insert or update or delete on jaeger.card_events
for each row execute function jaeger_private.audit_operational_row('legacy_id');

create trigger card_installments_touch
before update on jaeger.card_installments
for each row execute function jaeger_private.touch_operational_row();
create trigger card_installments_audit
after insert or update or delete on jaeger.card_installments
for each row execute function jaeger_private.audit_operational_row('legacy_id');

create trigger catalog_items_touch
before update on jaeger.catalog_items
for each row execute function jaeger_private.touch_operational_row();
create trigger catalog_items_audit
after insert or update or delete on jaeger.catalog_items
for each row execute function jaeger_private.audit_operational_row('legacy_id');

create trigger balance_items_touch
before update on jaeger.balance_items
for each row execute function jaeger_private.touch_operational_row();
create trigger balance_items_audit
after insert or update or delete on jaeger.balance_items
for each row execute function jaeger_private.audit_operational_row('balance_id');

create trigger balance_groups_touch
before update on jaeger.balance_groups
for each row execute function jaeger_private.touch_operational_row();
create trigger balance_groups_audit
after insert or update or delete on jaeger.balance_groups
for each row execute function jaeger_private.audit_operational_row('balance_type', 'name');

create trigger card_charge_allocations_touch
before update on jaeger.card_charge_allocations
for each row execute function jaeger_private.touch_operational_row();
create trigger card_charge_allocations_audit
after insert or update or delete on jaeger.card_charge_allocations
for each row execute function jaeger_private.audit_operational_row('allocation_id');

create index if not exists financial_movements_economic_read_idx
  on jaeger.financial_movements (economic_month, kind, transaction_date, legacy_id)
  include (amount, subcategory, cash_month);
create index if not exists financial_movements_cash_read_idx
  on jaeger.financial_movements (cash_month, transaction_date, legacy_id)
  include (amount, kind);
create index if not exists financial_movements_balance_id_idx
  on jaeger.financial_movements (balance_id) where balance_id is not null;
create index if not exists financial_movements_request_id_idx
  on jaeger.financial_movements (request_id) where request_id is not null;

create index if not exists card_events_month_read_idx
  on jaeger.card_events (card_code, month_key, event_type, transaction_date, legacy_id)
  include (amount);
create index if not exists card_events_movement_id_idx
  on jaeger.card_events (movement_legacy_id) where movement_legacy_id is not null;
create index if not exists card_events_charge_id_idx
  on jaeger.card_events (charge_legacy_id) where charge_legacy_id is not null;
create index if not exists card_events_installment_id_idx
  on jaeger.card_events (installment_legacy_id) where installment_legacy_id is not null;
create index if not exists card_events_request_id_idx
  on jaeger.card_events (request_id) where request_id is not null;

create index if not exists card_installments_balance_id_idx
  on jaeger.card_installments (balance_id) where balance_id is not null;
create index if not exists card_installments_request_id_idx
  on jaeger.card_installments (request_id) where request_id is not null;
create index if not exists catalog_items_balance_id_idx
  on jaeger.catalog_items (balance_id) where balance_id is not null;
create index if not exists catalog_items_request_id_idx
  on jaeger.catalog_items (request_id) where request_id is not null;
create index if not exists catalog_items_active_read_idx
  on jaeger.catalog_items (kind, sort_order, legacy_id) where state = 'activo';
create index if not exists balance_items_active_read_idx
  on jaeger.balance_items (balance_type, group_name, sort_order, balance_id) where active;
create index if not exists balance_items_request_id_idx
  on jaeger.balance_items (request_id) where request_id is not null;
create index if not exists balance_groups_request_id_idx
  on jaeger.balance_groups (request_id) where request_id is not null;

create index if not exists card_charge_allocations_charge_idx
  on jaeger.card_charge_allocations (charge_event_id, allocation_kind);
create index if not exists card_charge_allocations_payment_idx
  on jaeger.card_charge_allocations (payment_event_id, allocation_kind);
create index if not exists card_charge_allocations_request_idx
  on jaeger.card_charge_allocations (request_id) where request_id is not null;

create index if not exists operation_requests_pending_idx
  on jaeger.operation_requests (created_at, request_id) where status = 'pending';
create index if not exists audit_events_entity_time_idx
  on jaeger.audit_events (entity_type, entity_id, occurred_at desc);
create index if not exists audit_events_request_time_idx
  on jaeger.audit_events (request_id, occurred_at desc) where request_id is not null;
create index if not exists notifications_unread_idx
  on jaeger.notifications (occurred_at desc, notification_id) where read_at is null;
create index if not exists notifications_month_key_idx
  on jaeger.notifications (month_key) where month_key is not null;

alter table jaeger.system_settings enable row level security;
alter table jaeger.system_settings force row level security;
alter table jaeger.operation_requests enable row level security;
alter table jaeger.operation_requests force row level security;
alter table jaeger.audit_events enable row level security;
alter table jaeger.audit_events force row level security;
alter table jaeger.notifications enable row level security;
alter table jaeger.notifications force row level security;
alter table jaeger.card_charge_allocations enable row level security;
alter table jaeger.card_charge_allocations force row level security;

revoke all on table jaeger.system_settings from public, anon, authenticated;
revoke all on table jaeger.operation_requests from public, anon, authenticated;
revoke all on table jaeger.audit_events from public, anon, authenticated;
revoke all on table jaeger.notifications from public, anon, authenticated;
revoke all on table jaeger.card_charge_allocations from public, anon, authenticated;

grant select, insert, update on table jaeger.system_settings to service_role;
grant select, insert, update on table jaeger.operation_requests to service_role;
grant select, insert on table jaeger.audit_events to service_role;
grant select, insert, update on table jaeger.notifications to service_role;
grant select, insert, update, delete on table jaeger.card_charge_allocations to service_role;
grant usage, select on all sequences in schema jaeger to service_role;

comment on schema jaeger_private is
  'Funciones internas de Jaeger Spend; no debe exponerse directamente por Data API.';
comment on table jaeger.system_settings is
  'Configuracion operativa versionada; incluye la zona de negocio America/Guayaquil.';
comment on table jaeger.operation_requests is
  'Control de idempotencia para evitar registros financieros duplicados por reintentos.';
comment on table jaeger.audit_events is
  'Historial inmutable de cambios operativos en entidades financieras.';
comment on table jaeger.notifications is
  'Eventos y avisos de la aplicacion con fecha de negocio de Guayaquil.';
comment on table jaeger.card_charge_allocations is
  'Dinero recogido o asignado a cargos de tarjeta; una asignacion no reduce por si sola la deuda real.';
