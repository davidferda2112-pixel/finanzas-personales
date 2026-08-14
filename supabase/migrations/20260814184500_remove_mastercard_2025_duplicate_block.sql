-- The source sheet contains a second six-row block (rows 21-26) with Visa
-- history. It was incorrectly imported as Mastercard because both blocks live
-- in the legacy "Flujo TDC Papi" tab. Preserve only Mastercard rows 4-9.

do $$
declare
  v_duplicate_cells integer;
begin
  select count(*)
    into v_duplicate_cells
  from jaeger.card_history_monthly
  where card_code = 'MC'
    and year = 2025
    and source_row_number between 21 and 26;

  if v_duplicate_cells <> 72 then
    raise exception 'Se esperaban 72 celdas duplicadas de Mastercard 2025; se encontraron %', v_duplicate_cells;
  end if;

  delete from jaeger.card_history_monthly
  where card_code = 'MC'
    and year = 2025
    and source_row_number between 21 and 26;
end;
$$;
