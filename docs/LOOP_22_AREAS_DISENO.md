# Loop 22 — Áreas de trabajo y procesos de aFull

> Pedido de aFull (José, 24/11/2026), con la lista de tareas por área (imágenes en el chat).
> - "Lo ideal es saber cuánto dura x trabajo en el área de trabajo", y "ver en qué área se fueron más horas".
> - "Montaje" (Impresiones) es el "tetris" que hace Edu antes de imprimir.
> - "Ploteo y lijado" es de Terminaciones; "Enduido y lijado" es de Carpintería/Pintura. Son procesos distintos.
> - "Redes sociales" son publicaciones de aFull (trabajo interno, de Nachi).
> - Medidas en cm también en Corte MDF. "Despiece" es calcular los materiales: sin medidas.

## Decisiones

1. **Áreas = las de aFull**, fijas en el código y con `CHECK` en la base, como antes: Terminaciones, Carpintería,
   Pintura, Impresiones, Herrería, Logística y Diseño. Se suman **Montaje e instalación** (la cuadrilla: Montaje /
   colocación, Reparación), **Administración** (Presupuesto, Compra) y **Otro**, que la lista de José no cubre.
   *Supuesto a confirmar:* Montaje e instalación como área propia.
2. **El mismo nombre en áreas distintas** ("Lijado" en Carpintería y en Pintura): el nombre es único **por área**.
   Al crear uno repetido, el código lleva el área (`LIJADO_PINTURA`).
3. **Medidas en cm y tanda** dejan de ser una lista fija en el código (`TIPOS_CON_MERMA`): son una marca del
   proceso (`con_medidas`), que admin prende o apaga en Procesos. Arranca en Impresión, Ploteo, Corte adhesivo,
   Refilado y Corte MDF.
4. **Catálogo según la lista de José.** Se renombran los que ya estaban y se agregan los que faltan (tabla abajo).
   Los que no están en su lista quedan activos en "Otro" (Armado, Electricidad, Tensado, Control de calidad) o se
   desactivan ("Carpintería", que ahora es un área). Nada se borra: las tareas viejas siguen con su proceso.
5. **Horas por área:**
   - En la OT: el costo real suma, además de persona × proceso, **horas y costo por área**. Se guarda en el costo
     congelado al cerrar (los cierres viejos no lo tienen y no se muestra).
   - En Reportes, pestaña nueva **Horas por área** (comercial): por período (tramos que empezaron en esas fechas,
     ≤ 366 días), una fila por OT y una columna por área, con totales por área. Con tanda, el tiempo va repartido
     por m² como en el costo (`v_mano_obra`). Descarga en Excel.
6. **Trabajo interno** (Redes sociales, Limpieza, Carga de móvil): sin código. Se crea el cliente "aFull (interno)"
   con una OT por mes; queda en la guía. En Rentabilidad aparece como OT sin presupuesto (costo aparte).

## Catálogo resultante

| Área | Procesos (código) |
| --- | --- |
| Terminaciones | Ploteo (PLOTEO, medidas), Ploteo y lijado (PLOTEO_Y_LIJADO), Colocación de LEDs (COLOCACION_DE_LEDS), Corte adhesivo (TALLER_CORTE, medidas), Refilado (REFILADO, medidas), Carga de móvil (CARGA_DESCARGA), Relevamiento (RELEVAMIENTO), Enfilado (ENFILADO), Preparación de materiales (PREPARACION), Limpieza (LIMPIEZA) |
| Carpintería | Corte MDF (CORTE_MDF, medidas), Lijado (LIJADO), Fabricación (FABRICACION), Despiece de materiales (DESPIECE_DE_MATERIALES) |
| Pintura | Colocación de enduido (COLOCACION_DE_ENDUIDO), Colocación de enduido y lijado (COLOCACION_DE_ENDUIDO_Y_LIJADO), Lijado (LIJADO_PINTURA), Proceso de pintura (PINTURA) |
| Impresiones | Impresión (TALLER_IMPRESION, medidas), Montaje de impresión (MONTAJE_DE_IMPRESION) |
| Herrería | Fabricación (TALLER_HERRERIA), Despiece de materiales (DESPIECE_HERRERIA), Limpieza de caños (LIMPIEZA_DE_CANOS) |
| Logística | Retiro de materiales (RETIRO), Cobranza (COBRANZA), Entrega de recibo (ENTREGA_DE_RECIBO), Entrega de materiales (ENTREGA) |
| Diseño | Diseño (DISENO), Informe (INFORME), Redes sociales (REDES_SOCIALES), Preparación de originales (PREPARACION_DE_ORIGINALES), Medición (MEDICION) |
| Montaje e instalación | Montaje / colocación (MONTAJE_CALLE), Reparación (REPARACION) |
| Administración | Presupuesto (PRESUPUESTO), Compra de materiales (COMPRA) |
| Otro | Armado, Electricidad, Tensado, Control de calidad, Otro; Carpintería (desactivado) |

## Migración `0027_areas_trabajo`

- `tipo_tarea.area`: nuevo `CHECK` con las 10 áreas; los valores viejos se pasan según la tabla.
- `tipo_tarea.con_medidas BOOLEAN NOT NULL DEFAULT false`; `GRANT UPDATE` ya incluye la tabla entera.
- Índice único `(area, lower(nombre))` en lugar de `lower(nombre)`.
- Altas con `ON CONFLICT (codigo) DO NOTHING`; renombres y áreas con `UPDATE ... WHERE codigo = ...`.

## API

- `GET /api/procesos` devuelve `con_medidas`. `POST` acepta las áreas nuevas y `conMedidas`; si el código ya existe,
  usa `<CODIGO>_<AREA>`. `PATCH` acepta `conMedidas`.
- Mi trabajo: cada tarea trae `con_medidas` (los botones Medidas y Tanda se guían por eso, también sin señal).
- Tanda: rechaza (400) si alguna tarea es de un proceso sin medidas.
- Costeo: `mano_obra[].area` y `areas: [{ area, nombre, horas, costo_gs }]`.
- `GET /api/reportes/areas?desde&hasta[&clienteId&proyectoId]` → `{ areas: [{codigo, nombre, segundos}], filas:
  [{ ot_id, ot_codigo, cliente, titulo, por_area: { CODIGO: segundos }, segundos }] }`; `GET /api/reportes/areas.xlsx`.

## Criterios de aceptación

- **CA-22.1** El catálogo tiene las áreas y procesos de la tabla; "Lijado" existe en Carpintería y en Pintura;
  un área desconocida → 400 (API) y `23514` (base).
- **CA-22.2** Admin crea "Lijado" en Herrería → 201 con código `LIJADO_HERRERIA`; el mismo nombre en la misma área → 409.
- **CA-22.3** `con_medidas`: Corte MDF lo tiene; Mi trabajo lo informa; una tanda con un proceso sin medidas → 400;
  con Corte MDF + Impresión → 201.
- **CA-22.4** El costo de una OT trae horas por área, que suman las horas totales.
- **CA-22.5** Reporte por área: una OT con 1 h de Lijado (Carpintería) y 0,5 h de Proceso de pintura da
  Carpintería 3600 s y Pintura 1800 s; las columnas son las áreas con horas; solo comercial (403 para taller).
- **CA-22.6** (web) Procesos muestra las áreas nuevas y el interruptor "Medidas en cm"; Reportes → Horas por área.
- **CA-22.7** (recorrido) admin marca un proceso con medidas → Edu ve "Medidas (cm)" en esa tarea; Reportes →
  Horas por área muestra la OT con sus horas por área.

## Cambio de comportamiento aprobado

`tests/loop3/procesos-api.test.ts` creaba procesos con el área `TALLER`, que ya no existe: pasa a `CARPINTERIA` / `OTRO`.

## Ajuste 26/11 — el montaje va en Logística (`0028_montaje_logistica`)

José (25/11): la cuadrilla "entra en logística, pero también la gente de producción ayuda en montaje y/o instalación";
"todos los de producción deberían tener ese apartado de logística (montaje/desmontaje/instalación)".

- Se saca el área **Montaje e instalación**: Montaje / colocación y Reparación pasan a **Logística**, y se suman
  **Desmontaje** e **Instalación**.
- Producción ya tiene ese apartado: la capacidad `taller` incluye **En la calle** y cualquier persona puede tener
  una tarea de montaje o ir en una salida. No cambia ningún permiso.
- **CA-22.8:** Logística tiene Montaje / colocación, Desmontaje, Instalación y Reparación; el área `MONTAJE` → 400 (API)
  y `23514` (base). CA-22.1 pasa a buscar Montaje / colocación en Logística (cambio aprobado).
- Los costos ya congelados guardan el área que tenían al cerrar.
