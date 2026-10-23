create schema jaeger; create schema jaeger_private; create schema jaeger_source; create role anon; create role authenticated; create role service_role;
create table jaeger.audit_events (audit_id bigint NOT NULL,
request_id uuid,
entity_type text NOT NULL,
entity_id text NOT NULL,
action text NOT NULL,
occurred_at timestamp with time zone NOT NULL DEFAULT now(),
business_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Guayaquil'::text))::date,
before_data jsonb,
after_data jsonb,
metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text, 'domain'::text]))),
CHECK ((jsonb_typeof(metadata) = 'object'::text)),
PRIMARY KEY (audit_id));
create table jaeger.balance_adjustments (balance_id text NOT NULL,
source_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
operation text NOT NULL,
delta numeric(18,2) NOT NULL,
updated_at timestamp with time zone,
CHECK ((operation = ANY (ARRAY['activo'::text, 'pasivo'::text]))),
PRIMARY KEY (balance_id));
create table jaeger.balance_deleted_items (id bigint NOT NULL,
source_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
source_timestamp text,
balance_id text NOT NULL,
name text,
balance_type text,
note text,
PRIMARY KEY (id));
create table jaeger.balance_groups (balance_type text NOT NULL,
name text NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
sort_order integer NOT NULL,
active boolean NOT NULL,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((balance_type = ANY (ARRAY['Activo'::text, 'Pasivo'::text]))),
PRIMARY KEY (balance_type, name),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.balance_item_overrides (balance_id text NOT NULL,
source_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
group_name text,
sort_order integer NOT NULL,
active boolean NOT NULL,
source_timestamp text,
PRIMARY KEY (balance_id));
create table jaeger.balance_items (balance_id text NOT NULL DEFAULT ('balance_'::text || (gen_random_uuid())::text),
source_snapshot_id bigint,
source_row_number integer,
name text NOT NULL,
balance_type text NOT NULL,
base_value numeric(18,2) NOT NULL,
adjustment_delta numeric(18,2) NOT NULL DEFAULT 0,
current_value numeric(18,2) NOT NULL,
group_name text,
sort_order integer NOT NULL DEFAULT 0,
active boolean NOT NULL,
custom boolean NOT NULL,
source_timestamp text,
note text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((balance_type = ANY (ARRAY['Activo'::text, 'Pasivo'::text]))),
PRIMARY KEY (balance_id),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.balance_log (id bigint NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
source_timestamp text,
balance_id text,
name text,
balance_type text,
action text,
previous_value numeric(18,2),
new_value numeric(18,2),
note text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
PRIMARY KEY (id));
create table jaeger.card_charge_allocations (allocation_id bigint NOT NULL,
payment_event_id text NOT NULL,
charge_event_id text NOT NULL,
amount numeric(18,2) NOT NULL,
allocation_kind text NOT NULL DEFAULT 'collection'::text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((payment_event_id <> charge_event_id)),
UNIQUE (payment_event_id, charge_event_id, allocation_kind),
CHECK ((allocation_kind = ANY (ARRAY['collection'::text, 'release'::text, 'application'::text]))),
PRIMARY KEY (allocation_id),
CHECK ((amount > (0)::numeric)),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.card_events (legacy_id text NOT NULL DEFAULT (gen_random_uuid())::text,
source_snapshot_id bigint,
source_row_number integer,
recorded_at timestamp with time zone,
month_key text NOT NULL,
card_code text NOT NULL,
event_type text NOT NULL,
amount numeric(18,2) NOT NULL,
transaction_date date,
notes text,
origin text,
movement_legacy_id text,
category text,
subcategory text,
charge_legacy_id text,
installment_legacy_id text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((amount > (0)::numeric)),
CHECK ((card_code = ANY (ARRAY['VISA'::text, 'MC'::text]))),
CHECK ((event_type = ANY (ARRAY['cargo'::text, 'abono'::text]))),
PRIMARY KEY (legacy_id),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.card_history_monthly (id bigint NOT NULL,
source_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
card_code text NOT NULL,
year smallint NOT NULL,
month_number smallint NOT NULL,
concept text NOT NULL,
amount numeric(18,2) NOT NULL,
CHECK ((card_code = ANY (ARRAY['VISA'::text, 'MC'::text]))),
CHECK (((month_number >= 1) AND (month_number <= 12))),
PRIMARY KEY (id),
UNIQUE (card_code, year, month_number, concept, source_row_number));
create table jaeger.card_installments (legacy_id text NOT NULL DEFAULT (gen_random_uuid())::text,
source_snapshot_id bigint,
source_row_number integer,
card_code text NOT NULL,
name text NOT NULL,
initial_balance numeric(18,2) NOT NULL,
installment_amount numeric(18,2) NOT NULL,
installments_at_base_month integer NOT NULL,
base_month text NOT NULL,
state text NOT NULL,
liquidation_month text,
source_timestamp text,
balance_id text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((card_code = ANY (ARRAY['VISA'::text, 'MC'::text]))),
PRIMARY KEY (legacy_id),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))),
CHECK ((state = ANY (ARRAY['activo'::text, 'liquidado'::text]))));
create table jaeger.cash_flow_rows (id bigint NOT NULL,
source_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
label text NOT NULL,
monthly_values jsonb NOT NULL,
total numeric(18,2) NOT NULL,
UNIQUE (label, source_row_number),
PRIMARY KEY (id));
create table jaeger.catalog_items (legacy_id text NOT NULL DEFAULT (gen_random_uuid())::text,
source_snapshot_id bigint,
source_row_number integer,
kind text NOT NULL,
name text NOT NULL,
state text NOT NULL,
balance_type text,
balance_id text,
balance_name text,
group_name text,
sort_order integer NOT NULL DEFAULT 0,
source_timestamp text,
note text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((kind = ANY (ARRAY['ahorro'::text, 'deuda'::text]))),
PRIMARY KEY (legacy_id),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))),
CHECK ((state = ANY (ARRAY['activo'::text, 'inactivo'::text]))));
create table jaeger.credit_cards (card_code text NOT NULL,
display_name text NOT NULL,
issuer text,
last_four text NOT NULL,
network text NOT NULL DEFAULT 'other'::text,
card_style text NOT NULL DEFAULT 'generic-card'::text,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((card_code ~ '^[A-Z0-9][A-Z0-9_-]{1,15}$'::text)),
CHECK ((last_four ~ '^[0-9]{4}$'::text)),
CHECK (((length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 80))),
CHECK ((network = ANY (ARRAY['visa'::text, 'mastercard'::text, 'amex'::text, 'diners'::text, 'discover'::text, 'other'::text]))),
PRIMARY KEY (card_code),
CHECK ((row_version > 0)),
CHECK ((sort_order >= 0)),
CHECK ((card_style = ANY (ARRAY['visa-card'::text, 'mc-card'::text, 'sky-card'::text, 'emerald-card'::text, 'violet-card'::text, 'graphite-card'::text, 'generic-card'::text]))));
create table jaeger.financial_movements (legacy_id text NOT NULL DEFAULT (gen_random_uuid())::text,
source_snapshot_id bigint,
source_row_number integer,
recorded_at timestamp with time zone,
economic_month text NOT NULL,
kind text NOT NULL,
category text,
subcategory text NOT NULL,
amount numeric(18,2) NOT NULL,
transaction_date date,
notes text,
cash_month text NOT NULL,
balance_id text,
balance_type text,
balance_name text,
balance_group text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((amount >= (0)::numeric)),
CHECK ((kind = ANY (ARRAY['ingreso'::text, 'necesidad'::text, 'deseo'::text, 'deuda'::text, 'ahorro'::text]))),
PRIMARY KEY (legacy_id),
CHECK ((row_version > 0)),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))),
CHECK ((source_row_number > 1)));
create table jaeger.goal_asset_allocations (goal_key text NOT NULL,
balance_id text NOT NULL,
allocated_amount numeric(18,2) NOT NULL,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
CHECK ((allocated_amount > (0)::numeric)),
CHECK ((goal_key = 'japan'::text)),
PRIMARY KEY (goal_key, balance_id),
CHECK ((row_version > 0)));
create table jaeger.japan_budget_items (id bigint NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
section text NOT NULL,
name text NOT NULL,
budget numeric(18,2) NOT NULL,
actual numeric(18,2) NOT NULL,
remaining numeric(18,2) NOT NULL,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
PRIMARY KEY (id),
CHECK ((section = ANY (ARRAY['viaje'::text, 'tramites'::text]))),
UNIQUE (section, name, source_row_number),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.monthly_distribution_metrics (id bigint NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
month_key text NOT NULL,
metric text NOT NULL,
estimated_pct numeric(18,6) NOT NULL,
estimated_value numeric(18,2) NOT NULL,
actual_pct numeric(18,6) NOT NULL,
actual_value numeric(18,2) NOT NULL,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
UNIQUE (month_key, metric, source_row_number),
PRIMARY KEY (id),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.monthly_plan_items (id bigint NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
month_key text NOT NULL,
section text NOT NULL,
name text NOT NULL,
budget numeric(18,2) NOT NULL,
actual numeric(18,2) NOT NULL,
remaining numeric(18,2) NOT NULL,
due_text text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
UNIQUE (month_key, section, name, source_row_number),
PRIMARY KEY (id),
CHECK ((section = ANY (ARRAY['ingreso'::text, 'necesidad'::text, 'deseo'::text, 'deuda'::text, 'ahorro'::text]))),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.monthly_summary_values (id bigint NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
month_key text NOT NULL,
metric text NOT NULL,
budget numeric(18,2) NOT NULL,
actual numeric(18,2) NOT NULL,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
UNIQUE (month_key, metric, source_row_number),
PRIMARY KEY (id),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.months (month_key text NOT NULL,
year smallint NOT NULL,
month_number smallint NOT NULL,
starts_on date NOT NULL,
CHECK (((month_number >= 1) AND (month_number <= 12))),
PRIMARY KEY (month_key),
CHECK (((year >= 2000) AND (year <= 2100))),
UNIQUE (year, month_number));
create table jaeger.notifications (notification_id bigint NOT NULL,
event_key text,
kind text NOT NULL,
month_key text,
title text NOT NULL,
message text NOT NULL,
occurred_at timestamp with time zone NOT NULL DEFAULT now(),
business_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Guayaquil'::text))::date,
read_at timestamp with time zone,
expires_at timestamp with time zone,
metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
UNIQUE (event_key),
CHECK (((expires_at IS NULL) OR (expires_at >= occurred_at))),
CHECK ((btrim(kind) <> ''::text)),
CHECK ((jsonb_typeof(metadata) = 'object'::text)),
PRIMARY KEY (notification_id));
create table jaeger.operation_requests (request_id uuid NOT NULL,
operation text NOT NULL,
payload_hash text NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
response jsonb,
error_message text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
completed_at timestamp with time zone,
CHECK ((btrim(operation) <> ''::text)),
CHECK ((btrim(payload_hash) <> ''::text)),
PRIMARY KEY (request_id),
CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]))));
create table jaeger.paintings_months (month_key text NOT NULL,
source_snapshot_id bigint,
source_row_number integer,
opening_stock numeric(18,2) NOT NULL,
added_stock numeric(18,2) NOT NULL,
current_stock numeric(18,2) NOT NULL,
self_consumption numeric(18,2) NOT NULL,
discounted numeric(18,2) NOT NULL,
updated_at text,
source_kind text NOT NULL DEFAULT 'supabase'::text,
request_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
row_version bigint NOT NULL DEFAULT 1,
PRIMARY KEY (month_key),
CHECK ((source_kind = ANY (ARRAY['google_sheets'::text, 'supabase'::text]))));
create table jaeger.system_settings (setting_key text NOT NULL,
setting_value jsonb NOT NULL,
description text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
PRIMARY KEY (setting_key),
CHECK ((jsonb_typeof(setting_value) = 'object'::text)));
create table jaeger_source.sheet_rows (id bigint NOT NULL,
sheet_snapshot_id bigint NOT NULL,
source_row_number integer NOT NULL,
cells jsonb NOT NULL,
PRIMARY KEY (id),
UNIQUE (sheet_snapshot_id, source_row_number),
CHECK ((source_row_number > 0)));
create table jaeger_source.sheet_snapshots (id bigint NOT NULL,
workbook_snapshot_id bigint NOT NULL,
source_sheet_id bigint NOT NULL,
title text NOT NULL,
sheet_index integer NOT NULL,
hidden boolean NOT NULL DEFAULT false,
grid_rows integer NOT NULL,
grid_columns integer NOT NULL,
frozen_rows integer NOT NULL DEFAULT 0,
used_rows integer NOT NULL DEFAULT 0,
used_columns integer NOT NULL DEFAULT 0,
nonempty_rows integer NOT NULL DEFAULT 0,
CHECK ((frozen_rows >= 0)),
CHECK ((grid_columns >= 0)),
CHECK ((grid_rows >= 0)),
CHECK ((nonempty_rows >= 0)),
PRIMARY KEY (id),
CHECK ((sheet_index >= 0)),
CHECK ((used_columns >= 0)),
CHECK ((used_rows >= 0)),
UNIQUE (workbook_snapshot_id, source_sheet_id));
create table jaeger_source.validation_checks (id bigint NOT NULL,
workbook_snapshot_id bigint NOT NULL,
check_name text NOT NULL,
expected_value jsonb,
actual_value jsonb,
passed boolean NOT NULL,
checked_at timestamp with time zone NOT NULL DEFAULT now(),
details text,
PRIMARY KEY (id));
create table jaeger_source.workbook_snapshots (id bigint NOT NULL,
spreadsheet_id text NOT NULL,
title text NOT NULL,
locale text,
source_timezone text,
captured_at timestamp with time zone NOT NULL DEFAULT now(),
sheet_count integer NOT NULL,
nonempty_row_count integer NOT NULL,
status text NOT NULL DEFAULT 'captured'::text,
notes text,
CHECK ((nonempty_row_count >= 0)),
PRIMARY KEY (id),
CHECK ((sheet_count >= 0)),
CHECK ((status = ANY (ARRAY['captured'::text, 'imported'::text, 'validated'::text, 'failed'::text]))));
create table public.jaeger_api_cache (cache_key text NOT NULL,
fn text NOT NULL,
args jsonb NOT NULL DEFAULT '[]'::jsonb,
response jsonb NOT NULL,
response_hash text NOT NULL,
source_refreshed_at timestamp with time zone NOT NULL,
expires_at timestamp with time zone NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
generation bigint NOT NULL DEFAULT 0,
CHECK ((jsonb_typeof(args) = 'array'::text)),
PRIMARY KEY (cache_key),
CHECK ((jsonb_typeof(response) = 'object'::text)));
create table public.jaeger_cache_control (id smallint NOT NULL,
generation bigint NOT NULL DEFAULT 0,
invalidated_at timestamp with time zone NOT NULL DEFAULT now(),
CHECK ((generation >= 0)),
PRIMARY KEY (id),
CHECK ((id = 1)));
create table public.jaeger_read_parity_checks (check_id bigint NOT NULL,
fn text NOT NULL,
args jsonb NOT NULL DEFAULT '[]'::jsonb,
matches boolean NOT NULL,
diff_count integer NOT NULL DEFAULT 0,
diff_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
sheets_hash text NOT NULL,
native_hash text NOT NULL,
sheets_ms integer,
native_ms integer,
source_refreshed_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
PRIMARY KEY (check_id));
CREATE OR REPLACE FUNCTION jaeger_private.apply_balance_delta(p_balance_id text, p_delta numeric, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_balance_id is null or p_delta = 0 then return; end if;
  update jaeger.balance_items
  set adjustment_delta = adjustment_delta + p_delta,
      current_value = current_value + p_delta,
      request_id = p_request_id
  where balance_id = p_balance_id and active;
  if not found then
    raise exception 'Balance activo no encontrado: %', p_balance_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.apply_movement_balance_impacts(p_kind text, p_subcategory text, p_balance_id text, p_amount numeric, p_direction numeric, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_primary_sign numeric := jaeger_private.stored_movement_sign(
    p_kind, p_subcategory, p_balance_id
  );
  v_primary_type text;
  v_primary_op text;
  v_impacts jsonb := '[]'::jsonb;
  v_land_asset_id constant text := '10102.06';
  v_land_liability_id constant text := '2010401.3';
  v_land_asset_type text;
begin
  if coalesce(p_amount, 0) < 0 then
    raise exception 'El monto de impacto no puede ser negativo';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Direccion de impacto invalida';
  end if;

  if coalesce(v_primary_sign, 0) <> 0 then
    select balance_type into v_primary_type
    from jaeger.balance_items
    where balance_id = p_balance_id and active;
    if not found then
      raise exception 'Balance activo no encontrado: %', p_balance_id;
    end if;
    v_primary_op := case when v_primary_type = 'Activo' then 'activo' else 'pasivo' end;
    perform jaeger_private.apply_balance_delta(
      p_balance_id,
      p_amount * v_primary_sign * p_direction,
      p_request_id
    );
    v_impacts := v_impacts || jsonb_build_array(jsonb_build_object(
      'codigo', p_balance_id,
      'op', v_primary_op,
      'signo', v_primary_sign * p_direction
    ));
  end if;

  if lower(btrim(coalesce(p_kind, ''))) = 'deuda'
     and p_balance_id = v_land_liability_id then
    select balance_type into v_land_asset_type
    from jaeger.balance_items
    where balance_id = v_land_asset_id and active;
    if not found or v_land_asset_type <> 'Activo' then
      raise exception 'El activo Pago Terreno no esta disponible: %', v_land_asset_id;
    end if;
    perform jaeger_private.apply_balance_delta(
      v_land_asset_id,
      p_amount * p_direction,
      p_request_id
    );
    v_impacts := v_impacts || jsonb_build_array(jsonb_build_object(
      'codigo', v_land_asset_id,
      'op', 'activo',
      'signo', p_direction
    ));
  end if;

  return v_impacts;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.audit_operational_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.business_now()
 RETURNS timestamp without time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select now() at time zone 'America/Guayaquil';
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.business_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (now() at time zone 'America/Guayaquil')::date;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.create_movement(p_payload jsonb, p_request_id uuid, p_forced_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id text := coalesce(nullif(btrim(p_forced_id),''), gen_random_uuid()::text);
  v_date date := nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  v_month text := jaeger_private.normalize_month(p_payload->>'mes');
  v_cash text;
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_category text;
  v_sub text := btrim(coalesce(p_payload->>'subcategoria',''));
  v_amount numeric := replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
  v_effect jsonb;
  v_impacts jsonb;
  v_order integer;
begin
  if v_amount <= 0 then raise exception 'Monto invalido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end, v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes economico no encontrado: %',v_month; end if;
  if not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes de caja no encontrado: %',v_cash; end if;
  v_category := coalesce(nullif(btrim(p_payload->>'categoria'),''),v_kind);
  v_effect := jaeger_private.resolve_movement_effect(p_payload,p_request_id);
  select coalesce(max(source_row_number),1)+1 into v_order from jaeger.financial_movements;
  insert into jaeger.financial_movements (
    legacy_id, source_row_number, recorded_at, economic_month, kind, category, subcategory,
    amount, transaction_date, notes, cash_month, balance_id, balance_type, balance_name,
    balance_group, source_kind, request_id
  ) values (
    v_id,v_order,now(),v_month,v_kind,v_category,v_sub,v_amount,v_date,
    nullif(coalesce(p_payload->>'notas',''),''),v_cash,v_effect->>'balanceId',
    v_effect->>'balanceType',v_effect->>'balanceName',v_effect->>'balanceGroup','supabase',p_request_id
  );
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_kind, v_sub, v_effect->>'balanceId', v_amount, 1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',v_id,'mesCaja',v_cash,'mes',v_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_amount);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.delete_movement(p_id text, p_request_id uuid, p_allow_card_link boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_old jaeger.financial_movements%rowtype;
  v_impacts jsonb;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if not p_allow_card_link and exists(select 1 from jaeger.card_events where movement_legacy_id=p_id) then
    raise exception 'Movimiento vinculado a tarjeta; editalo o eliminalo desde Tarjetas';
  end if;
  delete from jaeger.financial_movements where legacy_id=p_id;
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_old.kind, v_old.subcategory, v_old.balance_id, v_old.amount, -1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',p_id,'mesCaja',v_old.cash_month,'mes',v_old.economic_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_old.amount);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.ensure_month(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_month text := jaeger_private.normalize_month(p_value);
  v_start date := jaeger_private.month_start(p_value);
begin
  insert into jaeger.months(month_key,year,month_number,starts_on)
  values(v_month,extract(year from v_start)::smallint,extract(month from v_start)::smallint,v_start)
  on conflict(month_key) do nothing;
  return v_month;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.month_from_date(p_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_date)::integer]
    || ' ' || to_char(p_date, 'YY')
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.month_name(p_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_date)::integer]
    || ' ' || to_char(p_date,'YY')
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.month_start(p_value text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_month text := jaeger_private.normalize_month(p_value);
  v_number integer;
  v_year integer;
begin
  v_number := array_position(array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'], split_part(v_month,' ',1));
  v_year := 2000 + right(v_month,2)::integer;
  if v_number is null then raise exception 'Mes invÃ¡lido: %', p_value; end if;
  return make_date(v_year,v_number,1);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.new_balance_item(p_type text, p_name text, p_value numeric, p_group text, p_note text, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id text := 'ITEM-' || case when p_type='Pasivo' then 'P-' else 'A-' end ||
    floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '-' || left(gen_random_uuid()::text,8);
  v_order integer;
begin
  if btrim(coalesce(p_name,''))='' then raise exception 'Escribe el nombre'; end if;
  select coalesce(max(sort_order),0)+1 into v_order from jaeger.balance_items
  where balance_type=p_type and coalesce(group_name,'')=coalesce(p_group,'') and active;
  insert into jaeger.balance_items(balance_id,name,balance_type,base_value,adjustment_delta,current_value,
    group_name,sort_order,active,custom,note,source_kind,request_id,source_row_number)
  values(v_id,btrim(p_name),p_type,greatest(coalesce(p_value,0),0),0,greatest(coalesce(p_value,0),0),
    coalesce(nullif(btrim(p_group),''),case when p_type='Pasivo' then 'PrÃ©stamos' else 'Activos Financieros' end),
    v_order,true,true,nullif(btrim(coalesce(p_note,'')),''),'supabase',p_request_id,
    (select coalesce(max(source_row_number),0)+1 from jaeger.balance_items));
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.normalize_month(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_parts text[];
  v_name text;
  v_year text;
begin
  v_parts := regexp_split_to_array(btrim(coalesce(p_value, '')), '\s+');
  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return btrim(coalesce(p_value, ''));
  end if;
  v_name := case lower(v_parts[1])
    when 'enero' then 'Enero' when 'ene' then 'Enero'
    when 'febrero' then 'Febrero' when 'feb' then 'Febrero'
    when 'marzo' then 'Marzo' when 'mar' then 'Marzo'
    when 'abril' then 'Abril' when 'abr' then 'Abril'
    when 'mayo' then 'Mayo' when 'may' then 'Mayo'
    when 'junio' then 'Junio' when 'jun' then 'Junio'
    when 'julio' then 'Julio' when 'jul' then 'Julio'
    when 'agosto' then 'Agosto' when 'ago' then 'Agosto'
    when 'septiembre' then 'Septiembre' when 'sep' then 'Septiembre'
    when 'octubre' then 'Octubre' when 'oct' then 'Octubre'
    when 'noviembre' then 'Noviembre' when 'nov' then 'Noviembre'
    when 'diciembre' then 'Diciembre' when 'dic' then 'Diciembre'
    else initcap(v_parts[1])
  end;
  v_year := regexp_replace(v_parts[2], '[^0-9]', '', 'g');
  if length(v_year) = 4 then v_year := right(v_year, 2); end if;
  if length(v_year) = 1 then v_year := '0' || v_year; end if;
  return v_name || ' ' || v_year;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.record_balance_change(p_balance_id text, p_name text, p_type text, p_action text, p_previous numeric, p_new numeric, p_note text, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into jaeger.balance_log(source_row_number,source_timestamp,balance_id,name,balance_type,action,
    previous_value,new_value,note,source_kind,request_id)
  values((select coalesce(max(source_row_number),0)+1 from jaeger.balance_log),
    to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),p_balance_id,p_name,p_type,
    p_action,p_previous,p_new,nullif(btrim(coalesce(p_note,'')),''),'supabase',p_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.remove_future_liquidated_installment_plans()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.resolve_movement_effect(p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo', '')));
  v_sub text := btrim(coalesce(p_payload->>'subcategoria', ''));
  v_balance_code text := nullif(btrim(coalesce(p_payload->>'balanceCodigo', '')), '');
  v_new_name text := nullif(btrim(coalesce(p_payload->>'balanceNombreNuevo', '')), '');
  v_item record;
  v_balance record;
  v_sign numeric := 0;
  v_op text;
begin
  if v_kind not in ('ingreso','necesidad','deseo','deuda','ahorro') then
    raise exception 'Tipo de movimiento invÃ¡lido';
  end if;
  if v_sub = '' then raise exception 'SubcategorÃ­a requerida'; end if;

  if v_kind in ('ahorro','deuda') then
    select * into v_item
    from jaeger.catalog_items
    where kind = v_kind and state = 'activo' and lower(btrim(name)) = lower(v_sub)
    order by sort_order, legacy_id
    limit 1;
    if not found then
      raise exception 'No existe una asignaciÃ³n activa para %: %', v_kind, v_sub;
    end if;
    v_balance_code := v_item.balance_id;
    if v_balance_code is null and lower(coalesce(v_item.group_name,'')) = lower('Pasivos Fijos') then
      return jsonb_build_object('balanceId', null, 'balanceType', coalesce(v_item.balance_type,''),
        'balanceName', coalesce(v_item.balance_name,v_sub), 'balanceGroup', coalesce(v_item.group_name,''),
        'sign', 0, 'op', case when v_kind='ahorro' then 'activo' else 'pasivo' end);
    end if;
    v_sign := case when v_kind='ahorro' then 1 else -1 end;
  elsif v_kind = 'necesidad' and v_balance_code is not null then
    v_sign := 1;
  elsif v_kind = 'ingreso' and lower(v_sub) = lower('DevoluciÃ³n de ahorro') then
    if v_balance_code is null then raise exception 'Selecciona el ahorro de origen'; end if;
    v_sign := -1;
  elsif v_kind = 'ingreso' and lower(v_sub) = lower('PrÃ©stamos recibidos') then
    if v_new_name is not null then
      insert into jaeger.balance_items (
        name, balance_type, base_value, adjustment_delta, current_value, group_name,
        sort_order, active, custom, note, source_kind, request_id, source_row_number
      ) values (
        v_new_name, 'Pasivo', 0, 0, 0,
        coalesce(nullif(btrim(p_payload->>'balanceGrupoNuevo'),''), 'PrÃ©stamos'),
        (select coalesce(max(sort_order),0)+1 from jaeger.balance_items where balance_type='Pasivo'),
        true, true, 'Creado desde PrÃ©stamos recibidos', 'supabase', p_request_id,
        (select coalesce(max(source_row_number),1)+1 from jaeger.balance_items)
      ) returning balance_id into v_balance_code;
    end if;
    if v_balance_code is null then raise exception 'Selecciona o crea el pasivo de destino'; end if;
    v_sign := 1;
  end if;

  if v_balance_code is null then
    return jsonb_build_object('balanceId', null, 'balanceType', null, 'balanceName', null,
      'balanceGroup', null, 'sign', 0, 'op', null);
  end if;
  select balance_id, name, balance_type, group_name into v_balance
  from jaeger.balance_items where balance_id = v_balance_code and active;
  if not found then raise exception 'Balance activo no encontrado: %', v_balance_code; end if;
  if v_kind in ('ahorro','necesidad') or (v_kind='ingreso' and lower(v_sub)=lower('DevoluciÃ³n de ahorro')) then
    if v_balance.balance_type <> 'Activo' then raise exception 'El balance seleccionado debe ser Activo'; end if;
  end if;
  if v_kind='deuda' or (v_kind='ingreso' and lower(v_sub)=lower('PrÃ©stamos recibidos')) then
    if v_balance.balance_type <> 'Pasivo' then raise exception 'El balance seleccionado debe ser Pasivo'; end if;
  end if;
  v_op := case when v_balance.balance_type='Activo' then 'activo' else 'pasivo' end;
  return jsonb_build_object('balanceId',v_balance.balance_id,'balanceType',v_balance.balance_type,
    'balanceName',v_balance.name,'balanceGroup',coalesce(v_balance.group_name,''),'sign',v_sign,'op',v_op);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.stored_movement_sign(p_kind text, p_subcategory text, p_balance_id text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_balance_id is null or btrim(p_balance_id) = '' then 0
    when p_kind = 'ahorro' then 1
    when p_kind = 'deuda' then -1
    when p_kind = 'necesidad' then 1
    when p_kind = 'ingreso' and lower(btrim(p_subcategory)) = lower('DevoluciÃ³n de ahorro') then -1
    when p_kind = 'ingreso' and lower(btrim(p_subcategory)) = lower('PrÃ©stamos recibidos') then 1
    else 0
  end
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.touch_operational_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.update_movement(p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_old jaeger.financial_movements%rowtype;
  v_date date := nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  v_month text := jaeger_private.normalize_month(p_payload->>'mes');
  v_cash text;
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_category text;
  v_sub text := btrim(coalesce(p_payload->>'subcategoria',''));
  v_amount numeric := replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
  v_effect jsonb;
  v_impacts jsonb;
begin
  select * into v_old from jaeger.financial_movements where legacy_id=p_payload->>'id' for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if v_amount <= 0 then raise exception 'Monto invalido'; end if;
  v_cash := jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),
    case when v_date is not null then jaeger_private.month_from_date(v_date) end,v_month));
  if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes economico no encontrado: %',v_month; end if;
  if not exists(select 1 from jaeger.months where month_key=v_cash) then raise exception 'Mes de caja no encontrado: %',v_cash; end if;
  v_category := coalesce(nullif(btrim(p_payload->>'categoria'),''),v_kind);
  v_effect := jaeger_private.resolve_movement_effect(p_payload,p_request_id);
  perform jaeger_private.apply_movement_balance_impacts(
    v_old.kind, v_old.subcategory, v_old.balance_id, v_old.amount, -1, p_request_id
  );
  update jaeger.financial_movements set economic_month=v_month,kind=v_kind,category=v_category,
    subcategory=v_sub,amount=v_amount,transaction_date=v_date,notes=nullif(coalesce(p_payload->>'notas',''),''),
    cash_month=v_cash,balance_id=v_effect->>'balanceId',balance_type=v_effect->>'balanceType',
    balance_name=v_effect->>'balanceName',balance_group=v_effect->>'balanceGroup',request_id=p_request_id
  where legacy_id=v_old.legacy_id;
  v_impacts := jaeger_private.apply_movement_balance_impacts(
    v_kind, v_sub, v_effect->>'balanceId', v_amount, 1, p_request_id
  );
  return jsonb_build_object('ok',true,'id',v_old.legacy_id,'mesCaja',v_cash,'mes',v_month,
    'oldMes',v_old.economic_month,'oldMesCaja',v_old.cash_month,
    'balanceImpactos',v_impacts,'balanceMonto',v_amount);
end;
$function$;

CREATE OR REPLACE FUNCTION jaeger_private.upsert_catalog_item(p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kind text := lower(btrim(coalesce(p_payload->>'tipo','')));
  v_name text := btrim(coalesce(p_payload->>'nombre',''));
  v_old text := btrim(coalesce(p_payload->>'oldNombre',p_payload->>'item',v_name));
  v_state text := case when lower(coalesce(p_payload->>'estado','activo'))='inactivo' then 'inactivo' else 'activo' end;
  v_type text;
  v_balance_id text := nullif(btrim(coalesce(p_payload->>'balanceCodigo','')),'');
  v_new_balance text := nullif(btrim(coalesce(p_payload->>'balanceNombreNuevo','')),'');
  v_group text := nullif(btrim(coalesce(p_payload->>'balanceGrupo',p_payload->>'grupo','')),'');
  v_balance_name text;
  v_item jaeger.catalog_items%rowtype;
  v_id text;
  v_order integer;
begin
  if v_kind not in ('ahorro','deuda') then return jsonb_build_object('ok',true); end if;
  if v_name='' then raise exception 'Escribe el nombre'; end if;
  v_type := case when v_kind='ahorro' then 'Activo' else 'Pasivo' end;
  v_group := coalesce(v_group,case when v_type='Pasivo' then 'PrÃ©stamos' else 'Activos Financieros' end);
  if v_new_balance is not null then
    v_balance_id := jaeger_private.new_balance_item(v_type,v_new_balance,0,v_group,'Creado desde catÃ¡logo',p_request_id);
  end if;
  if v_balance_id is null and not (v_kind='deuda' and lower(v_group)=lower('Pasivos Fijos')) then
    raise exception 'Asigna un % del balance',case when v_type='Activo' then 'activo' else 'pasivo' end;
  end if;
  if v_balance_id is not null then
    select name into v_balance_name from jaeger.balance_items
    where balance_id=v_balance_id and balance_type=v_type and active for share;
    if not found then raise exception 'Destino de balance no encontrado'; end if;
  end if;
  select * into v_item from jaeger.catalog_items where kind=v_kind and lower(btrim(name))=lower(v_old)
  order by sort_order,legacy_id limit 1 for update;
  if not found then
    select * into v_item from jaeger.catalog_items where kind=v_kind and lower(btrim(name))=lower(v_name)
    order by sort_order,legacy_id limit 1 for update;
  end if;
  select coalesce(nullif((p_payload->>'orden')::integer,0),coalesce(max(sort_order),0)+1)
    into v_order from jaeger.catalog_items where kind=v_kind;
  if found and v_item.legacy_id is not null then
    update jaeger.catalog_items set name=v_name,state=v_state,balance_type=v_type,balance_id=v_balance_id,
      balance_name=v_balance_name,group_name=v_group,sort_order=coalesce(nullif((p_payload->>'orden')::integer,0),v_item.sort_order),
      note=nullif(btrim(coalesce(p_payload->>'nota','')),''),source_kind='supabase',request_id=p_request_id
    where legacy_id=v_item.legacy_id returning legacy_id into v_id;
  else
    v_id := 'CAT-'||v_kind||'-'||left(gen_random_uuid()::text,18);
    insert into jaeger.catalog_items(legacy_id,kind,name,state,balance_type,balance_id,balance_name,group_name,
      sort_order,note,source_kind,request_id,source_row_number)
    values(v_id,v_kind,v_name,v_state,v_type,v_balance_id,v_balance_name,v_group,v_order,
      nullif(btrim(coalesce(p_payload->>'nota','')),''),'supabase',p_request_id,
      (select coalesce(max(source_row_number),0)+1 from jaeger.catalog_items));
  end if;
  return jsonb_build_object('ok',true,'item',jsonb_build_object('id',v_id,'tipo',v_kind,'nombre',v_name,
    'estado',v_state,'balanceTipo',v_type,'balanceId',coalesce(v_balance_id,''),
    'balanceNombre',coalesce(v_balance_name,''),'grupo',v_group));
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_card_read_source(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_card text;
  v_result jsonb;
begin
  if p_fn not in ('getTarjetasState','parseTarjetas','getMovimientosTarjeta') then
    raise exception 'Lectura de tarjetas no permitida';
  end if;
  if jsonb_typeof(coalesce(p_args, '[]'::jsonb)) <> 'array' then
    raise exception 'Argumentos invalidos';
  end if;
  v_card := nullif(btrim(coalesce(p_args ->> 1, p_args -> 0 ->> 'tarjeta', '')), '');
  v_result := jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil'
  );
  return v_result || jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.card_code)
      from (
        select card_code, display_name, issuer, last_four, network, card_style, active, sort_order
        from jaeger.credit_cards where active
      ) x
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.card_code, x.year, x.month_number, x.sort_order)
      from (
        select card_code, year, month_number, month_key, sort_order, concept, amount
        from jaeger.card_history_effective
      ) x
    ), '[]'::jsonb),
    'installments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.card_code, x.source_row_number)
      from (
        select legacy_id, source_row_number, card_code, name, initial_balance,
               installment_amount, installments_at_base_month, base_month, state,
               liquidation_month, balance_id
        from jaeger.card_installments
      ) x
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.source_row_number)
      from (
        select legacy_id, source_row_number, recorded_at, month_key, card_code,
               event_type, amount, transaction_date, notes, origin,
               movement_legacy_id, category, subcategory, charge_legacy_id,
               installment_legacy_id
        from jaeger.card_events
        where v_card is null or card_code = v_card
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_config_write(p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_allowed constant text[] := array[
    'guardarTarjetaConfiguracion','eliminarTarjetaConfiguracion',
    'ordenarTarjetaConfiguracion','guardarAsignacionMeta'
  ];
  v_existing jaeger.operation_requests%rowtype;
  v_card jaeger.credit_cards%rowtype;
  v_neighbor jaeger.credit_cards%rowtype;
  v_asset jaeger.balance_items%rowtype;
  v_result jsonb := jsonb_build_object('ok', true);
  v_code text;
  v_name text;
  v_issuer text;
  v_last_four text;
  v_network text;
  v_style text;
  v_goal text;
  v_balance_id text;
  v_amount numeric;
  v_order integer;
  v_direction integer;
  v_active boolean;
  v_linked_events integer;
  v_linked_installments integer;
begin
  if not (p_operation = any(v_allowed)) then
    raise exception 'Escritura de configuracion no implementada: %', p_operation;
  end if;
  if p_request_id is null or btrim(coalesce(p_payload_hash, '')) = '' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Carga de configuracion invalida';
  end if;

  insert into jaeger.operation_requests(request_id, operation, payload_hash, status)
  values (p_request_id, p_operation, p_payload_hash, 'pending')
  on conflict (request_id) do nothing;
  select * into v_existing
  from jaeger.operation_requests
  where request_id = p_request_id
  for update;
  if v_existing.operation <> p_operation or v_existing.payload_hash <> p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operacion';
  end if;
  if v_existing.status = 'completed' then
    return v_existing.response;
  end if;
  perform set_config('jaeger.request_id', p_request_id::text, true);

  if p_operation = 'guardarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    v_name := btrim(coalesce(p_payload ->> 'nombre', ''));
    v_issuer := nullif(btrim(coalesce(p_payload ->> 'emisor', '')), '');
    v_last_four := regexp_replace(coalesce(p_payload ->> 'ultimos4', ''), '\D', '', 'g');
    v_network := lower(btrim(coalesce(p_payload ->> 'red', 'other')));
    v_style := lower(btrim(coalesce(p_payload ->> 'estilo', 'generic-card')));
    v_active := coalesce((p_payload ->> 'activo')::boolean, true);
    if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,15}$' then
      raise exception 'El codigo debe tener entre 2 y 16 letras, numeros, guion o guion bajo';
    end if;
    if length(v_name) < 1 or length(v_name) > 80 then
      raise exception 'Escribe un nombre valido para la tarjeta';
    end if;
    if v_last_four !~ '^[0-9]{4}$' then
      raise exception 'Los ultimos cuatro digitos son obligatorios';
    end if;
    if v_network not in ('visa','mastercard','amex','diners','discover','other') then
      raise exception 'Red de tarjeta no valida';
    end if;
    if v_style not in ('visa-card','mc-card','sky-card','emerald-card','violet-card','graphite-card','generic-card') then
      raise exception 'Estilo de tarjeta no valido';
    end if;
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if found then
      update jaeger.credit_cards
      set display_name = v_name,
          issuer = v_issuer,
          last_four = v_last_four,
          network = v_network,
          card_style = v_style,
          active = v_active,
          request_id = p_request_id
      where card_code = v_code;
    else
      select coalesce(max(sort_order), 0) + 1 into v_order from jaeger.credit_cards;
      insert into jaeger.credit_cards (
        card_code, display_name, issuer, last_four, network, card_style,
        active, sort_order, request_id
      ) values (
        v_code, v_name, v_issuer, v_last_four, v_network, v_style,
        true, v_order, p_request_id
      );
    end if;
    v_result := jsonb_build_object('ok', true, 'codigo', v_code, 'activo', v_active);

  elsif p_operation = 'eliminarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if not found then raise exception 'Tarjeta no encontrada'; end if;
    if v_card.active and (select count(*) from jaeger.credit_cards where active) <= 1 then
      raise exception 'Debe permanecer al menos una tarjeta activa';
    end if;
    select count(*) into v_linked_events from jaeger.card_events where card_code = v_code;
    select count(*) into v_linked_installments from jaeger.card_installments where card_code = v_code;
    update jaeger.credit_cards
    set active = false, request_id = p_request_id
    where card_code = v_code;
    v_result := jsonb_build_object(
      'ok', true,
      'codigo', v_code,
      'archivada', true,
      'eventosConservados', v_linked_events,
      'diferidosConservados', v_linked_installments
    );

  elsif p_operation = 'ordenarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    v_direction := case when coalesce((p_payload ->> 'direccion')::integer, 1) < 0 then -1 else 1 end;
    select * into v_card from jaeger.credit_cards where card_code = v_code for update;
    if not found then raise exception 'Tarjeta no encontrada'; end if;
    if v_direction < 0 then
      select * into v_neighbor
      from jaeger.credit_cards
      where active and (sort_order < v_card.sort_order or (sort_order = v_card.sort_order and card_code < v_card.card_code))
      order by sort_order desc, card_code desc limit 1 for update;
    else
      select * into v_neighbor
      from jaeger.credit_cards
      where active and (sort_order > v_card.sort_order or (sort_order = v_card.sort_order and card_code > v_card.card_code))
      order by sort_order, card_code limit 1 for update;
    end if;
    if found then
      update jaeger.credit_cards set sort_order = v_neighbor.sort_order, request_id = p_request_id
      where card_code = v_card.card_code;
      update jaeger.credit_cards set sort_order = v_card.sort_order, request_id = p_request_id
      where card_code = v_neighbor.card_code;
    end if;
    v_result := jsonb_build_object('ok', true, 'codigo', v_code);

  elsif p_operation = 'guardarAsignacionMeta' then
    v_goal := lower(btrim(coalesce(p_payload ->> 'meta', 'japan')));
    v_balance_id := btrim(coalesce(p_payload ->> 'balanceCodigo', ''));
    v_amount := round(greatest(replace(btrim(coalesce(p_payload ->> 'monto', '0')), ',', '.')::numeric, 0), 2);
    if v_goal <> 'japan' then raise exception 'Meta no permitida'; end if;
    if v_balance_id = '' then raise exception 'Selecciona un activo'; end if;
    if v_amount <= 0 then
      delete from jaeger.goal_asset_allocations
      where goal_key = v_goal and balance_id = v_balance_id;
      v_result := jsonb_build_object('ok', true, 'meta', v_goal, 'balanceCodigo', v_balance_id, 'eliminada', true);
    else
      select * into v_asset
      from jaeger.balance_items
      where balance_id = v_balance_id and balance_type = 'Activo' and active
      for update;
      if not found then raise exception 'Activo no encontrado o inactivo'; end if;
      if v_amount - v_asset.current_value > 0.004 then
        raise exception 'La asignacion no puede superar el valor actual del activo (%)', v_asset.current_value;
      end if;
      insert into jaeger.goal_asset_allocations (
        goal_key, balance_id, allocated_amount, request_id
      ) values (
        v_goal, v_balance_id, v_amount, p_request_id
      )
      on conflict (goal_key, balance_id) do update
      set allocated_amount = excluded.allocated_amount,
          request_id = excluded.request_id;
      v_result := jsonb_build_object(
        'ok', true,
        'meta', v_goal,
        'balanceCodigo', v_balance_id,
        'monto', v_amount
      );
    end if;
  end if;

  update jaeger.operation_requests
  set status = 'completed', response = v_result, error_message = null,
      completed_at = now(), updated_at = now()
  where request_id = p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$function$;

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
          a.allocated_amount,
          case when b.active then least(a.allocated_amount, greatest(b.current_value, 0)) else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

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
        select source_row_number, section, name, budget, actual, remaining
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
          a.allocated_amount,
          b.current_value as asset_value,
          b.active as asset_active,
          case when b.active then least(a.allocated_amount, greatest(b.current_value, 0)) else 0 end
            as effective_amount
        from jaeger.goal_asset_allocations a
        join jaeger.balance_items b on b.balance_id = a.balance_id
        where a.goal_key = 'japan'
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_invalidate_api_cache()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  next_generation bigint;
begin
  update public.jaeger_cache_control
  set generation = generation + 1,
      invalidated_at = now()
  where id = 1
  returning generation into next_generation;

  delete from public.jaeger_api_cache
  where generation < next_generation;

  return next_generation;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_mark_native_reads_ready(p_reason text DEFAULT 'validated_parity'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
begin
  update jaeger.system_settings
  set setting_value = (setting_value - 'stale_at' - 'stale_reason') || jsonb_build_object(
        'fresh', true,
        'validated_at', now(),
        'validation_reason', left(coalesce(nullif(btrim(p_reason), ''), 'validated_parity'), 120)
      ),
      updated_at = now()
  where setting_key = 'native_read.state'
  returning setting_value into v_state;

  if v_state is null then
    raise exception 'Estado de lecturas nativas no configurado';
  end if;
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_mark_native_reads_stale(p_reason text DEFAULT 'legacy_write'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
begin
  update jaeger.system_settings
  set setting_value = setting_value || jsonb_build_object(
        'fresh', false,
        'stale_at', now(),
        'stale_reason', left(coalesce(nullif(btrim(p_reason), ''), 'legacy_write'), 120)
      ),
      updated_at = now()
  where setting_key = 'native_read.state'
  returning setting_value into v_state;

  if v_state is null then
    raise exception 'Estado de lecturas nativas no configurado';
  end if;
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_native_read_source(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month text;
  v_card text;
  v_result jsonb;
begin
  if p_fn not in (
    'getMesesDisponibles', 'getMesData', 'getMovimientosMes',
    'getPinturasMes', 'getViajeJapon', 'getFlujoCaja',
    'getBalanceGeneral', 'getTarjetasState', 'parseTarjetas',
    'getMovimientosTarjeta', 'getDesgloseSub'
  ) then
    raise exception 'Lectura nativa no permitida';
  end if;

  if jsonb_typeof(coalesce(p_args, '[]'::jsonb)) <> 'array' then
    raise exception 'Argumentos invalidos';
  end if;

  v_month := nullif(btrim(coalesce(p_args ->> 0, p_args -> 0 ->> 'mes', '')), '');
  v_card := nullif(btrim(coalesce(p_args ->> 1, p_args -> 0 ->> 'tarjeta', '')), '');

  v_result := jsonb_build_object(
    'fn', p_fn,
    'args', coalesce(p_args, '[]'::jsonb),
    'generatedAt', now(),
    'timezone', 'America/Guayaquil'
  );

  if p_fn = 'getMesesDisponibles' then
    return v_result || jsonb_build_object(
      'months', coalesce((
        select jsonb_agg(month_key order by year_number, month_number)
        from (
          select distinct m.month_key,
            2000 + right(m.month_key, 2)::integer as year_number,
            array_position(
              array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
              split_part(m.month_key, ' ', 1)
            ) as month_number
          from jaeger.monthly_plan_items m
        ) months
      ), '[]'::jsonb)
    );
  end if;

  if p_fn in ('getMesData', 'getMovimientosMes', 'getDesgloseSub') then
    return v_result || jsonb_build_object(
      'month', v_month,
      'planItems', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
        from (
          select source_row_number, section, name, budget, actual, remaining, due_text
          from jaeger.monthly_plan_items where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'summaryValues', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, metric, budget, actual
          from jaeger.monthly_summary_values where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'distributionMetrics', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, metric, estimated_pct, estimated_value, actual_pct, actual_value
          from jaeger.monthly_distribution_metrics where month_key = v_month
        ) x
      ), '[]'::jsonb),
      'movements', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select legacy_id, source_row_number, recorded_at, economic_month, kind, category,
                 subcategory, amount, transaction_date, notes, cash_month
          from jaeger.financial_movements where economic_month = v_month
        ) x
      ), '[]'::jsonb),
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows
        ) x
      ), '[]'::jsonb),
      'allMovementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 economic_month, kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by economic_month, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getPinturasMes' then
    return v_result || jsonb_build_object(
      'month', v_month,
      'painting', coalesce((
        select to_jsonb(x) from (
          select opening_stock, added_stock, current_stock, self_consumption, discounted
          from jaeger.paintings_months where month_key = v_month limit 1
        ) x
      ), '{}'::jsonb)
    );
  end if;

  if p_fn = 'getViajeJapon' then
    return v_result || jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number, x.section)
        from (
          select source_row_number, section, name, budget, actual, remaining
          from jaeger.japan_budget_items
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getFlujoCaja' then
    return v_result || jsonb_build_object(
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows) x
      ), '[]'::jsonb),
      'movementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by month_number, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn = 'getBalanceGeneral' then
    return v_result || jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.balance_type, x.sort_order)
        from (select balance_type, name, sort_order, active from jaeger.balance_groups) x
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.balance_type, x.sort_order, x.source_row_number)
        from (
          select balance_id, source_row_number, name, balance_type, current_value,
                 group_name, sort_order, active, custom
          from jaeger.balance_items
        ) x
      ), '[]'::jsonb),
      'changes', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number desc)
        from (
          select source_row_number, source_timestamp, balance_id, name, balance_type,
                 action, previous_value, new_value, note
          from jaeger.balance_log order by source_row_number desc limit 6
        ) x
      ), '[]'::jsonb),
      'cashFlow', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (select source_row_number, label, monthly_values, total from jaeger.cash_flow_rows) x
      ), '[]'::jsonb),
      'movementTotals', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.month_number, x.kind, x.subcategory)
        from (
          select array_position(
                   array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                   split_part(economic_month, ' ', 1)
                 ) month_number,
                 kind, subcategory, sum(amount) amount
          from jaeger.financial_movements
          group by month_number, kind, subcategory
        ) x
      ), '[]'::jsonb)
    );
  end if;

  if p_fn in ('getTarjetasState', 'parseTarjetas', 'getMovimientosTarjeta') then
    return v_result || jsonb_build_object(
      'history', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.card_code, x.year, x.month_number, x.sort_order)
        from (
          select card_code, year, month_number, month_key, sort_order, concept, amount
          from jaeger.card_history_effective
        ) x
      ), '[]'::jsonb),
      'installments', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.card_code, x.source_row_number)
        from (
          select legacy_id, source_row_number, card_code, name, initial_balance,
                 installment_amount, installments_at_base_month, base_month, state,
                 liquidation_month, balance_id
          from jaeger.card_installments
        ) x
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.source_row_number)
        from (
          select legacy_id, source_row_number, recorded_at, month_key, card_code,
                 event_type, amount, transaction_date, notes, origin,
                 movement_legacy_id, category, subcategory, charge_legacy_id,
                 installment_legacy_id
          from jaeger.card_events
          where (v_card is null or card_code = v_card)
        ) x
      ), '[]'::jsonb)
    );
  end if;

  raise exception 'Lectura nativa sin implementacion';
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_native_read_source_extended(p_fn text, p_args jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_card text := upper(nullif(btrim(coalesce(p_args->>0,'')),''));
  v_result jsonb := jsonb_build_object('fn',p_fn,'args',coalesce(p_args,'[]'::jsonb),
    'generatedAt',now(),'timezone','America/Guayaquil');
begin
  if jsonb_typeof(coalesce(p_args,'[]'::jsonb))<>'array' then raise exception 'Argumentos invÃ¡lidos'; end if;
  if p_fn='getCatalogoFinanciero' then
    return v_result||jsonb_build_object(
      'catalog',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name) from (
        select legacy_id,kind,name,state,balance_type,balance_id,balance_name,group_name,sort_order,note
        from jaeger.catalog_items) x),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(to_jsonb(x) order by x.balance_type,x.sort_order) from (
        select balance_type,name,sort_order,active from jaeger.balance_groups) x),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.balance_type,x.sort_order,x.source_row_number) from (
        select balance_id,source_row_number,name,balance_type,current_value,group_name,sort_order,active,custom
        from jaeger.balance_items) x),'[]'::jsonb),
      'cashFlow',coalesce((select jsonb_agg(to_jsonb(x) order by x.source_row_number) from (
        select source_row_number,label,monthly_values,total from jaeger.cash_flow_rows) x),'[]'::jsonb),
      'movementTotals',coalesce((select jsonb_agg(to_jsonb(x) order by x.month_number,x.kind,x.subcategory) from (
        select array_position(array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],split_part(economic_month,' ',1)) month_number,
          kind,subcategory,sum(amount) amount from jaeger.financial_movements group by 1,kind,subcategory) x),'[]'::jsonb)
    );
  elsif p_fn='getDiferidosTdc' then
    return v_result||jsonb_build_object('installments',coalesce((select jsonb_agg(to_jsonb(x) order by x.source_row_number) from (
      select legacy_id,source_row_number,card_code,name,initial_balance,installment_amount,
        installments_at_base_month,base_month,state,liquidation_month,balance_id
      from jaeger.card_installments where state='activo' and (v_card is null or card_code=v_card)) x),'[]'::jsonb));
  elsif p_fn='getNotificaciones' then
    return v_result||jsonb_build_object('notifications',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (
      select notification_id,title,message,occurred_at,business_date,read_at from jaeger.notifications
      where expires_at is null or expires_at>now()) x),'[]'::jsonb));
  end if;
  raise exception 'Lectura nativa extendida no implementada: %',p_fn;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_native_read_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select setting_value
      from jaeger.system_settings
      where setting_key = 'native_read.state'
    ),
    '{"enabled":false,"fresh":false}'::jsonb
  );
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_native_write_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce((select setting_value from jaeger.system_settings where setting_key='native_write.state'),'{}'::jsonb)
    || jsonb_build_object('read_state',coalesce((select setting_value from jaeger.system_settings where setting_key='native_read.state'),'{}'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_set_native_writes_enabled(p_enabled boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
  v_operations jsonb := jsonb_build_array(
    'registrarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento',
    'registrarMovimientoTarjeta', 'actualizarMovimientoTarjeta', 'eliminarMovimientoTarjeta'
  );
begin
  update jaeger.system_settings
  set setting_value = setting_value || jsonb_build_object(
        'enabled', p_enabled,
        'reason', left(coalesce(p_reason, ''), 160),
        'updated_at', now()
      ),
      updated_at = now()
  where setting_key = 'native_write.state'
  returning setting_value into v_state;

  update jaeger.system_settings
  set setting_value = setting_value || jsonb_build_object(
        'active_write_source', case when p_enabled then 'hybrid_guarded' else 'google_sheets' end,
        'native_write_operations', case when p_enabled then v_operations else '[]'::jsonb end,
        'write_cutover_completed', false,
        'phase', case when p_enabled then 6 else greatest(coalesce((setting_value->>'phase')::integer, 5), 5) end
      ),
      updated_at = now()
  where setting_key = 'migration.state';
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_write(p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing jaeger.operation_requests%rowtype;
  v_movement jaeger.financial_movements%rowtype;
  v_result jsonb;
  v_id text;
  v_card_event_ids text[];
  v_card text;
  v_card_month text;
begin
  if p_operation <> 'eliminarMovimiento' then
    return public.jaeger_write_delete_legacy(
      p_operation, p_request_id, p_payload_hash, p_payload
    );
  end if;

  if p_request_id is null or btrim(coalesce(p_payload_hash, '')) = '' then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Carga de escritura inválida';
  end if;

  v_id := btrim(coalesce(p_payload->>'id', ''));
  if v_id = '' then
    raise exception 'Selecciona el movimiento a eliminar';
  end if;

  select array_agg(e.legacy_id order by e.legacy_id), min(e.card_code), min(e.month_key)
    into v_card_event_ids, v_card, v_card_month
  from jaeger.card_events e
  where e.movement_legacy_id = v_id;

  if coalesce(array_length(v_card_event_ids, 1), 0) = 0 then
    return public.jaeger_write_delete_legacy(
      p_operation, p_request_id, p_payload_hash, p_payload
    );
  end if;

  -- A liquidation changes installment, catalog, asset and liability state. It
  -- must not be partially undone through the generic history delete action.
  if exists (
    select 1
    from jaeger.card_events e
    where e.legacy_id = any(v_card_event_ids)
      and e.installment_legacy_id is not null
      and e.origin in ('liquidacion', 'externo')
  ) then
    raise exception 'La liquidación de un diferido debe revertirse desde Tarjetas';
  end if;

  insert into jaeger.operation_requests(request_id, operation, payload_hash, status)
  values(p_request_id, p_operation, p_payload_hash, 'pending')
  on conflict(request_id) do nothing;

  select * into v_existing
  from jaeger.operation_requests
  where request_id = p_request_id
  for update;

  if v_existing.operation <> p_operation or v_existing.payload_hash <> p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operación';
  end if;
  if v_existing.status = 'completed' then
    return v_existing.response;
  end if;

  perform set_config('jaeger.request_id', p_request_id::text, true);

  select * into v_movement
  from jaeger.financial_movements
  where legacy_id = v_id
  for update;
  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  perform 1
  from jaeger.card_events
  where legacy_id = any(v_card_event_ids)
  order by legacy_id
  for update;

  delete from jaeger.card_charge_allocations
  where payment_event_id = any(v_card_event_ids)
     or charge_event_id = any(v_card_event_ids);

  update jaeger.card_events
  set charge_legacy_id = null,
      request_id = p_request_id
  where charge_legacy_id = any(v_card_event_ids);

  delete from jaeger.card_events
  where legacy_id = any(v_card_event_ids);

  v_result := jaeger_private.delete_movement(v_id, p_request_id, true)
    || jsonb_build_object(
      'cardId', v_card,
      'mesAplicado', v_card_month,
      'mesCaja', v_movement.cash_month,
      'linkedMovement', true,
      'linkedCardEvents', array_length(v_card_event_ids, 1)
    );

  update jaeger.operation_requests
  set status = 'completed',
      response = v_result,
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where request_id = p_request_id;

  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_write_delete_legacy(p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing jaeger.operation_requests%rowtype;
  v_result jsonb;
  v_old_card jaeger.card_events%rowtype;
  v_id text;
  v_movement_id text;
  v_type text;
  v_card text;
  v_month text;
  v_expense_month text;
  v_cash_month text;
  v_date date;
  v_amount numeric;
  v_origin text;
  v_charge text;
  v_installment text;
  v_order integer;
  v_movement_payload jsonb;
begin
  if p_operation not in ('registrarMovimiento','actualizarMovimiento','eliminarMovimiento',
    'registrarMovimientoTarjeta','actualizarMovimientoTarjeta','eliminarMovimientoTarjeta') then
    raise exception 'Escritura nativa no implementada: %',p_operation;
  end if;
  insert into jaeger.operation_requests(request_id,operation,payload_hash,status)
  values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
  select * into v_existing from jaeger.operation_requests where request_id=p_request_id for update;
  if v_existing.operation<>p_operation or v_existing.payload_hash<>p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operaciÃ³n';
  end if;
  if v_existing.status='completed' then return v_existing.response; end if;
  perform set_config('jaeger.request_id',p_request_id::text,true);

  if p_operation='registrarMovimiento' then
    v_result:=jaeger_private.create_movement(p_payload,p_request_id);
  elsif p_operation='actualizarMovimiento' then
    v_result:=jaeger_private.update_movement(p_payload,p_request_id);
  elsif p_operation='eliminarMovimiento' then
    v_result:=jaeger_private.delete_movement(coalesce(p_payload->>'id',p_payload#>>'{}'),p_request_id,false);
  else
    if p_operation='actualizarMovimientoTarjeta' then
      select * into v_old_card from jaeger.card_events where legacy_id=p_payload->>'id' for update;
      if not found then raise exception 'Movimiento TDC no encontrado'; end if;
    elsif p_operation='eliminarMovimientoTarjeta' then
      select * into v_old_card from jaeger.card_events where legacy_id=coalesce(p_payload->>'id',p_payload#>>'{}') for update;
      if not found then raise exception 'Movimiento TDC no encontrado'; end if;
      delete from jaeger.card_charge_allocations where payment_event_id=v_old_card.legacy_id or charge_event_id=v_old_card.legacy_id;
      update jaeger.card_events set charge_legacy_id=null,request_id=p_request_id where charge_legacy_id=v_old_card.legacy_id;
      delete from jaeger.card_events where legacy_id=v_old_card.legacy_id;
      if v_old_card.movement_legacy_id is not null then
        perform jaeger_private.delete_movement(v_old_card.movement_legacy_id,p_request_id,true);
      end if;
      v_result:=jsonb_build_object('ok',true,'id',v_old_card.legacy_id,'mesCaja',
        case when v_old_card.movement_legacy_id is not null then (select cash_month from jaeger.financial_movements where false) else null end,
        'mesAplicado',v_old_card.month_key,'cardId',v_old_card.card_code,
        'linkedMovement',v_old_card.movement_legacy_id is not null);
    end if;

    if p_operation in ('registrarMovimientoTarjeta','actualizarMovimientoTarjeta') then
      v_type:=lower(btrim(coalesce(p_payload->>'tipo',v_old_card.event_type,'')));
      v_card:=upper(btrim(coalesce(p_payload->>'tarjeta',v_old_card.card_code,'')));
      v_date:=nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
      v_month:=jaeger_private.normalize_month(coalesce(p_payload->>'mesPagoCredito',p_payload->>'mesTarjeta',p_payload->>'mesAplica',p_payload->>'mesAplicado',p_payload->>'mes',v_old_card.month_key));
      v_expense_month:=jaeger_private.normalize_month(coalesce(p_payload->>'mesGasto',p_payload->>'mesRegistroGasto',p_payload->>'mesBase',p_payload->>'mesSeleccionado',p_payload->>'mesCaja',p_payload->>'mesRegistro',p_payload->>'mes',v_month));
      v_cash_month:=jaeger_private.normalize_month(coalesce(nullif(p_payload->>'mesRegistro',''),case when v_date is not null then jaeger_private.month_from_date(v_date) end,p_payload->>'mes',v_old_card.month_key));
      v_amount:=replace(btrim(coalesce(p_payload->>'monto','0')),',','.')::numeric;
      v_origin:=btrim(coalesce(p_payload->>'origen',''));
      v_charge:=nullif(btrim(coalesce(p_payload->>'cargoId','')),'');
      v_installment:=nullif(btrim(coalesce(p_payload->>'diferidoId','')),'');
      if v_type not in ('cargo','abono') then raise exception 'Tipo TDC invÃ¡lido'; end if;
      if v_card not in ('VISA','MC') then raise exception 'Tarjeta invÃ¡lida'; end if;
      if v_amount<=0 then raise exception 'Monto invÃ¡lido'; end if;
      if not exists(select 1 from jaeger.months where month_key=v_month) then raise exception 'Mes de tarjeta no encontrado: %',v_month; end if;
      if v_charge is not null and not exists(select 1 from jaeger.card_events where legacy_id=v_charge and event_type='cargo' and card_code=v_card) then
        raise exception 'Cargo de tarjeta no encontrado o incompatible';
      end if;
      if v_installment is not null and not exists(select 1 from jaeger.card_installments where legacy_id=v_installment and card_code=v_card) then
        raise exception 'Diferido no encontrado o incompatible';
      end if;
      v_movement_payload:=jsonb_build_object('mes',v_expense_month,'mesRegistro',v_cash_month,
        'tipo',coalesce(nullif(p_payload->>'egresoTipo',''),'deuda'),'categoria',coalesce(nullif(p_payload->>'egresoTipo',''),'deuda'),
        'subcategoria',coalesce(nullif(p_payload->>'subcategoria',''),'PrÃ©stamos TDC'),'monto',v_amount,
        'fecha',coalesce(p_payload->>'fecha',''),'notas',case when coalesce(p_payload->>'notas','')='' then 'Abono '||v_card else p_payload->>'notas'||' Â· Abono '||v_card end);

      if p_operation='registrarMovimientoTarjeta' then
        if v_type='abono' and v_origin='egreso' then
          v_result:=jaeger_private.create_movement(v_movement_payload,p_request_id);
          v_movement_id:=v_result->>'id';
        end if;
        v_id:=gen_random_uuid()::text;
        select coalesce(max(source_row_number),1)+1 into v_order from jaeger.card_events;
        insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
          transaction_date,notes,origin,movement_legacy_id,category,subcategory,charge_legacy_id,installment_legacy_id,source_kind,request_id)
        values(v_id,v_order,now(),v_month,v_card,v_type,v_amount,v_date,nullif(coalesce(p_payload->>'notas',''),''),
          nullif(v_origin,''),v_movement_id,nullif(coalesce(p_payload->>'egresoTipo',''),''),nullif(coalesce(p_payload->>'subcategoria',''),''),
          v_charge,v_installment,'supabase',p_request_id);
      else
        v_id:=v_old_card.legacy_id;
        v_movement_id:=v_old_card.movement_legacy_id;
        if v_movement_id is not null and not (v_type='abono' and v_origin='egreso') then
          update jaeger.card_events set movement_legacy_id=null,request_id=p_request_id where legacy_id=v_id;
          perform jaeger_private.delete_movement(v_movement_id,p_request_id,true);
          v_movement_id:=null;
        elsif v_type='abono' and v_origin='egreso' then
          if v_movement_id is null then
            v_result:=jaeger_private.create_movement(v_movement_payload,p_request_id);
            v_movement_id:=v_result->>'id';
          else
            v_movement_payload:=v_movement_payload||jsonb_build_object('id',v_movement_id);
            perform jaeger_private.update_movement(v_movement_payload,p_request_id);
          end if;
        end if;
        delete from jaeger.card_charge_allocations where payment_event_id=v_id;
        if v_old_card.event_type='cargo' and v_type<>'cargo' then
          delete from jaeger.card_charge_allocations where charge_event_id=v_id;
          update jaeger.card_events set charge_legacy_id=null,request_id=p_request_id where charge_legacy_id=v_id;
        end if;
        update jaeger.card_events set month_key=v_month,card_code=v_card,event_type=v_type,amount=v_amount,
          transaction_date=v_date,notes=nullif(coalesce(p_payload->>'notas',''),''),origin=nullif(v_origin,''),
          movement_legacy_id=v_movement_id,category=nullif(coalesce(p_payload->>'egresoTipo',''),''),
          subcategory=nullif(coalesce(p_payload->>'subcategoria',''),''),charge_legacy_id=v_charge,
          installment_legacy_id=v_installment,request_id=p_request_id where legacy_id=v_id;
      end if;
      if v_type='abono' and v_charge is not null then
        insert into jaeger.card_charge_allocations(payment_event_id,charge_event_id,amount,allocation_kind,source_kind,request_id)
        values(v_id,v_charge,v_amount,'collection','supabase',p_request_id)
        on conflict(payment_event_id,charge_event_id,allocation_kind) do update set amount=excluded.amount,request_id=excluded.request_id;
      end if;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'registroId',coalesce(v_movement_id,''),
        'mesCaja',v_cash_month,'mesAplicado',v_month,'mesGasto',v_expense_month,'cardId',v_card,
        'linkedMovement',v_movement_id is not null);
    end if;
  end if;

  update jaeger.operation_requests set status='completed',response=v_result,error_message=null,
    completed_at=now(),updated_at=now() where request_id=p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_write_extended(p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing jaeger.operation_requests%rowtype;
  v_result jsonb := jsonb_build_object('ok',true);
  v_item jaeger.balance_items%rowtype;
  v_liability jaeger.balance_items%rowtype;
  v_installment jaeger.card_installments%rowtype;
  v_card text;
  v_id text;
  v_month text;
  v_asset_id text;
  v_movement_id text;
  v_total numeric;
  v_cash_amount numeric;
  v_asset_amount numeric;
  v_external_amount numeric;
  v_non_cash_amount numeric;
  v_date date;
  v_order integer;
  v_payload2 jsonb;
begin
  v_external_amount:=replace(btrim(coalesce(p_payload->>'montoExterno','0')),',','.')::numeric;
  if p_operation<>'liquidarDiferidoTdc' or v_external_amount<=0 then
    return public.jaeger_write_extended_legacy(p_operation,p_request_id,p_payload_hash,p_payload);
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

  v_card:=upper(btrim(coalesce(p_payload->>'tarjeta','')));
  v_id:=btrim(coalesce(p_payload->>'diferidoId',''));
  v_month:=jaeger_private.normalize_month(p_payload->>'mesPago');
  v_total:=replace(btrim(coalesce(p_payload->>'total','0')),',','.')::numeric;
  v_cash_amount:=replace(btrim(coalesce(p_payload->>'montoSaldo','0')),',','.')::numeric;
  v_asset_amount:=replace(btrim(coalesce(p_payload->>'montoActivo','0')),',','.')::numeric;
  v_asset_id:=nullif(btrim(coalesce(p_payload->>'activoId','')),'');
  v_date:=nullif(btrim(coalesce(p_payload->>'fecha','')),'')::date;
  if v_card not in ('VISA','MC') then raise exception 'Tarjeta inválida'; end if;
  if v_total<=0 or v_cash_amount<0 or v_asset_amount<0 or v_external_amount<=0 or
     abs(v_cash_amount+v_asset_amount+v_external_amount-v_total)>0.01 then
    raise exception 'Los orígenes deben sumar el total a liquidar';
  end if;
  if v_asset_amount>0 and v_asset_id is null then
    raise exception 'Selecciona el activo de donde sale el dinero';
  end if;

  select * into v_installment from jaeger.card_installments
    where legacy_id=v_id and card_code=v_card for update;
  if not found or v_installment.state<>'activo' then
    raise exception 'Diferido no encontrado o ya liquidado';
  end if;
  perform jaeger_private.ensure_month(v_month);
  perform 1 from jaeger.balance_items
    where balance_id in (v_asset_id,v_installment.balance_id) order by balance_id for update;
  if v_asset_amount>0 and not exists(
    select 1 from jaeger.balance_items where balance_id=v_asset_id and balance_type='Activo' and active
  ) then
    raise exception 'Activo de origen no encontrado';
  end if;

  if v_cash_amount>0 then
    v_payload2:=jsonb_build_object(
      'mes',jaeger_private.normalize_month(coalesce(p_payload->>'mesGasto',p_payload->>'homeMes',v_month)),
      'mesRegistro',jaeger_private.normalize_month(coalesce(
        case when v_date is not null then jaeger_private.month_from_date(v_date) end,p_payload->>'homeMes',v_month
      )),
      'tipo','deuda','categoria','deuda','subcategoria',v_installment.name,'monto',v_cash_amount,
      'fecha',coalesce(p_payload->>'fecha',''),'notas','Liquidación '||v_installment.name||' · '||v_card
    );
    v_result:=jaeger_private.create_movement(v_payload2,p_request_id);
    v_movement_id:=v_result->>'id';
  end if;

  if v_asset_amount>0 then
    select * into v_item from jaeger.balance_items where balance_id=v_asset_id;
    perform jaeger_private.apply_balance_delta(v_asset_id,-v_asset_amount,p_request_id);
    perform jaeger_private.record_balance_change(v_asset_id,v_item.name,'Activo','liquidar diferido',
      v_item.current_value,v_item.current_value-v_asset_amount,v_installment.name,p_request_id);
  end if;

  v_non_cash_amount:=v_asset_amount+v_external_amount;
  if v_non_cash_amount>0 and v_installment.balance_id is not null then
    select * into v_liability from jaeger.balance_items where balance_id=v_installment.balance_id and active;
    if not found then raise exception 'Pasivo relacionado no encontrado'; end if;
    if v_liability.current_value+0.01<v_non_cash_amount then
      raise exception 'El pasivo relacionado no cubre el monto externo a liquidar';
    end if;
    perform jaeger_private.apply_balance_delta(v_installment.balance_id,-v_non_cash_amount,p_request_id);
    perform jaeger_private.record_balance_change(v_installment.balance_id,v_liability.name,'Pasivo','liquidar diferido',
      v_liability.current_value,v_liability.current_value-v_non_cash_amount,v_card,p_request_id);
  end if;

  delete from jaeger.card_charge_allocations a using jaeger.card_events e
    where (a.charge_event_id=e.legacy_id or a.payment_event_id=e.legacy_id)
      and e.installment_legacy_id=v_id and e.event_type='cargo'
      and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
  update jaeger.card_events p set charge_legacy_id=null,request_id=p_request_id
    where p.charge_legacy_id in (
      select e.legacy_id from jaeger.card_events e where e.installment_legacy_id=v_id
        and e.event_type='cargo' and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month)
    );
  delete from jaeger.card_events e where e.installment_legacy_id=v_id and e.event_type='cargo'
    and jaeger_private.month_start(e.month_key)>=jaeger_private.month_start(v_month);
  select coalesce(max(source_row_number),0)+1 into v_order from jaeger.card_events;
  insert into jaeger.card_events(legacy_id,source_row_number,recorded_at,month_key,card_code,event_type,amount,
    transaction_date,notes,origin,movement_legacy_id,category,subcategory,installment_legacy_id,source_kind,request_id)
  values(gen_random_uuid()::text,v_order,now(),v_month,v_card,'abono',v_total,v_date,'Liquidación '||v_installment.name,
    case when v_cash_amount=0 and v_asset_amount=0 then 'externo' else 'liquidacion' end,
    v_movement_id,'deuda',v_installment.name,v_id,'supabase',p_request_id);
  update jaeger.card_installments set state='liquidado',liquidation_month=v_month,
    source_timestamp=to_char(now() at time zone 'America/Guayaquil','YYYY-MM-DD HH24:MI:SS'),request_id=p_request_id
    where legacy_id=v_id;
  update jaeger.catalog_items set state='inactivo',request_id=p_request_id
    where kind='deuda' and lower(btrim(name))=lower(btrim(v_installment.name));
  if v_installment.balance_id is not null then
    update jaeger.balance_items set active=false,request_id=p_request_id where balance_id=v_installment.balance_id;
  end if;
  v_result:=jsonb_build_object('ok',true,'id',v_id,'registroId',coalesce(v_movement_id,''),'cardId',v_card,
    'mesAplicado',v_month,'linkedMovement',v_movement_id is not null,'montoExterno',v_external_amount);

  update jaeger.operation_requests set status='completed',response=v_result,error_message=null,
    completed_at=now(),updated_at=now() where request_id=p_request_id;
  perform public.jaeger_invalidate_api_cache();
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jaeger_write_extended_legacy(p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    raise exception 'Carga de escritura invÃ¡lida';
  end if;

  insert into jaeger.operation_requests(request_id,operation,payload_hash,status)
  values(p_request_id,p_operation,p_payload_hash,'pending') on conflict(request_id) do nothing;
  select * into v_existing from jaeger.operation_requests where request_id=p_request_id for update;
  if v_existing.operation<>p_operation or v_existing.payload_hash<>p_payload_hash then
    raise exception 'La clave de idempotencia ya fue usada con otra operaciÃ³n';
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
      case when v_item.balance_type='Pasivo' then 'PrÃ©stamos' else 'Activos Financieros' end);
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
    v_group:=coalesce(nullif(btrim(p_payload->>'grupo'),''),case when v_type='Pasivo' then 'PrÃ©stamos' else 'Activos Financieros' end);
    v_id:=jaeger_private.new_balance_item(v_type,v_name,v_value,v_group,p_payload->>'nota',p_request_id);
    perform jaeger_private.record_balance_change(v_id,v_name,v_type,'crear',0,v_value,p_payload->>'nota',p_request_id);
    v_result:=jsonb_build_object('ok',true,'codigo',v_id);

  elsif p_operation='eliminarBalanceItem' then
    v_id:=nullif(btrim(coalesce(p_payload->>'codigo','')),'');
    select * into v_item from jaeger.balance_items where balance_id=v_id and active for update;
    if not found then raise exception 'CÃ³digo de balance no encontrado'; end if;
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
    if jsonb_typeof(v_groups)<>'array' then raise exception 'Orden de grupos invÃ¡lido'; end if;
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
    if not found then raise exception 'Ãtem de JapÃ³n no encontrado'; end if;
    select coalesce(sum(actual),0) into v_total from jaeger.japan_budget_items
      where section='viaje' and name not in ('Total','Presupuesto Real');
    update jaeger.japan_budget_items set actual=v_total,remaining=budget-v_total,
      source_kind='supabase',request_id=p_request_id
      where section='tramites' and name='Viaje a JapÃ³n';

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
        raise exception 'Para borrar pinturas usa el botÃ³n Limpiar mes';
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
    if v_section is null then raise exception 'CategorÃ­a no soportada'; end if;
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
      raise exception 'AcciÃ³n no soportada';
    end if;
    v_result:=jsonb_build_object('ok',true,'mes',v_month);

  elsif p_operation='registrarDiferidoTdc' then
    v_card:=upper(btrim(coalesce(p_payload->>'tarjeta','')));
    v_name:=btrim(coalesce(p_payload->>'nombre',''));
    v_total:=replace(btrim(coalesce(p_payload->>'inicial','0')),',','.')::numeric;
    v_installment_amount:=replace(btrim(coalesce(p_payload->>'cuota','0')),',','.')::numeric;
    v_month:=jaeger_private.normalize_month(p_payload->>'mesInicio');
    v_balance_id:=nullif(btrim(coalesce(p_payload->>'balanceId','')),'');
    v_group:=coalesce(nullif(btrim(p_payload->>'grupo'),''),'Tarjeta de CrÃ©dito');
    if v_card not in ('VISA','MC') then raise exception 'Tarjeta invÃ¡lida'; end if;
    if v_name='' then raise exception 'Escribe el nombre del diferido'; end if;
    if v_total<=0 or v_installment_amount<=0 then raise exception 'Ingresa saldo y cuota vÃ¡lidos'; end if;
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
      raise exception 'Los orÃ­genes deben sumar el total a liquidar';
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
        'fecha',coalesce(p_payload->>'fecha',''),'notas','LiquidaciÃ³n '||v_installment.name||' Â· '||v_card);
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
    values(gen_random_uuid()::text,v_order,now(),v_month,v_card,'abono',v_total,v_date,'LiquidaciÃ³n '||v_installment.name,
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
$function$;
CREATE TRIGGER balance_groups_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.balance_groups FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('balance_type', 'name');
CREATE TRIGGER balance_groups_touch BEFORE UPDATE ON jaeger.balance_groups FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER balance_items_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.balance_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('balance_id');
CREATE TRIGGER balance_items_touch BEFORE UPDATE ON jaeger.balance_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER card_charge_allocations_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.card_charge_allocations FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('allocation_id');
CREATE TRIGGER card_charge_allocations_touch BEFORE UPDATE ON jaeger.card_charge_allocations FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER card_events_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.card_events FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('legacy_id');
CREATE TRIGGER card_events_touch BEFORE UPDATE ON jaeger.card_events FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER card_installments_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.card_installments FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('legacy_id');
CREATE TRIGGER card_installments_cleanup_future_plans_insert AFTER INSERT ON jaeger.card_installments FOR EACH ROW EXECUTE FUNCTION jaeger_private.remove_future_liquidated_installment_plans();
CREATE TRIGGER card_installments_cleanup_future_plans_update AFTER UPDATE OF state, liquidation_month ON jaeger.card_installments FOR EACH ROW EXECUTE FUNCTION jaeger_private.remove_future_liquidated_installment_plans();
CREATE TRIGGER card_installments_touch BEFORE UPDATE ON jaeger.card_installments FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER catalog_items_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.catalog_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('legacy_id');
CREATE TRIGGER catalog_items_touch BEFORE UPDATE ON jaeger.catalog_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER credit_cards_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.credit_cards FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('card_code');
CREATE TRIGGER credit_cards_touch BEFORE UPDATE ON jaeger.credit_cards FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER financial_movements_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.financial_movements FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('legacy_id');
CREATE TRIGGER financial_movements_touch BEFORE UPDATE ON jaeger.financial_movements FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER goal_asset_allocations_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.goal_asset_allocations FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('goal_key', 'balance_id');
CREATE TRIGGER goal_asset_allocations_touch BEFORE UPDATE ON jaeger.goal_asset_allocations FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER japan_budget_items_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.japan_budget_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('id');
CREATE TRIGGER japan_budget_items_touch BEFORE UPDATE ON jaeger.japan_budget_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER monthly_distribution_metrics_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.monthly_distribution_metrics FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('id');
CREATE TRIGGER monthly_distribution_metrics_touch BEFORE UPDATE ON jaeger.monthly_distribution_metrics FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER monthly_plan_items_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.monthly_plan_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('id');
CREATE TRIGGER monthly_plan_items_touch BEFORE UPDATE ON jaeger.monthly_plan_items FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER monthly_summary_values_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.monthly_summary_values FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('id');
CREATE TRIGGER monthly_summary_values_touch BEFORE UPDATE ON jaeger.monthly_summary_values FOR EACH ROW EXECUTE FUNCTION jaeger_private.touch_operational_row();
CREATE TRIGGER paintings_months_audit AFTER INSERT OR DELETE OR UPDATE ON jaeger.paintings_months FOR EACH ROW EXECUTE FUNCTION jaeger_private.audit_operational_row('month_key');
