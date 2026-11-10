# Loop 11 — La Hoja de ruta de Gerardo (diseño de Claude, 2026-11-10)

## 0. Por qué
En el sistema viejo (`docs/CONTROL_CRUZADO_SISTEMA_VIEJO.md`) la **Hoja de ruta** es el reparto del trabajo de una OT entre los operarios: Gerardo (admin) la arma, la manda por **WhatsApp** con el formato de siempre y cada operario ve **sus tareas del día**. En el sistema nuevo eso existía como "tareas de la OT", sin agrupar, sin día ni cantidad, y el nombre "Hojas de ruta" lo usaba la salida de la camioneta. El usuario decidió (2026-11-10):
- cada tarea tiene **su día**; el operario ve primero las de hoy;
- la hoja arranca en **Borrador** y los operarios no la ven hasta **activarla** (o mandarla por WhatsApp);
- la pantalla de la camioneta pasa a llamarse **Salidas**.

Las horas y el costo no cambian: siguen saliendo de `tarea` y `tarea_intervalo` (inmutables).

## 1. Datos — migración `0019_hoja_ruta_ot.sql`
- `orden_trabajo`: `hoja_estado` (`BORRADOR | ACTIVA | CERRADA`, `NOT NULL`, **default `ACTIVA` en la base**), `hoja_notas` (texto para el equipo, ≤ 2000), `hoja_activada_at`, `hoja_whatsapp_at`, `hoja_cerrada_at`.
  - El default de la base es `ACTIVA` para que **todas las OTs existentes sigan como hoy** (sin sorpresas en `afull-demo`). Las OTs que crea la API nacen en `BORRADOR` (lo pone el servicio), salvo que se pida activarla al crearla (urgencias).
- `tarea`: `fecha_trabajo` (date), `cantidad` (`NUMERIC(15,4)` > 0), `unidad` (≤ 20), `minutos_estimados` (1..10000). Todos opcionales.

## 2. Reglas
| Desde | Acción | Hacia | Condición |
| :--- | :--- | :--- | :--- |
| BORRADOR | Activar o **Enviar por WhatsApp** | ACTIVA | — |
| ACTIVA | Cerrar | CERRADA | Ninguna tarea pendiente, en curso o pausada (409 si hay) |
| CERRADA | Reabrir | ACTIVA | — |
- Toda acción manda `desde` (el estado que veía la persona): si cambió, **409**. Se audita.
- **Mi trabajo** no muestra tareas de OTs con la hoja en BORRADOR, e **iniciar** una de esas tareas responde **409**.
- Se pueden agregar y editar tareas en BORRADOR y ACTIVA (al activar, todo lo cargado aparece junto). En CERRADA, no (400).
- Quién: capacidad `comercial` (admin pasa: Juan y Gerardo; Sofi).

## 3. WhatsApp — el formato que usan hoy
`POST /api/comercial/ot/:id/hoja/whatsapp` arma el texto en el servidor, marca `hoja_whatsapp_at` y, si estaba en BORRADOR, la **activa**:
```
*Hoja de Ruta — <cliente>*
OT: <código> · <título>
Local: <sucursal>
Fecha: <día más temprano de las tareas, o hoy>

<notas para el equipo, si hay>

⛔<operario>⛔
<descripción> (Cant: <cantidad> <unidad>) · <día> · ~<tiempo estimado>
```
Agrupa por operario en orden alfabético, "Sin asignar" al final; solo tareas no canceladas. La pantalla muestra el texto con **Copiar** y **Abrir WhatsApp** (`https://wa.me/?text=…`, sin número: se elige el grupo).

## 4. API
- `GET /api/comercial/ot/:id` suma `hoja_estado`, `hoja_notas`, fechas de la hoja.
- `POST /api/comercial/ot/:id/hoja` `{ accion: 'ACTIVAR' | 'CERRAR' | 'REABRIR', desde }`.
- `PATCH /api/comercial/ot/:id/hoja` `{ notas }`.
- `POST /api/comercial/ot/:id/hoja/whatsapp` → `{ mensaje, estado }`.
- Tareas (alta y `PATCH`): `fechaTrabajo`, `cantidad`, `unidad`, `minutosEstimados`. Nueva OT: `activarHoja` (opcional).
- `GET /api/mi-trabajo`: oculta hojas en borrador; devuelve los campos nuevos.

## 5. Pantallas
- **OT → sección "Hoja de ruta"** (reemplaza la lista suelta de tareas): estado de la hoja, notas para el equipo, tareas **agrupadas por operario** con día, cantidad y tiempo estimado; botones según el estado (**Activar**, **Enviar por WhatsApp**, **Cerrar**, **Reabrir**); **Agregar Tarea** con los campos nuevos; **Editar** una tarea (día, cantidad, unidad, tiempo, descripción).
- **Mi trabajo**: las tareas pendientes en grupos **Atrasadas**, **Para hoy**, **Próximas** y **Sin día**; cada tarjeta muestra cantidad y tiempo estimado.
- **Salidas** (antes "Hojas de ruta"): solo cambia el nombre en el menú, títulos y textos. La ruta interna `/hojas-ruta` no cambia.

## 6. Criterios de aceptación
- **CA-11.1** Una OT creada por la API nace en BORRADOR (o ACTIVA si se pidió); sus tareas no aparecen en Mi trabajo e iniciarlas da 409.
- **CA-11.2** Activar las muestra; las tareas guardan y devuelven día, cantidad, unidad y tiempo estimado.
- **CA-11.3** El WhatsApp sale con el formato de §3, agrupado por operario, y activa una hoja en borrador.
- **CA-11.4** Cerrar con tareas abiertas da 409; con todas terminadas o canceladas, cierra; reabrir vuelve a ACTIVA; `desde` viejo da 409; en CERRADA no se agregan tareas.
- **CA-11.5** Taller no puede tocar la hoja (403); datos inválidos (cantidad ≤ 0) dan 400.
- **CA-11.6** Mi trabajo agrupa en Atrasadas / Para hoy / Próximas / Sin día según la fecha de Asunción.
- **CA-11.7** Recorrido: Gerardo arma la hoja en borrador → Edu no la ve → Enviar por WhatsApp → Edu la ve "Para hoy" con su cantidad → no se puede cerrar con la tarea abierta.

## 7. Pruebas
`tests/loop11/hoja-ruta-ot.test.ts` · `apps/web/src/components/ots/SeccionHojaRuta.test.tsx` · `apps/web/src/lib/agrupar-tareas.test.ts` · `scripts/prueba-hoja-ruta-ot.cjs`. Los tests que creaban OTs por la API e iniciaban tareas se ajustan para activar la hoja (cambio de comportamiento pedido por el usuario, no un parche).
