-- Creation and editing must be distinct operations. Older clients without a mode
-- fail safely instead of turning a new card into an overwrite of an existing one.
alter function public.jaeger_config_write(text, uuid, text, jsonb)
  rename to jaeger_config_write_legacy;

create function public.jaeger_config_write(
  p_operation text, p_request_id uuid, p_payload_hash text, p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_code text;
  v_mode text;
  v_version bigint;
  v_request jaeger.operation_requests%rowtype;
begin
  if p_operation = 'guardarTarjetaConfiguracion' then
    v_code := upper(btrim(coalesce(p_payload ->> 'codigo', '')));
    v_mode := p_payload ->> 'modo';
    if v_mode not in ('crear', 'editar') or v_mode is null then
      raise exception 'Indica si vas a crear o editar la tarjeta. Actualiza la aplicación e inténtalo de nuevo';
    end if;
    -- Serialize two submissions for the same code, including a code not yet inserted.
    perform pg_catalog.pg_advisory_xact_lock(73014, pg_catalog.hashtext(v_code));

    -- Preserve the idempotent response on a legitimate retry.
    select * into v_request from jaeger.operation_requests where request_id = p_request_id;
    if found and v_request.status = 'completed' then
      if v_request.operation <> p_operation or v_request.payload_hash <> p_payload_hash then
        raise exception 'La clave de idempotencia ya fue usada con otra operacion';
      end if;
      return v_request.response;
    end if;

    select row_version into v_version
    from jaeger.credit_cards where card_code = v_code for update;
    if v_mode = 'crear' and found then
      raise exception 'Ya existe una tarjeta con el código %. Usa un código nuevo, por ejemplo AMEX', v_code;
    end if;
    if v_mode = 'editar' then
      if not found then raise exception 'La tarjeta que intentas editar ya no existe'; end if;
      if nullif(p_payload ->> 'version', '') is null
         or (p_payload ->> 'version')::bigint <> v_version then
        raise exception 'La tarjeta cambió desde que abriste el formulario. Recarga la configuración';
      end if;
    end if;
  end if;
  return public.jaeger_config_write_legacy(p_operation, p_request_id, p_payload_hash, p_payload);
end;
$$;

revoke all on function public.jaeger_config_write(text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.jaeger_config_write(text,uuid,text,jsonb) to service_role;
revoke all on function public.jaeger_config_write_legacy(text,uuid,text,jsonb) from public, anon, authenticated;

-- Every card code now refers to the configured card registry, including new brands.
alter table jaeger.card_events drop constraint card_events_card_code_check;
alter table jaeger.card_installments drop constraint card_installments_card_code_check;
alter table jaeger.card_history_monthly drop constraint card_history_monthly_card_code_check;
alter table jaeger.card_events add constraint card_events_configured_card_fkey
  foreign key (card_code) references jaeger.credit_cards(card_code);
alter table jaeger.card_installments add constraint card_installments_configured_card_fkey
  foreign key (card_code) references jaeger.credit_cards(card_code);
alter table jaeger.card_history_monthly add constraint card_history_configured_card_fkey
  foreign key (card_code) references jaeger.credit_cards(card_code);

-- Replace the three legacy brand allowlists with a lookup in the configured cards.
do $$
declare
  v_name text;
  v_definition text;
  v_old constant text := 'if v_card not in (''VISA'',''MC'') then';
  v_new constant text := 'if not exists (select 1 from jaeger.credit_cards where card_code = v_card and active) then';
begin
  foreach v_name in array array[
    'jaeger_write_delete_legacy',
    'jaeger_write_extended_legacy',
    'jaeger_write_extended'
  ] loop
    select pg_catalog.pg_get_functiondef(
      ('public.' || v_name || '(text,uuid,text,jsonb)')::regprocedure
    ) into v_definition;
    if pg_catalog.strpos(v_definition, v_old) = 0 then
      raise exception 'No se encontró la validación anterior en %', v_name;
    end if;
    execute pg_catalog.replace(v_definition, v_old, v_new);
  end loop;
end;
$$;
