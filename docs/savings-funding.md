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

Aplicar, en orden, las migraciones `20261022184346_savings_funding_and_traceability.sql`, `20261022235107_reconciliation_cases.sql`, `20261023121900_history_semantics.sql` y `20261023124500_stable_asset_identity.sql` antes de desplegar la interfaz. Las correcciones de datos personales y sus respaldos permanecen fuera del repositorio público.

El botón + del balance permite crear un grupo o un ítem. El catálogo incorpora todos los activos activos y mantiene su `balance_id` al cambiar de grupo. Mover un ítem sin editar su importe conserva el saldo bloqueado en la base de datos, incluso si hubo movimientos después de abrir el formulario. Los aportes y gastos siguen usando ese identificador permanente.

En móvil, el acceso a gastos desde ahorros es un icono junto al título de Registrar Egreso. No aparece en Ingreso ni Ahorro. Las tarjetas de distribución mantienen el detalle presupuestario; la financiación se consulta desde los historiales. `tests/mobile-customization.cjs` comprueba este recorrido a 360 píxeles de ancho.

Una observación de efectivo confirmada por el usuario se conserva como evidencia de conciliación, sin crear ingresos ni movimientos artificiales. El saldo disponible incorpora los movimientos posteriores a esa observación.

Los grupos vacíos permanecen visibles. Al entrar a Balance General y abrir el formulario se actualiza el catálogo compartido. `node tests/persistent-groups-browser.cjs` comprueba creación, recarga y lectura desde tres sesiones de navegador independientes. El flujo anual muestra el efectivo confirmado separado del acumulado de registros históricos.

`npm ci && npm test` ejecuta las pruebas sintéticas. `supabase/tests/savings_production_rollback.sql` verifica PostgreSQL real y revierte todos sus datos de prueba. La prueba paralela de PGlite comprueba saldo limitado con peticiones encoladas; no demuestra contención entre dos conexiones PostgreSQL. La verificación histórica requiere el respaldo privado mediante `npm run test:reconciliation`. El flujo de navegador se prueba contra `tests/helpers/local-server.cjs`; configurar PLAYWRIGHT_MODULE con la ubicación de Playwright e instalar Edge.

## Recuperación segura

Ante una incidencia, suspender las escrituras y conservar un nuevo respaldo antes de intervenir. Es preferible corregir hacia adelante conservando las columnas, los vínculos y la auditoría. Una reversión de interfaz debe coordinarse con las lecturas del servidor: no restaurar cálculos que cuenten fondos de ahorro como ingresos.

No eliminar tablas ni restaurar saldos de un respaldo sobre operaciones posteriores. Una reversión histórica requiere comprobar que los registros afectados no hayan cambiado, registrar un ajuste compensatorio con una nueva solicitud y conservar el rastro previo. Los respaldos privados contienen las definiciones anteriores y los valores originales para preparar esa intervención controlada.
