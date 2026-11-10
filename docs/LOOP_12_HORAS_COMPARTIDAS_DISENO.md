# Loop 12 — Horas de máquina compartidas (Edu)

> Pedido del usuario (2026-11-10, ítem 1 del control cruzado con el sistema viejo). Antes: `ModuloImpresionesView` + `/api/operario/impresiones/lote-plancha/stop` del viejo.

## 1. Problema
Edu imprime o plotea **una tanda** con piezas de varios clientes. Hoy el material se reparte por m² (**Compartido**, Loop 5), pero el reloj corre en **una sola tarea**: todo el tiempo de máquina cae en una OT y las demás quedan con mano de obra 0.

## 2. Qué ve Edu
- En la tarjeta de una tarea de Impresión, Ploteo, Corte o Refilado (las mismas que tienen Merma y Compartido), **pendiente o pausada**, aparece el botón **Tanda compartida**.
- Ventana "Tanda para varios clientes": lista de **sus** tareas de esos tipos que están pendientes o pausadas, de OTs distintas, con hoja activa. Al lado de cada una, un casillero **m² de piezas** (vacío = no entra). La tarea desde la que abrió viene marcada.
- **Iniciar tanda**: exige al menos 2 tareas con m² > 0. El reloj arranca (uno solo: sigue valiendo "un reloj por persona").
- La tarjeta en curso dice **"Tanda: OT-0010 (2 m²) · OT-0011 (1,5 m²)"**. Pausar, reanudar y finalizar funcionan igual que siempre.
- Al **reanudar** una tanda, el tramo nuevo se reparte igual que el anterior (mismas tareas y m²).
- Al **finalizar**, quedan como LISTO **todas** las tareas de la tanda.

## 3. Modelo de datos (migración `0020_tanda_compartida`)
- `tanda` (id, persona_id, creada_por, created_at): agrupa las tareas. Inmutable.
- `tanda_tarea` (tanda_id, tarea_id, m2_piezas NUMERIC(12,4) > 0): PK (tanda_id, tarea_id). Inmutable. Una tarea no puede estar en dos tandas abiertas (se valida en la API con `FOR UPDATE`).
- `tarea_intervalo.tanda_id` (UUID NULL, FK): el tramo corre sobre la **tarea principal** (la primera) y apunta a su tanda. El trigger de inmutabilidad se amplía para que `tanda_id` no cambie.
- **Vista `v_mano_obra`** (una fila por tramo cerrado y OT): `intervalo_id, persona_id, tarea_id, orden_trabajo_id, hora_inicio, segundos, fraccion`.
  - Tramo sin tanda: una fila, fraccion = 1.
  - Tramo con tanda: una fila por tarea de la tanda, fraccion = m2 / Σ m2 de la tanda.
  - Usa la hora de fin **efectiva** (la del Loop 13 cuando exista; acá `hora_fin`).
- RLS + `GRANT SELECT` de la vista a `afull_api` (la vista es `security_invoker`).

## 4. Costeo
- `calcularCosteo` (OT), costeo de proyecto, Inicio y Rentabilidad toman la mano de obra de `v_mano_obra` (segundos × fraccion × tarifa). **Una sola fuente**: ninguna consulta vuelve a leer `tarea_intervalo` directo para costos.
- Redondeo: igual que hoy, una vez por componente al congelar la OT. La Σ de las fracciones de un tramo es exactamente 1 (NUMERIC); la diferencia de redondeo entre OTs queda dentro de ±1 Gs por OT (documentado).
- Cerrar una OT que está en una tanda con un tramo abierto: 409 (igual que hoy con un reloj abierto en la OT).

## 5. API
- `POST /api/mi-trabajo/tanda` `{ tareas: [{tareaId, m2Piezas}], claveIdempotencia }` → crea la tanda y abre el tramo sobre la primera (auto-pausa lo que tenga abierto, como `iniciar`).
- `POST /api/mi-trabajo/tareas/:id/reanudar` sobre una tarea principal de tanda: el tramo nuevo lleva el mismo `tanda_id`.
- `finalizar` sobre la principal: pasa a LISTO todas las tareas de la tanda (misma transacción, con eventos en `tarea_evento`).
- `GET /api/mi-trabajo`: cada tarea trae `tanda` `{ id, tareas: [{ codigo_ot, m2 }] } | null`. `segundos_acumulados` de cada tarea suma su fracción de los tramos de tanda.
- Validaciones: todas las tareas son de la persona, de tipos con merma, PENDIENTE/PAUSADA, de OTs distintas, con hoja ACTIVA y OT no final; m² > 0; entre 2 y 10 tareas.

## 6. Criterios de aceptación
- **CA-12.1** Una tanda de 2 tareas (2 y 1,5 m²) con 1 h cerrada: la OT A suma 2/3,5 h y la B 1,5/3,5 h de mano de obra; Σ = 1 h exacta.
- **CA-12.2** Un tramo normal (sin tanda) sigue cargando 100 % a su OT (sin regresión del costeo).
- **CA-12.3** Pausar y reanudar la tanda: el segundo tramo se reparte igual.
- **CA-12.4** Finalizar la tanda deja LISTO todas sus tareas.
- **CA-12.5** Rechazos 400: 1 sola tarea, tarea ajena, tipo sin merma, misma OT dos veces, m² ≤ 0, hoja en borrador. 409: una tarea ya en otra tanda abierta.
- **CA-12.6** `tanda`, `tanda_tarea` y el `tanda_id` del tramo no se pueden modificar ni borrar (triggers).
- **CA-12.7** Recorrido Playwright en celular: Edu arma la tanda, trabaja, finaliza; la oficina ve la mano de obra repartida en las dos OTs.

## 7. Supuestos a confirmar
- El reparto del **tiempo** es por m² de piezas, igual que el material (como el viejo).
- La tanda no se puede editar una vez iniciada; si se equivocó, finaliza y la oficina corrige con el Loop 13.
