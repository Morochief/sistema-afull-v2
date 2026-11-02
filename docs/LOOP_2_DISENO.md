# Loop 2 — Tareas, cronómetro y Control en Vivo (diseño de Claude Code)

> **Estado:** PROPUESTA, 2026-11-02. La implementa Antigravity por entregas; Claude Code audita cada una y corrige directo (protocolo de `MESA_CLAUDE.md`).
> **Fuentes:** `ARQUITECTURA_V3.md` §1, §5 (tablas `tarea`, `tarea_intervalo`, `tarifa_persona`), §9; `TRASPASO.md` §3 y §8 (backlog Loop 2); código real de `apps/api` y `migrations/0001`–`0005`.
> **Bloqueo vigente:** sin datos reales ni `afull-prod` hasta cerrar CA-0.9 y `tests-dev.yml`.

## 0. Decisiones del usuario (2026-11-02)
1. **Cada operario usa su propio usuario** (celular). El cronómetro siempre es de la persona vinculada al usuario de la sesión.
2. **Las tareas las define Comercial al crear la OT** (y puede agregarlas o reasignarlas después). Los operarios ejecutan.
3. **Si el operario inicia una tarea teniendo otra en curso, la otra se pausa sola**, en la misma transacción.

## 1. Alcance
**Entra:** personas y vínculo usuario↔persona; tarifas por persona (estructura y restricción, sin costeo); tareas de OT; cronómetro (iniciar, pausar, finalizar); vista "Mi trabajo" para el operario; Control en Vivo.
**No entra:** costeo (Loop 5), hojas de ruta, cuadrillas, fotos y checklist (Loop 3), trabajo offline (Loop 3).

## 2. Modelo de datos — migración `0006_tareas_cronometro.sql`

| Tabla | Columnas clave | Reglas duras (en PostgreSQL) |
| :--- | :--- | :--- |
| `tarifa_persona` | `persona_id`, `tarifa_hora_gs NUMERIC(15,4) CHECK > 0`, `fecha_inicio DATE`, `fecha_fin DATE NULL` | `EXCLUDE USING gist (persona_id WITH =, daterange(fecha_inicio, coalesce(fecha_fin,'infinity'), '[]') WITH &&)`. Solo se permite `UPDATE` para cerrar `fecha_fin` cuando era `NULL` (trigger) |
| `tarea` | `orden_trabajo_id`, `persona_asignada_id NULL`, `tipo`, `descripcion`, `orden_secuencia`, `estado`, `creado_por`, `created_at`, `updated_at` | `tipo` y `estado` con `CHECK`. FK **`ON DELETE RESTRICT`** (el maestro decía `CASCADE`: contradice el principio 3) |
| `tarea_evento` | `tarea_id`, `estado_anterior`, `estado_nuevo`, `autor_id`, `comentario`, `created_at` | Inmutable, igual que `ot_evento`: triggers contra `UPDATE`/`DELETE`/`TRUNCATE`; cancelar exige comentario (`CHECK`) |
| `tarea_intervalo` | `tarea_id`, `persona_id`, `hora_inicio`, `hora_fin NULL`, `motivo_cierre NULL`, `clave_idempotencia UUID NOT NULL UNIQUE` | **`CREATE UNIQUE INDEX uq_intervalo_abierto ON tarea_intervalo(persona_id) WHERE hora_fin IS NULL`**. `CHECK (hora_fin IS NULL OR hora_fin >= hora_inicio)`. **`>=`, no `>`**: pausar en la misma transacción que se inicia da tiempos iguales. Trigger: solo un `UPDATE` permitido, y solo de `hora_fin`/`motivo_cierre` cuando `hora_fin` era `NULL`; `DELETE` y `TRUNCATE` bloqueados |

- `tipo` de tarea: `TALLER_IMPRESION`, `TALLER_CORTE`, `TALLER_HERRERIA`, `TALLER_ARMADO`, `MONTAJE_CALLE`, `OTRO`.
- `motivo_cierre`: `PAUSA`, `ALMUERZO`, `FALTA_MATERIAL`, `LLUVIA`, `CAMBIO_TAREA` (lo pone la auto-pausa), `FIN`, `OTRO`.
- **Extensión:** `CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;`. **Verificar en `dev` con `BEGIN … ROLLBACK`** que la restricción `EXCLUDE` se crea con la extensión en el esquema `extensions` (la clase de operador por defecto no debería depender del `search_path`, pero hay que comprobarlo).
- **Impacto en el backup (no olvidar):** `backup-db.yml` y `RESTAURAR.md` tienen que crear `btree_gist` en `extensions` antes del `pg_restore`, igual que `pg_trgm`. Sin eso, el restore falla con `--exit-on-error`. La comprobación origen = destino de triggers inmutables va a contar los nuevos sola.
- **Regla para toda tabla nueva** (TRASPASO §3): RLS, `GRANT` mínimos a `afull_api` sin `DELETE` (`tarea_evento` solo `SELECT, INSERT`) y políticas. Índices: `tarea(orden_trabajo_id)`, `tarea(persona_asignada_id, estado)`, `tarea_intervalo(tarea_id)`, `tarea_intervalo(persona_id, hora_inicio DESC)`.
- Ninguna función nueva necesita `GRANT EXECUTE` (son de trigger; regla de `0005`).

## 3. Máquina de estados de tarea — `packages/shared/src/machines/tarea.ts`
`PENDIENTE → EN_CURSO | CANCELADA` · `EN_CURSO → PAUSADA | LISTO` · `PAUSADA → EN_CURSO | LISTO | CANCELADA` · `LISTO` y `CANCELADA` son finales.
**Invariante:** `estado = 'EN_CURSO'` ⇔ existe un intervalo abierto de esa tarea. Un test lo verifica después de cada operación del cronómetro.

## 4. API

### 4.1 Personas y tarifas
| Acción | Método y ruta | Capacidad |
| :--- | :--- | :--- |
| Lista paginada (TablaAdmin) | `GET /api/personas?q&activo&pagina` | `rrhh` |
| Alta / edición (`updatedAt` → 409) / estado | `POST /api/personas` · `PATCH /api/personas/:id` · `PATCH /api/personas/:id/estado` | `rrhh` |
| Vincular usuario | `PATCH /api/personas/:id/usuario` `{ usuarioId \| null }` | `admin` |
| Personas asignables (selector) | `GET /api/personas/asignables?q` → solo `id`, `nombre`; activas, con usuario activo y capacidad `taller` o `montaje` | `comercial` |
| Tarifas | `GET /api/personas/:id/tarifas` · `POST /api/personas/:id/tarifas` · `PATCH /api/tarifas/:id/cerrar` `{ fechaFin }` | `rrhh` (un solapamiento → `23P01` → **409**) |

`persona` necesita `updated_at` para el control de `409`: ya lo tiene (`0001`).

### 4.2 Tareas (Comercial)
- **Alta junto con la OT:** `nuevaOTSchema` suma `tareas?: { tipo, descripcion, personaAsignadaId? }[]` (máx. 30). `crearOT` las inserta **en la misma transacción**, cada una con su `tarea_evento` inicial.
- `GET /api/comercial/ot/:id/tareas` → tareas + persona asignada + **minutos trabajados** (suma de intervalos; el abierto cuenta hasta `now()`).
- `POST /api/comercial/ot/:id/tareas` · `PATCH /api/tareas/:id` (descripción, persona asignada, `updatedAt` → 409; no se puede editar en estado final) · `POST /api/tareas/:id/cancelar` `{ desde, comentario }`, con la misma semántica que las OT.
- Agregar tareas a una OT en estado final → `400`.

### 4.3 Cronómetro (operario: capacidad `taller` o `montaje`)
La persona actora es siempre la del usuario de la sesión. Si el usuario no tiene persona vinculada → `403 "Tu usuario no está vinculado a una persona"`. Solo se opera sobre tareas **asignadas a esa persona** (si no → `403`).

| Acción | Método y ruta | Cuerpo |
| :--- | :--- | :--- |
| Mis tareas | `GET /api/mi-trabajo` → tareas no finales asignadas, intervalo abierto, minutos de hoy, **`servidor_ahora`** | — |
| Iniciar | `POST /api/mi-trabajo/tareas/:id/iniciar` | `{ claveIdempotencia: uuid }` |
| Pausar | `POST /api/mi-trabajo/tareas/:id/pausar` | `{ motivo, claveIdempotencia }` |
| Finalizar | `POST /api/mi-trabajo/tareas/:id/finalizar` | `{ comentario?, claveIdempotencia }` |

**Iniciar, en una transacción:**
1. `SELECT … FROM persona WHERE id = $yo FOR UPDATE`. Serializa las operaciones del cronómetro **por persona**: dos toques casi simultáneos no compiten, se ordenan.
2. Si `claveIdempotencia` ya existe → devolver ese resultado con **200** (reintento de red: no se duplica nada).
3. `SELECT … FROM tarea WHERE id FOR UPDATE`; validar asignación y transición (`PENDIENTE|PAUSADA → EN_CURSO`).
4. Si hay un intervalo abierto mío en **otra** tarea → cerrarlo (`hora_fin = now()`, `CAMBIO_TAREA`), pasar esa tarea a `PAUSADA` y registrar su `tarea_evento` (**decisión 3: auto-pausa**).
5. Insertar el intervalo, pasar la tarea a `EN_CURSO` y registrar su `tarea_evento`. Auditoría en la misma transacción.
6. **Después del `COMMIT`**: `publicarLive` (§5).

`uq_intervalo_abierto` sigue siendo la red de seguridad en la base: si algo escapara al bloqueo, el `23505` se traduce en **409** y nunca hay dos intervalos abiertos.

**Pausar y finalizar:** cierran el intervalo abierto de esa tarea (si existe) y aplican la transición. Finalizar una tarea `PAUSADA` es válido (sin intervalo que cerrar).

**Hora:** `hora_inicio` y `hora_fin` las pone el servidor (`now()`). En el Loop 3 (offline) se revisará con hora del dispositivo y reglas de tolerancia.

### 4.4 Control en Vivo (Comercial)
`GET /api/live/estado` → `servidor_ahora` + una fila por persona activa asignable: nombre, intervalo abierto (si hay) con `hora_inicio`, tarea (tipo, descripción), OT (`codigo_ot`, título, `cliente_nombre`) y minutos trabajados hoy. Capacidad `comercial`.

## 5. Tiempo real — módulo `live` (decisión ya tomada en TRASPASO §3: Broadcast)
- **Servidor:** `apps/api/src/modules/live/publicar.ts` exporta `publicarLive(tipo, id)`. Hace `POST https://<ref>.supabase.co/realtime/v1/api/broadcast` (REST, sin WebSocket) al tema `afull-live` con `{ tipo, id }`. **Nunca nombres ni datos.** Se llama **después del COMMIT**, con timeout de 2 s, y si falla **se registra y no rompe la petición**: el dato ya está guardado y los clientes tienen el respaldo por consulta periódica.
- **Cliente:** `apps/web/src/lib/live.ts` exporta `suscribirseLive(cb): () => void`. Por dentro usa `@supabase/supabase-js` (solo realtime, con la clave publicable) en un canal **público**, y **siempre** consulta cada 30 s como respaldo. Al recibir un evento, invalida `['live']` y `['mi-trabajo']` con un debounce de 1 s. Si mañana se cambia de proveedor, solo cambia este archivo.
- **Seguridad, asumida a sabiendas:** un canal público lo puede escuchar o recibir mensajes de cualquiera que tenga la clave publicable, y el repo es público. Como el mensaje es solo `{ tipo, id }` y el cliente vuelve a pedir el dato con su sesión, lo peor que pasa es una recarga de más. Cerrarlo del todo exigiría canales privados con Supabase Auth, que no se usa.
- **Cupos, verificados el 2026-11-02** (supabase.com/docs/guides/realtime/limits): Free = 200 conexiones concurrentes, 100 mensajes/s, 2 M mensajes/mes. El cronómetro corre en el navegador y solo se publica en cambios de estado: con ~20 pantallas y ~500 cambios por día, son unos 220 000 mensajes por mes.
- **A verificar en E3 (pegar la evidencia):** (a) que el ajuste "Allow public access" de Realtime esté activo en `afull-dev`; (b) con qué clave acepta el endpoint REST un tema público (probar primero con la publicable; **no** poner la `service_role` en Vercel sin pasar por la mesa).

## 6. Frontend
- **Navegación por capacidad:** `taller`/`montaje` → **Mi trabajo** (`/mi-trabajo`), que es la pantalla inicial después del login si no tiene `comercial`; `comercial` → Clientes, OTs y **En vivo** (`/en-vivo`); `rrhh` → **Personas** (`/personas`).
- **Mi trabajo** (pensada para celular): tarjetas por tarea con botones de **≥ 48 px** (Iniciar / Pausar / Finalizar). Pausar pide el motivo con botones rápidos. El cronómetro corre en el navegador con `ahora_corregido = Date.now() + (servidor_ahora − hora_local_al_recibir)`, para que un celular con la hora mal no muestre tiempos falsos. La `claveIdempotencia` se genera con `crypto.randomUUID()` al tocar el botón y **se reutiliza si hay que reintentar**. Al iniciar, si hay otra en curso, se avisa con un toast "Se pausó «X»".
- **OT:** `ModalNuevaOT` suma una lista de tareas (tipo, descripción, operario desde `/api/personas/asignables`). El detalle de la OT muestra las tareas con estado, operario y horas, más botones para agregar, reasignar y cancelar.
- **En vivo:** grilla por persona (en curso / pausada / libre), con tiempo corriendo y OT. Usa `suscribirseLive` con el respaldo de 30 s.
- **Personas:** `TablaAdmin` + modales de alta y edición; sección de tarifas (solo `rrhh`); vincular usuario (solo `admin`).
- Regla vigente: cada `lib/api-*.ts` con su test de método y ruta; `resolverSinVacios` en formularios con zod; `mensajeDeError` para errores.

## 7. Criterios de aceptación
- **CA-0.3 (pasa del Loop 0, redefinido por la decisión 3):** con N inicios simultáneos de la misma persona (distintas tareas y claves), **nunca queda más de un intervalo abierto**; cada respuesta es 201, 200 (idempotente) o 409, **nunca 500**. Test: 10 inicios en paralelo → 1 abierto + 9 cerrados con `CAMBIO_TAREA`. Además, un `INSERT` directo de dos intervalos abiertos da `23505`.
- **CA-2.1 Idempotencia:** el mismo `claveIdempotencia` dos veces da un solo intervalo, y la segunda respuesta es 200 con el mismo id.
- **CA-2.2 Auto-pausa atómica:** iniciar B con A en curso deja A `PAUSADA` con su intervalo cerrado (`CAMBIO_TAREA`), B `EN_CURSO`, y los dos `tarea_evento`. Si algo falla, no queda nada a medias.
- **CA-2.3 Inmutabilidad:** reabrir o modificar un intervalo cerrado, borrar intervalos y modificar `tarea_evento` → error del motor. El invariante de §3 se cumple siempre.
- **CA-2.4 Tarifas:** una vigencia solapada → 409; las tarifas no se ven sin `rrhh` (403).
- **CA-2.5 Permisos:** el operario no opera tareas ajenas (403); un usuario sin persona vinculada → 403; `/api/live/estado` solo con `comercial`; CA-1.10 extendido a todas las rutas nuevas (recorrido de `app.routes`).
- **CA-2.6 Live:** `publicarLive` se llama después del commit, con un payload sin datos (test con espía); si falla, la operación igual responde 201.
- **CA-2.7 Reloj:** test unitario del cronómetro con desfase de reloj simulado.
- **CA-2.8 Backup:** `backup-db.yml` en verde con las tablas nuevas y `btree_gist`; `RESTAURAR.md` actualizado.
- **CA-2.9 Recorrido de interfaz (Playwright):** comercial crea una OT con 2 tareas asignadas al operario → el operario entra → inicia A → inicia B (A se pausa sola) → finaliza B → En vivo lo refleja. Local y contra Vercel.
- CA-0.11 (≤ 250 líneas), CI en verde y anon en `42501` para las tablas nuevas (CA-0.7, test que recorre `information_schema`).

## 8. Entregas (cada una: commit, CI y evidencia en `MESA_DE_TRABAJO.md`)
1. **L2.E1:** `0006` + `machines/tarea.ts` + esquemas y tipos en `shared` + API de personas y tarifas + tests (CA-2.3 de tarifas, CA-2.4) + `backup-db.yml`/`RESTAURAR.md` con `btree_gist` (corrida en verde).
2. **L2.E2:** tareas en OT + cronómetro + `GET /api/mi-trabajo` + tests de CA-0.3, 2.1, 2.2, 2.3 y 2.5.
3. **L2.E3:** módulo `live` (servidor y `lib/live.ts`) + `GET /api/live/estado` + CA-2.6, más las verificaciones de §5.
4. **L2.E4:** frontend (Mi trabajo, tareas en OT, En vivo, Personas) + CA-2.7 + deploy + **CA-2.9 en Vercel**. Después, actualizar `TRASPASO.md` (el cierre lo confirma el usuario).
