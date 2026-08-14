-- Step 5: allow native Supabase reads only while the imported operational
-- snapshot is known to be current. Every legacy Sheets write marks it stale
-- before the external mutation starts.

insert into jaeger.system_settings (setting_key, setting_value, description)
values (
  'native_read.state',
  jsonb_build_object(
    'enabled', true,
    'fresh', false,
    'phase', 5,
    'writes_source', 'google_sheets',
    'stale_reason', 'pending_step_5_validation'
  ),
  'Compuerta del corte de lecturas nativas. Solo permite servir Supabase cuando la copia operativa fue validada.'
)
on conflict (setting_key) do update
set setting_value = jaeger.system_settings.setting_value || jsonb_build_object(
      'enabled', true,
      'phase', 5,
      'writes_source', 'google_sheets'
    ),
    description = excluded.description,
    updated_at = now();

create or replace function public.jaeger_native_read_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select setting_value
      from jaeger.system_settings
      where setting_key = 'native_read.state'
    ),
    '{"enabled":false,"fresh":false}'::jsonb
  );
$$;

create or replace function public.jaeger_mark_native_reads_stale(
  p_reason text default 'legacy_write'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.jaeger_mark_native_reads_ready(
  p_reason text default 'validated_parity'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.jaeger_native_read_status() from public, anon, authenticated;
revoke all on function public.jaeger_mark_native_reads_stale(text) from public, anon, authenticated;
revoke all on function public.jaeger_mark_native_reads_ready(text) from public, anon, authenticated;
grant execute on function public.jaeger_native_read_status() to service_role;
grant execute on function public.jaeger_mark_native_reads_stale(text) to service_role;
grant execute on function public.jaeger_mark_native_reads_ready(text) to service_role;

comment on function public.jaeger_native_read_status() is
  'Estado privado de vigencia para el corte controlado de lecturas nativas.';
comment on function public.jaeger_mark_native_reads_stale(text) is
  'Desactiva lecturas nativas antes de una escritura que aun se procesa en Google Sheets.';
comment on function public.jaeger_mark_native_reads_ready(text) is
  'Reactiva lecturas nativas unicamente despues de validar la paridad del origen normalizado.';
