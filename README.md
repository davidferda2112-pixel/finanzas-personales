# Jaeger Spend en Vercel + Apps Script + Supabase

Google Sheets continúa siendo la fuente financiera de verdad durante la migración. Supabase guarda una copia privada y temporal de las respuestas ya calculadas por Apps Script para acelerar lecturas repetidas sin duplicar fórmulas financieras.

## 1. Apps Script

1. Abre tu proyecto de Apps Script.
2. Reemplaza o actualiza `Code.gs` con `appscript/Code.gs`.
3. En Apps Script, ve a **Project Settings > Script properties** y crea:
   - `FINPER_API_TOKEN`: un texto largo privado.
4. Implementa como Web App:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copia la URL `/exec` del despliegue.

## 2. Vercel

Configura estas variables de entorno en Vercel:

- `APPS_SCRIPT_URL`: la URL `/exec` de Apps Script.
- `APPS_SCRIPT_TOKEN`: el mismo valor de `FINPER_API_TOKEN`.
- `APP_ACCESS_KEY`: la clave personal que protege la API de Jaeger Spend.
- `SUPABASE_URL`: la URL del proyecto `jaeger-spend`.
- `SUPABASE_SECRET_KEY`: una clave secreta exclusiva del servidor. Nunca debe aparecer en los HTML ni en Git.
- `SUPABASE_PRIMARY_READS`: usa `1` para habilitar las lecturas nativas solo mientras la compuerta de vigencia de Supabase esté validada.

La migración SQL que crea la caché privada está en `supabase/migrations`. La tabla tiene RLS forzado, no concede acceso a `anon` ni `authenticated` y solo permite operar a `service_role`.

## 3. Flujo de cambios

- Cambios de datos, hojas y lógica: Apps Script / Google Sheets mientras dure esta fase.
- Cambios visuales: `public/index.html` en Vercel.
- Las lecturas pasan primero por la copia privada de Supabase y vuelven a Apps Script cuando falta o vence.
- Cualquier escritura invalida la generación completa de la caché antes de responder, evitando reutilizar datos anteriores al cambio.
- `api/supabase.js` ofrece la futura ruta de lectura, pero la interfaz todavía no cambia a ella.
