# Loop 6 — Costeo real por OT (diseño de Claude Code)

> **Estado:** IMPLEMENTADO por Claude Code el 2026-11-03, sin commit. Migración `0014_costeo.sql`.

## 0. Qué responde
"¿Cuánto nos costó de verdad esta OT y cuánto ganamos?" — comparado con lo vendido **sin IVA** (`monto_presupuestado_gs`, que sale del presupuesto aprobado con el margen sobre la venta).

## 1. Cómo se calcula (en Postgres, `NUMERIC` exacto)
- **Mano de obra:** cada intervalo **cerrado** del cronómetro × la tarifa de la persona **vigente el día (Asunción) en que empezó el intervalo** (`tarifa_persona`, sin solapamiento por restricción). Incluye a Comercial y a Nachi si tienen tarifa.
  - Horas sin tarifa vigente cuentan **0** y salen como **alerta** (no se inventa un costo).
  - Un cronómetro todavía corriendo no cuenta (alerta). Al terminar/cancelar la OT ya no puede haber ninguno (regla del Loop 2).
- **Material:** `consumo_insumo` con su costo **congelado al cargar** (las correcciones negativas restan). El desperdicio se muestra aparte, dentro del material.
- **Vehículo:** cada **viaje cerrado** de una hoja de ruta se reparte **en partes iguales** entre las OTs con parada **no omitida** en esa hoja; km × `costo_km_gs` del vehículo. Un viaje sin hoja de ruta no se imputa a ninguna OT (gasto general).
- **Margen real** = (venta − costo) ÷ venta, como el margen del presupuesto. Sin venta → sin margen (alerta).

## 2. Snapshot de cierre (único redondeo, principio 6)
- Tabla `ot_costeo`, **inmutable** (trigger + solo `SELECT`/`INSERT` para `afull_api`), **una por OT**.
- Se genera **en la misma transacción** que pasa la OT a `TERMINADO` **o** `CANCELADO` (cancelar también tiene costo real).
- Cada componente se redondea **una vez** sobre su suma exacta; `total_gs = mano_obra_gs + material_gs + km_gs` (CHECK), así la pantalla siempre suma.
- Después del cierre, un precio o costo por km nuevo **no lo cambia**. Una OT abierta sí ve los valores actuales.
- OTs cerradas **antes** de esta migración no tienen snapshot: se muestran calculadas a la fecha.

## 3. API (solo admin y comercial)
- `GET /api/costeo/ot/:id` → congelado si existe; si no, a la fecha. Con detalle por persona/proceso, viajes y alertas.
- `GET /api/costeo/proyecto/:id` → cada OT (congelada o a la fecha) y el consolidado con margen sobre el total vendido.
- `GET /api/costeo/ots?q&estado&desde&hasta&pagina` → **Rentabilidad**: OTs cerradas, 25 por página, filtro por estado de cierre y rango de fechas de cierre, más un resumen (vendido, costo, margen global solo sobre OTs con venta).

## 4. Pantallas
- **Detalle de OT:** sección "Costo real" (mano de obra con horas, material con desperdicio, vehículo con km, total, venta, resultado y margen con color: rojo < 0, ámbar < 20 %, verde ≥ 20 %), alertas, tabla por persona y proceso, cuenta de cada viaje.
- **Detalle de proyecto:** "Costo real vs. presupuestado" por OT y total.
- **Rentabilidad** (menú, comercial/admin): listado estándar (buscador 300 ms, estado, fechas, 25 filas) con resumen arriba.

## 5. Pruebas
- `tests/loop6/costeo-api.test.ts` (CA-6.1 a CA-6.4): cálculo exacto, congelado al cerrar e inmutable, cancelar congela, consolidado de proyecto (70,31 %), listado, 403 para taller/montaje/diseño/rrhh.
- `scripts/prueba-loop6.cjs`: 5/5 en navegador.

## 6. Supuestos a confirmar con Juan
1. **Reparto de km en partes iguales** entre las OTs de la hoja. Alternativa: por distancia de cada parada (requiere ruta; ver OSRM en TRASPASO §3).
2. El **tiempo de viaje** de la cuadrilla no se imputa (solo lo cronometrado en tareas). Si se quiere, se puede cronometrar "Traslado" como proceso de la OT.
3. **Umbral ámbar del 20 %** para el margen real.
4. El costo por km es el **actual del vehículo** hasta que la OT cierra (no hay historial de costo por km).
