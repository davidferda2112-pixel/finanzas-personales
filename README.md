# Finanzas Personales en Vercel + Apps Script

Este proyecto mantiene tu interfaz de Apps Script casi igual, pero reemplaza `google.script.run` con un adaptador para Vercel.

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

La interfaz vive en `public/index.html`. Para cambiar el logo, reemplaza `public/logo.svg` por tu logo real, conservando el nombre o ajustando el `src` en el HTML.

## 3. Flujo de cambios

- Cambios de datos, hojas y lógica: Apps Script / Google Sheets.
- Cambios visuales: `public/index.html` en Vercel.
- Vercel siempre llama a la API actual de Apps Script.