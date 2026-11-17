# Loop 16 — Asistencia de la cuadrilla y marcación remota

> Ítem 5 del control cruzado (viejo: `marcacion.routes.ts`, orígenes `HOJA_RUTA` y `REMOTO`).

## 1. Problema
- En la calle no todos tienen celular o señal: el viejo dejaba que **el conductor marcara por toda la cuadrilla** de la salida.
- A veces se sale **desde la casa** con el camión: la marcación cae lejos de la sede (hoy queda como "fuera de la geocerca" sin explicación).

## 2. Qué cambia en "En la calle"
- **Marcar por la cuadrilla** (solo quien es **conductor** de una salida de hoy): lista de la cuadrilla con un tilde por persona (todos tildados por defecto) → **Marcar entrada** / **Marcar salida**. Una marcación por persona, con el GPS del celular del conductor.
- **Marcar desde afuera**: si la marcación queda fuera de la geocerca, el celular pide un **motivo** ("Salí desde casa con el camión", "Fui directo al local") antes de enviar. Queda como `REMOTO` con su motivo.
- Cada persona sigue pudiendo marcar desde su propio celular; si ya marcó, el conductor la ve con tilde gris (no duplica).

## 3. Modelo (migración `0022_asistencia_cuadrilla`)
- `marcacion_asistencia`: `origen VARCHAR(12) NOT NULL DEFAULT 'PROPIA' CHECK (PROPIA|CUADRILLA|REMOTO)`, `marcada_por UUID NULL` (usuario del conductor), `hoja_ruta_id UUID NULL`, `motivo_remoto TEXT NULL`.
- CHECKs: CUADRILLA exige `marcada_por` y `hoja_ruta_id`; REMOTO exige motivo; PROPIA no lleva ninguno.
- Sigue inmutable. Índice para "última marcación de la persona hoy".
- Idempotencia: una `clave_idempotencia` por persona marcada (el conductor manda N claves en un pedido; sin señal se encola como hoy).

## 4. Reglas
- Solo el conductor de una salida **de hoy** puede marcar por los de **esa** salida (validado en la API contra `hoja_ruta_persona`).
- No se puede marcar ENTRADA a quien ya tiene una entrada abierta hoy, ni SALIDA a quien no entró (409 por persona; el resto se marca igual y el aviso dice a quién no).
- La geocerca sigue siendo **disuasiva**: REMOTO no bloquea, deja motivo para RR.HH.

## 5. API
- `POST /api/asistencia/cuadrilla` `{ hojaRutaId, tipo, personas: [{ personaId, claveIdempotencia }], gps, motivoRemoto? }` → `{ marcadas[], rechazadas[{ personaId, motivo }] }`.
- `POST /api/asistencia` (existe) acepta `motivoRemoto` y guarda `origen = 'REMOTO'` si está fuera de la geocerca.
- RR.HH. ve el origen y el motivo en el listado de asistencia.

## 6. Criterios de aceptación
- **CA-16.1** El conductor marca entrada por 3 de la cuadrilla: 3 marcaciones CUADRILLA con `marcada_por` y la hoja.
- **CA-16.2** Alguien que no es conductor de esa salida → 403.
- **CA-16.3** Una persona ya con entrada abierta: esa queda rechazada y las demás se marcan.
- **CA-16.4** Fuera de la geocerca sin motivo → 400; con motivo → REMOTO.
- **CA-16.5** Las marcaciones siguen inmutables; sin DELETE.
- **CA-16.6** Sin señal: se encola y se manda al volver (como hoy), sin duplicar.
- **CA-16.7** Recorrido Playwright: Carlos (conductor) marca la entrada de la cuadrilla; Gerardo los ve "Sin tarea en marcha" en el Panel (Loop 14).

## 7. Supuestos (confirmados por el usuario 2026-11-10)
> Decisión: Solo el conductor marca por la cuadrilla.
- Solo el **conductor** marca por los demás (no cualquier miembro).
- El motivo remoto es texto libre (con 3 sugerencias rápidas).

## 8. Ajustes al implementar (2026-11-17)
- La migración es **`0023_asistencia_cuadrilla`** (la `0022` la usó el Loop 13).
- **Motivo remoto, decidido por el servidor:** el celular no sabe dónde están las sedes. Si una marcación **en línea** cae fuera de toda geocerca (y hay al menos una sede activa) y no trae motivo, la API responde **400 con `codigo: FUERA_DE_ZONA`**; el celular pide el motivo (3 sugerencias o texto) y reenvía con la **misma clave**. Con motivo queda `REMOTO`.
- **Sin señal no se rechaza nunca por esto:** lo encolado no puede preguntar, y un 400 al volver la señal lo mandaría a "rechazadas". Fuera de zona y sin motivo se guarda como hoy (`PROPIA`, fuera de geocerca); RR.HH. lo ve marcado "sin señal".
- **Cuadrilla:** `marcada_por` = usuario del conductor, `hoja_ruta_id` = la salida. Si el conductor está fuera de zona también pide motivo (se guarda en cada marcación de la cuadrilla). La salida es "de hoy" según la fecha de Asunción de la marcación (la hora del celular si iba sin señal). Vale aunque la salida ya esté FINALIZADA (la salida del día se marca al volver).
- **Reglas por persona (solo cuadrilla):** ENTRADA si su última marcación de hoy no es ENTRADA; SALIDA si su última de hoy es ENTRADA; tiene que ser de esa salida. Lo que no cumple va a `rechazadas` con el motivo y el resto se marca. Candado por persona en la transacción para no duplicar si la persona marca desde su celular al mismo tiempo.
- `GET /api/asistencia/cuadrilla`: las salidas de hoy donde soy conductor, con la cuadrilla y la última marcación de hoy de cada uno (para los tildes).
- El listado de RR.HH. muestra el origen (Propia / Por el conductor / Desde afuera), quién marcó y el motivo.
