# Loop 5 — Insumos y consumos (diseño de Claude Code)

> **Estado:** L5.E1 (base, API, importador) en main (`2613f63`). L5.E2 (pantallas), precios solo para admin y comercial, e importación del catálogo: IMPLEMENTADO por Claude Code el 2026-11-03, sin commit.

## 0. Decisiones del usuario (2026-11-03)
1. El **Excel de insumos** es el catálogo (cómo compran: costo y unidad).
2. **No se lleva stock.** Se registra qué material se usó en cada OT y a qué costo. (Si algún día se quiere stock, se agrega encima.)
3. **Cada operario carga lo que usó.** Edu además tiene la merma de bobina y el reparto de planchas compartidas (REQ-04).

## 1. Modelo — `0013_insumos_consumos.sql`
- `insumo` (nombre + unidad únicos; unidades normalizadas: UNIDAD, METRO, M2, PLANCHA, LITRO, KG, ROLLO, LATA, BOLSA, PAR, TIRA, MINUTO, KM; sector).
- `insumo_precio`: historial **inmutable**; el vigente es el último.
- `consumo_insumo`: **inmutable**; OT (abierta), tarea opcional **de la misma OT** (FK compuesta), persona, quién cargó, cantidad, **costo unitario congelado**, desperdicio sí/no, grupo (merma/compartido), idempotencia. **Corrección = consumo negativo** que referencia al original, con motivo, una sola vez.

## 2. Fórmulas — `packages/shared/src/formulas/material.ts` (BigInt exacto)
- `calcularMerma(ancho, largo, piezas)` → m² usados, de piezas, desperdicio y % de aprovechamiento (ej. 1,52 × 1,60 con 3 piezas de 1 × 0,5 → 61,7 %).
- `repartirCantidad(total, pesos)` → plancha compartida proporcional a los m² de cada OT; Σ exacta.
- `normalizarUnidad(texto)` → unidades de la planilla.

## 3. API
- `GET /api/insumos?q&sector` (taller, montaje, diseño, comercial) con precio vigente · `POST /api/insumos`, `PATCH /:id`, `POST /:id/precios` (admin).
- `POST /api/consumos` · `POST /api/consumos/merma` (piezas + desperdicio, con insumo de desperdicio opcional, como "Adhesivo desperdicio" de la planilla) · `POST /api/consumos/compartido` · `POST /api/consumos/:id/anular` (quien cargó o comercial) · `GET /api/consumos/ot/:otId` (con total y total de desperdicio).

## 4. Importador — `scripts/importar-insumos.ts`
Lee el CSV exportado del Excel; prueba sin escribir por defecto, `--aplicar` para cargar. Con la planilla actual: **246 insumos** listos y **15 a revisar a mano** (sin unidad, sin costo o repetidos). El usuario autorizó cargarlo en `afull-dev` (ver §7).

## 5. Pantallas (L5.E2)
- **Mi trabajo:** cada tarjeta (salvo diseño) tiene **Material** (buscador de insumo con debounce de 300 ms, cantidad con coma decimal, "es desperdicio", nota; se pueden cargar varios seguidos). En impresión, ploteo, corte y refilado además **Merma** (ancho del material, largo usado y piezas; vista previa con `calcularMerma` antes de guardar) y **Compartido** (cantidad total y m² de cada OT asignada; mínimo 2).
- **En la calle:** botón **Material** en cada parada (la parada ahora trae `orden_trabajo_id`).
- **Detalle de OT:** sección **Material usado** con las líneas, quién y cuándo, marca de desperdicio, total y total de desperdicio; **Corregir** pide motivo y carga el negativo (la línea original queda gris).
- **Insumos** (menú, solo admin): alta, búsqueda, precio nuevo (clic en el precio) y activar/desactivar. Cambiar un precio no toca lo ya cargado.
- Recorrido `scripts/prueba-loop5.cjs`: 7/7 en verde (merma 65,8 %, total 111.400 → corrección 106.400 → precio nuevo sin efecto en lo cargado).

## 6. Precios: solo admin y comercial (decisión del usuario, 2026-11-03)
- `puedeVerCostos(capacidades)` en `@afull/shared` (admin o comercial).
- `GET /api/insumos`: a los operarios les llega `costo_unitario_gs: null` (eligen el material viendo solo nombre y unidad).
- `GET /api/consumos/ot/:otId` (lleva costos): solo comercial/admin (403 para taller, montaje y diseño). Las respuestas de carga no llevan dinero.
- `GET /api/flota/vehiculos`: a la cuadrilla no le llega `costo_km_gs`.
- Pruebas: `tests/loop5/costos-visibles.test.ts`; el recorrido `prueba-loop5.cjs` verifica que Edu no ve "Gs." en ningún momento.

## 7. Importación del catálogo real
- El usuario pidió importar **todos** los insumos en `afull-dev`. El CSV corregido (`Documentos/insumos_corregido.csv`, **fuera del repo**) resuelve las 15 filas a revisar: 7 sin unidad (se infirió por el costo y el nombre: 2 en m², 1 por metro, 4 por unidad), 5 repetidas idénticas (se ignoran), el caño repetido con costo por metro (se cargó aparte como "por metro") y una melamina repetida con otro costo (se dejó el primer precio; **Juan debería confirmarlo**). Una fila sin costo se importa sin precio: hay que cargarlo en "Insumos" antes de usarla.
- Resultado: **255 insumos**, 1 sin precio. El importador ahora ignora las repetidas idénticas e importa sin precio las filas sin costo. Correrlo dos veces no duplica (probado).

## 8. Pendiente
- "Compartido" no tiene recorrido de navegador (el reparto está probado en la API).
