# Loop 10 — Tablero de Inicio (diseño de Claude)

> **Estado:** CERRADO el 2026-11-09. La primera versión (`8fe9cae`) salió sin diseño ni tests suficientes (falta reconocida); este loop la rehizo con criterios de aceptación y tests, y corrigió los errores de §4. CA-10.1 a CA-10.9 verificados (ver `MESA_CLAUDE.md`).

## 0. Qué resuelve
Juan y Sofi abren el sistema y ven **en una pantalla** qué está pasando hoy y qué espera una decisión de ellos, sin recorrer cada módulo. Cada número lleva a la lista filtrada que lo explica.

## 1. Quién lo ve
- `GET /api/inicio` exige sesión y la capacidad `comercial` (`admin` pasa siempre). Taller, montaje, diseño y RR.HH. sin `comercial` reciben **403**; sin sesión, **401**.
- Al entrar a `/`: comercial y admin → `/inicio`; operarios (taller, montaje, diseño sin comercial) → `/mi-trabajo`; RR.HH. sin comercial → `/personas`.
- Los montos del mes (`mes`) solo van a quien cumple `puedeVerCostos` (hoy admin y comercial, así que coincide con el acceso; queda la regla por si cambia). Si no puede, `mes = null`.

## 2. Reglas de cada número ("hoy" y "mes" en hora de Asunción)
| Clave | Regla |
| :--- | :--- |
| `ots_por_estado` | OTs **abiertas** por estado (`PENDIENTE`, `EN_DISENO`, `EN_TALLER`, `EN_MONTAJE`) + `TERMINADO` = OTs con costeo congelado `TERMINADO` **creado este mes**. Las canceladas no se muestran. |
| `trabajando_ahora` | Intervalos de cronómetro **abiertos** de personas activas, con persona, tarea, OT y cliente, del más antiguo al más nuevo. |
| `atrasadas_total` / `atrasadas` | OTs abiertas con `fecha_prometida` **anterior a hoy** (la de hoy no está atrasada). El total es real; la lista trae las 10 más atrasadas. |
| `pedidos_nuevos_total` / `pedidos_nuevos` | Pedidos del portal en `NUEVO`. Total real; lista con los 5 más recientes. |
| `disenos_por_verificar` | Versiones de diseño `PENDIENTE` (la misma regla que la pantalla Diseños). |
| `presupuestos_enviados` | Cantidad en `ENVIADO` y suma de `total_gs` (**sin IVA**, el mismo número que muestra la lista de Presupuestos). |
| `permisos_pendientes` | Solicitudes de permiso en `PENDIENTE`. |
| `hojas_hoy` | Hojas de ruta con fecha de hoy: vehículo, cuadrilla activa, paradas y paradas resueltas (`COMPLETADA` u `OMITIDA`). |
| `mes` | OTs **terminadas este mes con venta** (`monto_presupuestado_gs > 0`): vendido, costo real congelado y cantidad. El margen se calcula sobre la venta. Las OTs sin presupuesto no entran (no tienen margen). |

## 3. Pantalla `/inicio`
- Cinco indicadores de OTs (cada uno abre `/ots?estado=…`), cuatro de pendientes (pedidos, diseños, presupuestos enviados, permisos), tres de dinero del mes (solo si `mes` no es null) y cuatro bloques: trabajando ahora, salidas de hoy, OTs atrasadas, pedidos nuevos.
- Ámbar si hay algo esperando una decisión (pedidos, diseños, permisos, atrasadas); verde para terminadas y margen.
- Se actualiza sola cada 30 s (el mismo ritmo que "En vivo"). Estados: cargando, error con mensaje, vacío por bloque.
- Celular (375 px): indicadores en 2 columnas, montos en 1 columna, nada se corta ni se sale de la pantalla.

## 4. Correcciones respecto de la primera versión
1. "Pedidos nuevos" y "OTs atrasadas" mostraban la cantidad de filas de la lista (tope 5 y 10), no el total → se agregan `pedidos_nuevos_total` y `atrasadas_total`.
2. Presupuestos enviados sumaba `precio_final_gs` sobre `total_gs`; `total_gs` ya lo incluye al enviar → se suma solo `total_gs`.
3. "Terminadas (mes)" contaba OTs por `updated_at`; ahora cuenta por el costeo congelado (el evento de cierre), que no cambia.

## 5. Rentabilidad (arreglo relacionado)
`GET /api/costeo/ots` → `resumen.costo_gs` es el costo de las OTs **con venta** (el mismo que da el margen) y `resumen.costo_sin_venta_gs` el de las OTs cerradas sin presupuesto; la pantalla lo muestra aparte en ámbar.

## 6. Criterios de aceptación
- **CA-10.1** Acceso: comercial y admin 200; taller 403; sin sesión 401.
- **CA-10.2** Cada número de §2 sube exactamente lo esperado al crear un escenario conocido (test por diferencia antes/después, la base de dev es compartida).
- **CA-10.3** Una OT prometida para hoy no está atrasada; una terminada o cancelada tampoco.
- **CA-10.4** Los totales de pedidos y atrasadas no tienen tope.
- **CA-10.5** `mes` suma solo OTs terminadas con venta.
- **CA-10.6** Rentabilidad: `costo_gs` + `costo_sin_venta_gs` = costo total; el margen usa solo `costo_gs`.
- **CA-10.7** Pantalla: muestra los totales (no el largo de las listas), oculta el dinero si `mes` es null, calcula el margen, enlaza a las listas filtradas, y tiene estados de carga, error y vacío.
- **CA-10.8** Portal: mientras cargan los pedidos o trabajos dice "Cargando…", nunca "Todavía no hiciste pedidos".
- **CA-10.9** Recorrido en navegador (escritorio y 375 px): login de comercial → Inicio con números del escenario → clic en un indicador abre la lista filtrada; sin desbordes horizontales.

## 7. Pruebas
`tests/loop10/inicio-api.test.ts` (CA-10.1 a CA-10.5) · `tests/loop10/rentabilidad-resumen.test.ts` (CA-10.6) · `apps/web/src/routes/inicio.test.tsx` (CA-10.7) · `apps/web/src/routes/portal.test.tsx` (CA-10.8) · `scripts/prueba-inicio.cjs` (CA-10.9).
