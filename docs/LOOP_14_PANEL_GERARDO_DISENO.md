# Loop 14 — Panel de Gerardo: quién está y en qué

> Ítem 3 del control cruzado (viejo: `PanelTrabajosActivos.tsx`).

## 1. Para qué
Gerardo arma las hojas de ruta y reparte el trabajo. Necesita ver de un vistazo **quién vino y no tiene nada en marcha**, y darle una tarea **en el momento**.

## 2. Pantalla `/panel` (menú "Panel", admin y comercial; en la compu y en el celular)
Tres columnas (en el celular, tres bloques):
- **Trabajando**: persona, tarea, OT y cliente, hace cuánto (reloj del navegador, como Control en Vivo).
- **En pausa**: persona, tarea, motivo de la pausa y desde qué hora.
- **Sin tarea en marcha**: marcó **entrada** hoy y **no salida**, y no tiene un tramo abierto. Muestra cuántas tareas pendientes para hoy tiene (si tiene 0, se resalta).
- Abajo, gris: **No marcaron entrada** (personas activas con usuario de taller, montaje o diseño).
Se actualiza en vivo con el mismo canal de Control en Vivo (Broadcast, sin datos sensibles) y cada 60 s de respaldo.

## 3. Acción: Asignar tarea
Desde cualquier persona: **Asignar tarea** → buscar OT (no final) → tipo, qué hay que hacer, día (hoy por defecto), tiempo estimado, cantidad. Usa el mismo alta de tarea del Loop 11.
- Si la hoja de esa OT está en **Borrador**, el modal ofrece "Activar la hoja para que la vea ya" (tildado por defecto).
- La tarea le aparece al operario en **Mi trabajo → Para hoy** al instante (evento en vivo).

## 4. Iniciar por otro — NO en este loop
El viejo dejaba que Gerardo **iniciara** el reloj de otro. Choca con la decisión vigente "nadie marca el reloj de otro" (TRASPASO §12, operarios sin celular). Queda como decisión del usuario; si se aprueba, sería un loop chico aparte con `iniciado_por` en el tramo y auditoría.

## 5. API
- `GET /api/panel` (comercial): `{ trabajando[], en_pausa[], sin_tarea[], sin_marcar[] }`, calculado en una consulta por bloque con la fecha de Asunción. Sin montos ni tarifas.
- Asignar = `POST /api/comercial/ot/:id/tareas` (existe) + `POST /api/comercial/ot/:id/hoja` ACTIVAR (existe), en ese orden desde el modal.

## 6. Criterios de aceptación
- **CA-14.1** Una persona con entrada hoy, sin salida y sin tramo abierto aparece en "Sin tarea en marcha"; al iniciar una tarea pasa a "Trabajando".
- **CA-14.2** Con salida marcada no aparece en ninguna de las tres columnas.
- **CA-14.3** Pausada aparece en "En pausa" con su motivo.
- **CA-14.4** "No marcaron entrada" lista solo personas activas con usuario operativo.
- **CA-14.5** Asignar tarea desde el panel con la hoja en borrador y "Activar" tildado: el operario la ve en Para hoy.
- **CA-14.6** Taller y montaje → 403 en `/api/panel`; la respuesta no trae montos.
- **CA-14.7** Recorrido Playwright: operario marca entrada → aparece "sin tarea" → Gerardo le asigna → el operario la inicia → pasa a "Trabajando".

## 7. Supuestos (confirmados por el usuario 2026-11-10)
> Decisión: Gerardo solo asigna; no inicia el reloj de otro.
- "Vino" = marcó entrada hoy (cualquier sede o remota del Loop 16).
- Iniciar el reloj por otro queda afuera hasta que el usuario lo decida.
