# Loop 15 — Lo que ya terminé (historial del operario)

> Ítem 4 del control cruzado (viejo: pestaña "terminadas" de `ModuloImpresionesView` y `MisRegistros`). Hoy, al finalizar una tarea, desaparece de Mi trabajo y el operario no ve lo que hizo.

## 1. Qué ve el operario
En **Mi trabajo**, arriba, dos pestañas: **Pendientes** (lo de hoy) y **Terminadas**.
- **Terminadas**: sus tareas en LISTO, de la más reciente a la más vieja, 25 por página. Cada fila: OT · cliente, qué hizo, cuándo la terminó, **cuánto tiempo le llevó** (suma de sus tramos, con su fracción de tanda del Loop 12 y la hora efectiva del Loop 13), cantidad y unidad si tenía.
- Filtro de fechas: **Esta semana** (por defecto), **Semana pasada**, **Este mes**, o rango.
- Arriba del listado: **"Esta semana trabajaste 32 h 15 min"** (todas sus horas del período, terminadas o no).
- Sin montos, sin tarifas.

## 2. API
- `GET /api/mi-trabajo/terminadas?desde&hasta&pagina` (sesión con persona vinculada): `{ items, total, pagina, horas_periodo_segundos }`. `desde`/`hasta` en fecha de Asunción; tope 92 días.
- Una consulta para la página y una para el total de horas; las dos interpolan parámetros (regla del pooler).

## 3. Criterios de aceptación
- **CA-15.1** Una tarea finalizada aparece en Terminadas con su tiempo total (2 tramos de 30 min → 1 h).
- **CA-15.2** Solo las propias: tareas de otra persona no aparecen.
- **CA-15.3** Filtro de fechas por fecha de terminado (Asunción); paginado de 25.
- **CA-15.4** "Esta semana trabajaste…" suma todos los tramos de la persona en el período, también de tareas no terminadas.
- **CA-15.5** La respuesta no trae montos ni tarifas.
- **CA-15.6** Recorrido Playwright en celular: finaliza una tarea → pestaña Terminadas → la ve con su tiempo.

## 4. Supuestos a confirmar
- La "fecha de terminado" es la del evento LISTO en `tarea_evento`.
