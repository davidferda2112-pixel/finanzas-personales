# Gastos desde ahorros y conciliación

El modal habitual permite registrar gastos y pagos de deuda con un activo como origen. El capital reduce el pasivo; los intereses se muestran como consumo. Las transferencias conservan el patrimonio y no se incluyen como ingresos ordinarios.

## Modelo y seguridad

- `operation_code` conserva la identidad financiera; la normalización Unicode solo interpreta entradas antiguas.
- `applied_impacts` conserva los efectos realmente aplicados para edición y reversión.
- `funding_operations` y `funding_allocations` enlazan financiación y gastos sin duplicar transacciones.
- Las escrituras son atómicas e idempotentes mediante `jaeger_write`; un bloqueo transaccional serializa operaciones financieras y los saldos se bloquean al actualizarse.
- Las tablas nuevas mantienen RLS y acceso exclusivamente desde el servicio privado existente.
- El historial existente une balance_log y auditoría; incluye los casos pendientes de conciliación.
- Las correcciones históricas documentadas requieren conciliación específica para modificarse. No pueden deshacerse como si fueran una operación nueva.

## Despliegue

Aplicar, en orden, las migraciones `20261022184346_savings_funding_and_traceability.sql` y `20261022235107_reconciliation_cases.sql` antes de desplegar la interfaz. Las correcciones de datos personales y sus respaldos permanecen fuera del repositorio público.

`npm ci && npm test` ejecuta las pruebas sintéticas. `supabase/tests/savings_production_rollback.sql` verifica PostgreSQL real y revierte todos sus datos de prueba. La prueba paralela de PGlite comprueba saldo limitado con peticiones encoladas; no demuestra contención entre dos conexiones PostgreSQL. La verificación histórica requiere el respaldo privado mediante `npm run test:reconciliation`. El flujo de navegador se prueba contra `tests/helpers/local-server.cjs`; configurar PLAYWRIGHT_MODULE con la ubicación de Playwright e instalar Edge.

## Recuperación segura

Ante una incidencia, suspender las escrituras y conservar un nuevo respaldo antes de intervenir. Es preferible corregir hacia adelante conservando las columnas, los vínculos y la auditoría. Una reversión de interfaz debe coordinarse con las lecturas del servidor: no restaurar cálculos que cuenten fondos de ahorro como ingresos.

No eliminar tablas ni restaurar saldos de un respaldo sobre operaciones posteriores. Una reversión histórica requiere comprobar que los registros afectados no hayan cambiado, registrar un ajuste compensatorio con una nueva solicitud y conservar el rastro previo. Los respaldos privados contienen las definiciones anteriores y los valores originales para preparar esa intervención controlada.
