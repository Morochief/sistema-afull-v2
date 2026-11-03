# Loop 5 — Insumos y consumos (diseño de Claude Code)

> **Estado:** L5.E1 (base, API, importador) IMPLEMENTADA por Claude Code el 2026-11-03, sin commit. L5.E2 (pantallas) pendiente.

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
Lee el CSV exportado del Excel; prueba sin escribir por defecto, `--aplicar` para cargar. Con la planilla actual: **246 insumos** listos y **15 a revisar a mano** (sin unidad, sin costo o repetidos). **No se corrió contra `afull-dev`**: son datos reales (bloqueo de TRASPASO §12) — decide el usuario.

## 5. Pendiente (L5.E2)
- "Cargar material" en cada tarjeta de "Mi trabajo" y en "En la calle" (buscador de insumo + cantidad).
- Calculadora de merma y de plancha compartida para Edu.
- Sección "Material" en el detalle de OT (líneas, corrección, total).
- Pantalla de catálogo y precios (admin).
