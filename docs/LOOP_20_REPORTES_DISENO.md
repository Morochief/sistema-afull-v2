# Loop 20 — Reportes: registros como el Excel de Juan, planilla de horas para pagar y pre-factura

> Pedido del usuario (17/11): "planilla de horas para pagar, en Excel… va junto con la pre-factura por cliente". Ítem 3 del control cruzado: el viejo tenía `Reportes.tsx` (registros exportables a Excel y pre-factura imprimible por proyecto). El Excel que hoy arma Juan tiene las columnas **Proyecto, Fecha, Concepto, Descripción, Hs Inicio, Hs Fin, Hs Total, Cantidad, Precio Unitario, Total** (MO a 350 Gs/min, insumos, combustible).

## 1. Pantalla nueva **Reportes** (menú; tres pestañas)

### 1.1 Registros (Juan, Gerardo, Sofi: capacidad `comercial`)
- Filtros: **Desde / Hasta** (obligatorios, máx. 366 días), **Cliente**, **Proyecto**, **Persona**, **Concepto** (Mano de obra / Insumo / Vehículo).
- Tabla de 25 por página (orden por fecha) + totales del filtro: mano de obra, insumos, vehículos, total, horas.
- **Descargar Excel** con todas las filas del filtro: hoja "Registros" con las columnas del Excel de Juan (+ OT y Cliente) y hoja "Resumen" (por concepto y por persona).
- Qué es cada fila:
  - **MO**: un tramo del reloj (`v_mano_obra`: hora efectiva del Loop 13 y fracción de tanda del Loop 12). Descripción "Edu · Imprimir lona" (+ "tanda 2 de 3,5 m²", "a mano", "corregido"). Hs inicio/fin en Asunción; Cantidad = minutos imputados; Precio unitario = tarifa por minuto (tarifa/60); Total = minutos × precio, redondeado a Gs.
  - **Insumo**: una línea de `consumo_insumo` (las correcciones van en negativo). Descripción: nombre del insumo (+ "desperdicio"); cantidad con su unidad; precio = costo congelado; total.
  - **Vehículo**: la parte de un viaje cerrado que le toca a la OT (km ÷ OTs de la salida, como el costeo). Descripción "Viaje AAA 001 · 42 km ÷ 3 OTs"; cantidad = km; precio = costo por km.
- Cada total de fila se redondea a Gs.; el total del reporte es la suma de las filas (puede diferir en ±1 Gs por OT del costeo, que redondea una vez por componente).

### 1.2 Horas para pagar (Juan, Sofi: capacidad `rrhh`)
- Desde / Hasta. Una fila por persona: **horas trabajadas** (tiempo real del reloj con la hora efectiva; en una tanda cuenta el tiempo entero, porque es lo que trabajó), cantidad de tramos, **a pagar** (cada tramo × la tarifa vigente ese día), aviso "sin tarifa" y "tiene un reloj abierto" (no se cuenta hasta cerrarlo).
- **Descargar Excel**: hoja "Resumen" (persona, horas hh:mm, Gs.) y hoja "Detalle" (persona, fecha, inicio, fin, minutos, OT, cliente, tarea, a mano/corregido, Gs.).

### 1.3 Pre-factura (`comercial`)
- Por **Proyecto** o por **Cliente + período** (OTs con registros en el período).
- Muestra: cliente (nombre, razón social, RUC), las OTs con su estado y monto presupuestado; **costo** mano de obra, insumos (incluye desperdicio) y vehículos; **costo base**.
- **Margen sobre venta %** (por defecto 30, el mismo criterio que el presupuesto: precio = costo ÷ (1 − margen)); **precio sugerido sin IVA**, IVA 10 % y total. Si las OTs tienen presupuesto, muestra al lado el **monto presupuestado** para comparar.
- **Imprimir / Guardar PDF**: hoja A4 blanca con el resumen y el detalle de registros. Es un documento interno (no reemplaza a la factura legal).

## 2. API (`apps/api/src/modules/reportes/`)
- `GET /api/reportes/registros?desde&hasta&clienteId&proyectoId&personaId&concepto&pagina` → `{ items, total, totales }`.
- `GET /api/reportes/registros.xlsx` (mismos filtros, hasta 50.000 filas; si hay más, 400 "achicá el período").
- `GET /api/reportes/horas?desde&hasta` y `GET /api/reportes/horas.xlsx` (`rrhh`).
- `GET /api/reportes/prefactura?proyectoId` o `?clienteId&desde&hasta` → `{ cliente, proyecto, ots, mano_obra_gs, insumos_gs, vehiculos_gs, costo_base_gs, monto_presupuestado_gs, registros }`.
- Excel con `exceljs` (fijado), números como números (no texto), guaraníes sin decimales, encabezado en negrita, filtros automáticos. Celdas de texto que empiezan con `= + - @` se escapan (inyección de fórmulas).
- Sin tablas nuevas: lee `v_mano_obra`, `v_tramo`, `consumo_insumo`, `viaje`.

## 3. Criterios de aceptación
- **CA-20.1** Registros de una OT con 1 h de Edu (21.000 Gs/h), 3 m² de lona a 18.000 y 0,5 m² de desperdicio, y un viaje de 30 km a 2.000/km con 2 OTs: filas MO 60 min × 350 = 21.000; insumo 54.000; desperdicio 9.000; vehículo 15 km × 2.000 = 30.000; total 114.000; igual al costo de la OT.
- **CA-20.2** Una tanda (2 y 1 m²) de 1 h: dos filas MO de 40 y 20 min; una corrección del Loop 13 acorta la fila; un tramo a mano dice "a mano".
- **CA-20.3** Filtros por cliente, persona y concepto; paginado de 25; fuera de rango de fechas no aparece.
- **CA-20.4** El Excel abre con exceljs: hoja "Registros" con las columnas del Excel de Juan y los mismos totales; números como números; un texto "=HYPERLINK(...)" queda escapado.
- **CA-20.5** Horas para pagar: 2 h a 21.000 + 1 h de otra persona sin tarifa → 42.000 y aviso "sin tarifa"; un reloj abierto se avisa y no suma; en una tanda cuenta la hora entera.
- **CA-20.6** Pre-factura por proyecto: suma de sus OTs; margen 30 % → precio = costo ÷ 0,7, IVA 10 %.
- **CA-20.7** Permisos: taller → 403 en todo; comercial sin rrhh → 403 en horas; rrhh sin comercial → 403 en registros y pre-factura.
- **CA-20.8** Recorrido Playwright: Juan filtra por cliente, descarga el Excel (se abre y suma lo mismo), arma la pre-factura de un proyecto con 30 % e imprime (vista A4).
