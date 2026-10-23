create view jaeger.card_history_effective as  WITH RECURSIVE base AS (
         SELECT c_1.card_code,
            (m.year)::integer AS year_number,
            (m.month_number)::integer AS month_number,
            m.month_key,
            COALESCE(max(h.amount) FILTER (WHERE (h.concept = 'Saldo anterior'::text)), (0)::numeric) AS base_previous,
            COALESCE(max(h.amount) FILTER (WHERE (h.concept = 'Consumos'::text)), (0)::numeric) AS base_charges,
            COALESCE(max(h.amount) FILTER (WHERE (h.concept = 'Pagos / Créditos'::text)), (0)::numeric) AS base_payments,
            COALESCE(max(h.amount) FILTER (WHERE (h.concept = 'Saldo Diferido'::text)), (0)::numeric) AS base_deferred
           FROM ((jaeger.credit_cards c_1
             CROSS JOIN jaeger.months m)
             LEFT JOIN jaeger.card_history_monthly h ON (((h.card_code = c_1.card_code) AND (h.year = m.year) AND (h.month_number = m.month_number))))
          GROUP BY c_1.card_code, m.year, m.month_number, m.month_key
        ), events AS (
         SELECT e.card_code,
            (m.year)::integer AS year_number,
            (m.month_number)::integer AS month_number,
            COALESCE(sum(e.amount) FILTER (WHERE (e.event_type = 'cargo'::text)), (0)::numeric) AS charges,
            COALESCE(sum(e.amount) FILTER (WHERE (e.event_type = 'abono'::text)), (0)::numeric) AS payments_display,
            COALESCE(sum(e.amount) FILTER (WHERE ((e.event_type = 'abono'::text) AND (e.installment_legacy_id IS NULL))), (0)::numeric) AS payments_rotative
           FROM (jaeger.card_events e
             JOIN jaeger.months m ON ((m.month_key = e.month_key)))
          GROUP BY e.card_code, m.year, m.month_number
        ), prepared AS (
         SELECT b.card_code,
            b.year_number,
            b.month_number,
            b.month_key,
            b.base_previous,
            b.base_charges,
            b.base_payments,
            b.base_deferred,
            row_number() OVER (PARTITION BY b.card_code, b.year_number ORDER BY b.month_number) AS sequence_number,
            round((b.base_charges + COALESCE(e.charges, (0)::numeric)), 2) AS charges,
            round((b.base_payments + COALESCE(e.payments_display, (0)::numeric)), 2) AS payments_display,
            round((b.base_payments + COALESCE(e.payments_rotative, (0)::numeric)), 2) AS payments_rotative,
                CASE
                    WHEN (abs(b.base_deferred) > 0.004) THEN round(GREATEST((0)::numeric, ((b.base_deferred - COALESCE(iv.imported_liquidated_offset, (0)::numeric)) + COALESCE(iv.operational_deferred, (0)::numeric))), 2)
                    ELSE round(COALESCE(iv.full_deferred, (0)::numeric), 2)
                END AS deferred
           FROM ((base b
             LEFT JOIN events e USING (card_code, year_number, month_number))
             LEFT JOIN LATERAL ( SELECT sum(x.remaining_amount) FILTER (WHERE (NOT x.stops_after_liquidation)) AS full_deferred,
                    sum(x.remaining_amount) FILTER (WHERE ((x.source_kind = 'supabase'::text) AND (NOT x.stops_after_liquidation))) AS operational_deferred,
                    sum(x.remaining_amount) FILTER (WHERE ((x.source_kind IS DISTINCT FROM 'supabase'::text) AND x.stops_after_liquidation)) AS imported_liquidated_offset
                   FROM ( SELECT i.source_kind,
                            GREATEST((0)::numeric, (i.initial_balance - (i.installment_amount * (GREATEST(0, (i.installments_at_base_month + ((((b.year_number * 12) + b.month_number) - 1) - (((base_month.year * 12) + base_month.month_number) - 1)))))::numeric))) AS remaining_amount,
                            ((i.state = 'liquidado'::text) AND (liquidation_month.month_key IS NOT NULL) AND ((((b.year_number * 12) + b.month_number) - 1) > (((liquidation_month.year * 12) + liquidation_month.month_number) - 1))) AS stops_after_liquidation
                           FROM ((jaeger.card_installments i
                             JOIN jaeger.months base_month ON ((base_month.month_key = i.base_month)))
                             LEFT JOIN jaeger.months liquidation_month ON ((liquidation_month.month_key = i.liquidation_month)))
                          WHERE ((i.card_code = b.card_code) AND ((((b.year_number * 12) + b.month_number) - 1) >= ((((base_month.year * 12) + base_month.month_number) - 1) - GREATEST(0, (i.installments_at_base_month - 1)))))) x) iv ON (true))
        ), calculated AS (
         SELECT p.card_code,
            p.year_number,
            p.month_number,
            p.month_key,
            p.sequence_number,
            round(p.base_previous, 2) AS previous_balance,
            p.charges,
            p.payments_display,
            p.payments_rotative,
            p.deferred,
            round(((p.base_previous + p.charges) - p.payments_rotative), 2) AS rotative
           FROM prepared p
          WHERE (p.sequence_number = 1)
        UNION ALL
         SELECT p.card_code,
            p.year_number,
            p.month_number,
            p.month_key,
            p.sequence_number,
            c_1.rotative,
            p.charges,
            p.payments_display,
            p.payments_rotative,
            p.deferred,
            round(((c_1.rotative + p.charges) - p.payments_rotative), 2) AS round
           FROM (calculated c_1
             JOIN prepared p ON (((p.card_code = c_1.card_code) AND (p.year_number = c_1.year_number) AND (p.sequence_number = (c_1.sequence_number + 1)))))
        )
 SELECT c.card_code,
    (c.year_number)::smallint AS year,
    (c.month_number)::smallint AS month_number,
    c.month_key,
    row_value.sort_order,
    row_value.concept,
    (row_value.amount)::numeric(18,2) AS amount
   FROM (calculated c
     CROSS JOIN LATERAL ( VALUES ((1)::smallint,'Saldo anterior'::text,c.previous_balance), ((2)::smallint,'Consumos'::text,c.charges), ((3)::smallint,'Pagos / Créditos'::text,c.payments_display), ((4)::smallint,'Total/ Saldo Rotativo'::text,c.rotative), ((5)::smallint,'Saldo Diferido'::text,c.deferred), ((6)::smallint,'Saldo Real'::text,round((c.rotative + c.deferred), 2))) row_value(sort_order, concept, amount));
