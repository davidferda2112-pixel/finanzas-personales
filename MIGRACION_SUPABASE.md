# Migracion sombra a Supabase

Este respaldo no reemplaza Google Sheets. La app sigue leyendo y escribiendo en Apps Script. Supabase queda como copia sombra para acelerar una migracion futura sin arriesgar los datos actuales.

## Variables en Vercel

Mantener las variables actuales:

- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_TOKEN`
- `APP_ACCESS_KEY`

Agregar estas:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `jaegerkey`

`jaegerkey` debe contener la secret key de Supabase y no debe subirse a GitHub.

## Crear tablas en Supabase

1. Entra al proyecto de Supabase.
2. Abre `SQL Editor`.
3. Crea un query nuevo.
4. Copia todo el contenido de `supabase/schema.sql`.
5. Ejecuta `Run`.

## Actualizar Apps Script

1. Reemplaza `Code.gs` con `appscript/Code.gs`.
2. Crea una nueva version de la implementacion.
3. Mantén el mismo enlace de Web App si Apps Script te permite actualizar la implementacion existente.

El cambio nuevo solo agrega `exportarSnapshotSupabase`, una funcion de lectura para exportar el estado completo.

## Probar sin guardar datos

Cuando Vercel termine el deploy, prueba el endpoint:

```bash
curl -X POST "https://TU_DOMINIO_VERCEL/api/supabase-sync" \
  -H "Content-Type: application/json" \
  -H "x-app-key: TU_APP_ACCESS_KEY" \
  -d "{\"dryRun\":true}"
```

Debe responder con `ok: true` y conteos de meses, movimientos, tarjetas y pinturas.

## Sincronizar a Supabase

Si el dry run responde bien:

```bash
curl -X POST "https://TU_DOMINIO_VERCEL/api/supabase-sync" \
  -H "Content-Type: application/json" \
  -H "x-app-key: TU_APP_ACCESS_KEY" \
  -d "{\"dryRun\":false}"
```

Luego revisa en Supabase:

- `jaeger_app_snapshots`
- `jaeger_movements`
- `jaeger_credit_card_events`
- `jaeger_balance_snapshots`
- `jaeger_cashflow_snapshots`

## Sincronizar solo algunos meses

Para una prueba pequena:

```bash
curl -X POST "https://TU_DOMINIO_VERCEL/api/supabase-sync" \
  -H "Content-Type: application/json" \
  -H "x-app-key: TU_APP_ACCESS_KEY" \
  -d "{\"dryRun\":false,\"meses\":[\"Junio 26\"]}"
```

## Regla de seguridad

Hasta que confirmemos varias sincronizaciones correctas, no se cambia la app para leer desde Supabase. Google Sheets sigue siendo la fuente de verdad.
