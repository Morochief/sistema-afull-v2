# Loop 13 — Corregir y cargar horas a mano

> Ítem 2 del control cruzado (viejo: `RegistroManualForm`, `MisRegistros`). Caso real: "alguien se olvidó de pausar" y "trabajó sin celular".

## 1. Principio
Las horas son **eventos inmutables** (`tarea_intervalo`). No se edita un tramo: se agrega una **corrección** que queda en el historial con quién, cuándo y por qué. El costo usa siempre el valor efectivo.

## 2. Los tres casos
1. **Se olvidó de pausar** (reloj todavía abierto): la oficina lo **cierra con la hora real** ("paró a las 17:30"). Hoy el trigger ya permite cerrar un tramo abierto; se agrega `cerrado_por` y `motivo_correccion`.
2. **Se olvidó de pausar y ya se cerró** (el tramo quedó largo): se registra una **corrección de fin** `intervalo_correccion (intervalo_id UNIQUE, hora_fin_corregida, motivo, corregido_por)`. Solo puede **acortar** (`hora_inicio ≤ corregida < hora_fin`). Una por tramo.
3. **Trabajó sin celular** (no hay tramo): la oficina **carga un tramo cerrado a mano** sobre la tarea: fecha, hora de inicio y fin, motivo. Queda con `origen = 'MANUAL'` y `cargado_por`.

## 3. Modelo (migración `0021_correccion_horas`)
- `tarea_intervalo`: `origen VARCHAR(10) NOT NULL DEFAULT 'RELOJ' CHECK (RELOJ|MANUAL)`, `cargado_por UUID NULL`, `motivo_manual TEXT NULL`. CHECK: MANUAL exige `hora_fin`, `cargado_por` y motivo; RELOJ los deja nulos. El trigger permite insertar MANUAL ya cerrado.
- `intervalo_correccion`: inmutable (triggers UPDATE/DELETE/TRUNCATE), RLS, `GRANT SELECT, INSERT`.
- **Sin solapamientos por persona**: un tramo manual o una corrección no puede pisar otro tramo de la misma persona (validación en la API dentro de la transacción, con `pg_advisory_xact_lock` por persona). Se evalúa con la hora efectiva.
- **Hora de fin efectiva** = `coalesce(corrección.hora_fin_corregida, hora_fin)`. La usan `v_mano_obra` (Loop 12), reloj acumulado, "Hoy", Control en Vivo e historial.

## 4. Quién puede
- `admin` (Juan, Gerardo) y `rrhh` (Sofi): son horas que se pagan.
- **No** sobre OTs TERMINADAS o CANCELADAS: su costo está congelado (409 con mensaje claro).
- Ventana: hasta 31 días hacia atrás; nada en el futuro.

## 5. Pantalla
- **Personas → [persona] → Horas** (o desde la OT, sección Hoja de ruta, en cada tarea): lista de tramos por día con inicio, fin, duración, tarea y OT; los corregidos muestran "corregido: 17:30 (antes 23:59) · motivo · quién".
- Botones: **Cerrar con hora** (tramo abierto), **Corregir fin** (tramo cerrado), **Cargar horas a mano** (elige tarea de esa persona, fecha, inicio, fin, motivo).
- Auditoría en `evento_auditoria` en la misma transacción.

## 6. API
- `GET /api/personas/:id/horas?desde&hasta&pagina` (25 por página).
- `POST /api/horas/:intervaloId/cerrar` `{ horaFin, motivo }`.
- `POST /api/horas/:intervaloId/correccion` `{ horaFin, motivo }`.
- `POST /api/horas/manual` `{ tareaId, personaId, horaInicio, horaFin, motivo, claveIdempotencia }`.

## 7. Criterios de aceptación
- **CA-13.1** Cerrar con hora un tramo abierto: el costo y el reloj usan esa hora; queda auditado.
- **CA-13.2** Corregir el fin de un tramo cerrado: el costo baja; el tramo original no cambia; una segunda corrección del mismo tramo → 409.
- **CA-13.3** Cargar un tramo manual: suma al costo de la OT y a las horas de la persona, marcado "a mano".
- **CA-13.4** Rechazos: solapamiento con otro tramo → 409; corrección que alarga o fin < inicio → 400; OT terminada → 409; sin motivo → 400; taller o montaje → 403.
- **CA-13.5** `intervalo_correccion` no se modifica ni se borra (triggers); `afull_api` sin DELETE.
- **CA-13.6** Recorrido Playwright: Gerardo cierra con hora el reloj olvidado de un operario y carga 2 h a mano; la OT muestra el costo corregido.

## 8. Supuestos (confirmados por el usuario 2026-11-10)
> Decisión: Juan, Gerardo y Sofi corrigen; los operarios no se cargan horas.
- Quién corrige: admin y RR.HH. (no los operarios).
- El operario **no** se carga horas a mano él mismo (evita que se carguen horas de más).
