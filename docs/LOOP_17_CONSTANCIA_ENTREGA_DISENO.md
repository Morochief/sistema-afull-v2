# Loop 17 — Constancia de entrega en la parada

> Ítem 6 del control cruzado (viejo: `SubirFotoEntregaModal`, `Pedido.fotoRemisionUrl/fotoEntregaUrl/receptorNombre`).

## 1. Para qué
Cuando la cuadrilla entrega o instala, la oficina necesita la prueba: **la remisión firmada**, **quién recibió** y **cuándo**. Hoy solo queda la foto del montaje.

## 2. Qué ve la cuadrilla (En la calle → la parada)
Antes de **Hecha**, un bloque **Entrega**:
- **Foto de la remisión firmada** (cámara; obligatoria si la OT lleva remisión, ver §5).
- **Recibió**: nombre de quien recibió (obligatorio) y **cargo** opcional ("encargado", "cajera").
- La hora la pone el sistema.
- Sin señal: se guarda en el celular y se manda al volver (mismo mecanismo de fotos del Loop 4 E3/E4), con la hora real.

## 3. Qué ve la oficina
- En la OT, sección nueva **Entrega**: foto de la remisión (se abre en grande), recibió, cargo, fecha y hora, quién la cargó, y si se cargó sin señal.
- En el **portal del cliente**, la OT terminada muestra "Entregado el 12/11 a las 10:40 · Recibió: María (encargada)" (sin la foto, que es interna).

## 4. Modelo (migración `0023_constancia_entrega`)
- `hoja_ruta_parada`: `receptor_nombre VARCHAR(120)`, `receptor_cargo VARCHAR(60)`, `entregada_at TIMESTAMPTZ`, `entrega_sin_senal BOOLEAN`. Se cargan una sola vez (trigger: no se cambian si ya tienen valor).
- `archivo.tipo` suma `'REMISION_PARADA'` (con `parada_id`), una SUBIDA por parada (índice único parcial). Ajuste del CHECK `chk_archivo_referencia`.

## 5. Reglas
- Completar una parada con entrega exige receptor. La foto de remisión es **obligatoria por defecto**; se puede desmarcar por OT ("Esta OT no lleva remisión") desde la oficina.
- Omitir una parada no pide entrega (como hoy, pide motivo).
- Lo cargado no se edita: si se equivocó el nombre, la oficina agrega una nota (auditoría), no pisa.

## 6. API
- `POST /api/campo/paradas/:id/entrega` `{ receptorNombre, receptorCargo?, sinSenal?, horaReal? }` antes o junto con completar.
- Foto: flujo de archivos existente con `tipo = 'REMISION_PARADA'`.
- `GET` de la OT y del portal suman los datos de entrega (portal sin foto).

## 7. Criterios de aceptación
- **CA-17.1** Completar una parada con receptor y foto: la OT muestra la entrega completa.
- **CA-17.2** Sin receptor → 400; sin foto en una OT que lleva remisión → 400.
- **CA-17.3** Una segunda entrega sobre la misma parada → 409; los datos no se pisan.
- **CA-17.4** Sin señal: la entrega se encola con su hora real y llega marcada "sin señal".
- **CA-17.5** El portal muestra fecha y quién recibió, nunca la foto ni montos.
- **CA-17.6** Recorrido Playwright en celular: Carlos completa la parada con remisión y receptor; Sofi lo ve en la OT; el cliente lo ve en su portal.

## 8. Supuestos (confirmados por el usuario 2026-11-10)
> Decisión: Remisión obligatoria por defecto, desmarcable por OT.
- La remisión es obligatoria por defecto (se puede desmarcar por OT).
- El portal muestra quién recibió (nombre y cargo).

## 9. Ajustes al implementar (2026-11-17)
- La migración es **`0024_constancia_entrega`** (`0022` y `0023` las usaron los Loops 13 y 16).
- **Una sola acción:** el receptor viaja con **"Hecha"** (`POST /api/campo/paradas/:id/completar { receptorNombre, receptorCargo?, remisionEnCelular? }`), no en un pedido aparte. Sin señal, dos acciones encoladas podrían llegar en otro orden. La hora de entrega es `completada_at` (con la hora real si iba sin señal).
- **La foto y el "Hecha" viajan por colas distintas** (fotos y acciones). Para que no se rechace una entrega legítima, la remisión se exige así: ya subida, **o** sacada y todavía en el celular (`remisionEnCelular`), **o** la parada se cerró sin señal. En los dos últimos casos la oficina ve "la foto de la remisión todavía no llegó" hasta que sube. Sin foto de ningún tipo y en línea: 400.
- **Reintento:** repetir "Hecha" con el mismo receptor responde 200 (la cola puede reenviar); con otro receptor, 409. Un trigger impide cambiar receptor y cargo una vez cargados.
- **Quién la cargó:** columna `completada_por` (usuario), solo para las nuevas.
- **"Esta OT no lleva remisión":** columna `orden_trabajo.lleva_remision` (por defecto sí) y `POST /api/comercial/ot/:id/remision { lleva }` (comercial, auditado), desde la sección Entrega de la OT.
- El portal recibe `entrega` (la última parada completada con receptor: fecha, nombre y cargo) en cada OT de `/api/portal/ots`; nunca la foto.
