# Jaeger Spend - Estado y flujo de trabajo

Fecha de referencia: 22 de mayo de 2026.

## Objetivo del sistema

Jaeger Spend es una app personal de control diario de finanzas. El sistema vive en un libro de Google Sheets llamado `Finanzas Personales` y se ejecuta principalmente desde Google Apps Script. GitHub/Vercel funcionan como puente visual para usar la app sin el aviso de Google Apps Script y con icono propio en iPhone.

El sistema es de uso personal. No esta pensado para multiples usuarios, roles, login complejo ni colaboracion.

## Necesidades principales del usuario

La app se usa varias veces al dia, especialmente desde iPhone, para registrar movimientos inesperados y evitar olvidar transacciones. El foco no es solo "ver reportes", sino mantener el saldo disponible alineado con bancos, efectivo y tarjetas.

La informacion que debe verse rapido es:

- Saldo disponible real.
- Ingresos, egresos y ahorros del mes.
- Distribucion del gasto por categoria: Necesidades, Deseos, Deudas y Ahorros.
- Estado de tarjetas de credito: consumos, valor recogido y saldo por recoger.
- Flujo de caja y balance sin romper la estructura del libro.

La accion mas frecuente es registrar egresos. Luego vienen ingresos, ahorros, cargos de tarjeta y abonos de tarjeta.

## Estilo visual esperado

La interfaz debe sentirse como app nativa de iPhone:

- Liquid glass suave.
- Frutiger Aero claro.
- Fondos frescos, celestes, verdes y degradados relajantes.
- Tipografia tipo Apple / San Francisco o Helvetica Neue.
- Nada con estilo de programacion, como JetBrains Mono o Roboto Mono.
- Nada de dashboard generico pesado.
- Mobile first, pero usable tambien en PC.

En iPhone debe cuidar:

- Safe area superior e inferior.
- Barra inferior compacta.
- Fondo llegando hasta el borde visual.
- Elementos sin invadir notch o Dynamic Island.
- Tablas legibles y con scroll horizontal solo cuando sea necesario.

## Archivos importantes

Fuente principal para Apps Script:

- `appscript/Code.gs`: logica backend para Sheets.
- `appscript/index.html`: interfaz principal para Apps Script.

Copias para Vercel/GitHub:

- `index.html`
- `public/index.html`

Cuando se cambia la interfaz real, primero se debe modificar `appscript/index.html` y luego sincronizar las copias web. Cuando se cambia la logica real, se debe modificar `appscript/Code.gs`.

## Flujo de despliegue

### Apps Script

1. Copiar el contenido de `appscript/Code.gs` al archivo `Código.gs` de Apps Script.
2. Copiar el contenido de `appscript/index.html` al archivo `index.html` de Apps Script.
3. Guardar.
4. Ir a `Implementar > Administrar implementaciones`.
5. Editar la implementacion existente.
6. Seleccionar `Nueva version`.
7. Implementar.

Se puede mantener el mismo link de Apps Script si se actualiza la implementacion existente.

### Vercel

Vercel lee desde GitHub. Despues de hacer commit y push a `main`, Vercel deberia desplegar automaticamente.

La app en Vercel debe verse igual que Apps Script. Vercel no debe convertirse en otra version visual ni funcional.

## Orden correcto de trabajo

1. Mantener Apps Script funcional.
2. Ajustar estructura de paginas.
3. Corregir mobile/safe area.
4. Ajustar tarjetas.
5. Ajustar tablas de Flujo y Balance.
6. Afinar estetica.
7. Solo despues agregar funciones nuevas.

Si una funcion nueva rompe la experiencia principal, se revierte.

## Paginas actuales

Orden de navegacion:

1. Inicio
2. Historial
3. Tarjetas
4. Flujo
5. Balance

La pagina Japon no debe existir como pagina independiente. La meta Japon debe vivir como tarjeta/modal dentro de Inicio.

## Inicio

Debe mostrar:

- Logo completo de Jaeger.
- Tarjeta principal con saludo segun hora: buenos dias, buenas tardes o buenas noches.
- Saldo disponible.
- Estado positivo si el saldo es mayor al minimo quincenal definido.
- Botones de accion: Ingreso, Egreso, Ahorro.
- Resumen mensual en tres tarjetas alineadas: Ingresos, Egresos, Ahorros.
- Distribucion del mes: Necesidades, Deseos, Deudas, Ahorros.
- Tarjetas de analisis rapido:
  - Ahorro mensual: total ahorrado y subcategorias donde hubo margen.
  - Sobregasto: total excedido y subcategorias excedidas.
- Tarjeta/meta de Japon con modal.

No debe mostrar una tarjeta extra de total ingresos debajo del resumen, ni una tarjeta final de ultimos movimientos si ya no aporta.

## Historial

Cada movimiento debe mostrar:

- Icono de direccion:
  - Flecha verde hacia arriba para ingreso.
  - Flecha roja hacia abajo para egreso.
  - Icono de dolar azul para ahorro.
- Subcategoria.
- Fecha.
- Nota si existe.
- Monto.
- Debajo del monto, solo el saldo despues de la transaccion, sin texto extra.

Al tocar una transaccion debe abrir un modal con detalle, editar y eliminar.

Debe tener:

- Selector de mes en header.
- Alternador recientes/antiguos para el mes seleccionado.
- Filtros por tipo: Todos, Ingresos, Egresos, Ahorros.
- Si se elige tipo, debe aparecer filtro de categoria, no de subcategoria.
- Orden por fecha real del movimiento, no por orden de captura solamente.

## Tarjetas

Tarjetas disponibles:

- Visa Personal: naranja.
- Mastercard Gold GC: dorada/gold.

La seleccion debe sentirse tipo wallet:

- Primero se muestran ambas tarjetas.
- Al seleccionar una, la otra queda escondida detras con una pestana util para cambiar.
- La tarjeta seleccionada define los datos visibles.
- No selector desplegable de tarjeta.

La pagina debe mostrar:

- Header con isotipo y nombre de tarjeta.
- Selector de año y mes en header.
- Botones: `+ Cargo` y `+ Abono`.
- KPIs:
  - Consumos del mes.
  - Valor recogido.
  - Saldo por recoger.
  - Si el saldo por recoger es 0: "Al dia".
  - Si es menor a 0: "Saldo a favor".
- Tabla de cargos del mes:
  - Cargo.
  - Valor.
  - Saldo recogido.
  - Saldo pendiente.
- Registro historico transaccional anual.

Al tocar la tarjeta seleccionada se abre un modal con:

- Debes pagar.
- Valor recogido.
- Por recoger.
- Resumen del mes con titulos de fila:
  - Saldo anterior.
  - Consumos.
  - Pagos / Creditos.
  - Total / Saldo Rotativo.
  - Saldo Diferido.
  - Saldo Real.
- Registros realizados desde la app.

Al tocar una fila de cargo del mes se abre un modal de detalle del cargo con tres botones alineados:

- Editar: azul.
- Abonar: verde.
- Eliminar: rojo.

El modal de abono debe permitir:

- Abono general.
- Abono a un cargo especifico.
- Elegir mes al que se aplica el abono.
- Registrar fecha real del egreso.
- Usar teclado numerico en campos de monto.
- Aceptar coma o punto como decimal.

## Logica de tarjetas y abonos

Para tarjetas hay dos conceptos separados:

- `mesRegistro`: mes real donde sale el dinero y afecta saldo disponible/flujo de caja.
- `mesAplica`: mes del ciclo de tarjeta donde se aplica el pago o credito.

Ejemplo:

Si el usuario registra el 21 de mayo un abono de tarjeta para cubrir el ciclo de Junio 26:

- El egreso debe afectar el saldo disponible de Mayo 26.
- El abono debe sumar en `Pagos / Creditos` de Junio 26.

Esto permite registrar abonos anticipados sin dañar el saldo real del mes en curso.

Los abonos generales no deben repartirse automaticamente entre cargos especificos. Solo los abonos vinculados a un cargo deben llenar el saldo recogido de esa fila.

## Flujo

La pagina Flujo debe estar guiada por su tabla principal.

Debe conservar la estructura del libro:

- Ingresos.
- Egresos.
- Flujo operativo.
- Saldo inicial.
- Flujo de caja acumulado.
- Meses.
- Total.

Puede tener KPIs o grafico arriba, pero la tabla manda.

En movil:

- La tabla debe ser usable.
- Scroll horizontal bien resuelto.
- No deben superponerse letras al scrollear.
- Debe mantener la misma informacion que PC.

## Balance

La pagina Balance debe estar guiada por su tabla principal.

Debe mostrar claramente:

- Activos.
- Pasivos.
- Patrimonio.
- Cuenta.
- Valor.

En movil, el problema principal a evitar es que se corte la columna de valores. Debe usar bien:

- Ancho real.
- Alto real.
- Safe area.
- Padding inferior por barra de navegacion.
- Tabla legible.

## Loading

La pantalla de carga debe usar la imagen de Jaeger proporcionada por el usuario y conservar una barra/mensaje de progreso:

- Preparando paginas.
- Cargando datos.
- Lista.

Debe cargar lo necesario antes de entrar, idealmente en 2 a 3 segundos, con 5 segundos como maximo esperado.

## Funciones pausadas o descartadas por ahora

Calendario y notificaciones quedaron pausados. No deben retomarse sin definir primero exactamente:

- Que notificaciones son necesarias.
- Donde se muestran.
- Como se archivan.
- Si realmente aportan al uso diario.

La prioridad vuelve a ser que el sistema principal sea estable.

## Principio de trabajo

No se debe adelantar una implementacion si no esta claro el uso real. Primero se confirma la logica, luego se hace preview si aplica, y solo despues se integra en `appscript/index.html` y `appscript/Code.gs`.

La app debe servir al usuario en su rutina diaria, no convertirse en un experimento visual o tecnico.
