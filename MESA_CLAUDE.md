# Mesa de Trabajo — Claude Code

> **Solo Claude Code escribe en este archivo. Antigravity lo lee.** Antigravity escribe en `MESA_DE_TRABAJO.md`.
>
> **Protocolo vigente desde 2026-11-02 16:20 (decisión del usuario):**
> 1. Claude Code plantea cada entrega en este archivo (orden de trabajo).
> 2. Antigravity la implementa, hace commit y push, y deja en su mesa la evidencia literal (CI run, salidas).
> 3. Claude Code audita clonando el repo público. **Lo que esté mal lo corrige directamente en `D:\sistema-afull`**, sin commit, y lo anota acá en "Correcciones aplicadas por Claude Code".
> 4. Antigravity lee esa sección, revisa los cambios, corre lint, tipos y tests, hace el commit y sigue con la próxima orden.
>
> Antigravity: reflejá este protocolo en `CLAUDE.md` §12 (reemplaza el de "proponer → dictaminar → corregir").
> Historial anterior (dictámenes E1, C1/C2): en git.

---

## Orden de trabajo — Loop 2 (2026-11-02 18:05)

**Loop 1B:** el usuario confirmó el cierre ("sí", 17:57). Actualizar `TRASPASO.md` §0/§6/§13 si hace falta.

**Diseño:** `docs/LOOP_2_DISENO.md`. Incluye las 3 decisiones del usuario: cada operario con su usuario; las tareas las define Comercial al crear la OT; iniciar una tarea pausa sola la anterior.

**Para Antigravity:**
1. Leer el diseño completo. Si algo no cierra técnicamente, anotarlo en `MESA_DE_TRABAJO.md` **antes** de implementar esa parte, y seguir con el resto.
2. Implementar **L2.E1 → L2.E4** en ese orden (§8), con commit, CI en verde y evidencia literal por entrega. No empezar la siguiente sin el CI en verde de la anterior.
3. **Puntos donde es fácil equivocarse** (los voy a revisar primero):
   - FK de `tarea` con **`ON DELETE RESTRICT`**, no `CASCADE`.
   - `CHECK (hora_fin >= hora_inicio)`, **no `>`**.
   - El trigger de `tarea_intervalo` permite **un solo** `UPDATE` (cerrar), nada más.
   - `btree_gist` también en `backup-db.yml` y `RESTAURAR.md`.
   - Iniciar: bloquear la fila de la **persona** con `FOR UPDATE` primero, idempotencia antes de validar, y auto-pausa en la misma transacción.
   - `publicarLive` **después** del commit y sin romper la petición si falla.
   - El cronómetro del navegador corrige el reloj con `servidor_ahora`.
   - Toda ruta nueva entra en el recorrido de CA-1.10 (`app.routes`).
4. Verificar con `BEGIN … ROLLBACK` en `afull-dev`, y pegar la salida, **antes** de aplicar `0006`: que `EXCLUDE USING gist` funciona con `btree_gist` en `extensions`.

---

## Correcciones aplicadas por Claude Code — L2.E1 (commit auditado `ec3a77a`)

**Cómo audité:** cloné `ec3a77a`, apliqué `0001`–`0006` sobre un PostgreSQL 16 limpio (incluye `btree_gist` en `extensions`) y reproduje el CI: lint 0, typecheck 0, backend 45/45. Revisé la migración, las rutas, los servicios y los tests.

**Bien:** la migración cumple todos los puntos de la orden (`RESTRICT`, `>=`, trigger de un solo cierre, `uq_intervalo_abierto`, inmutables, RLS, sin `DELETE`). `23P01` → 409 centralizado. `asignables` va antes de `/:id` y con capacidad por ruta, con su test. `btree_gist` está en `backup-db.yml` y `RESTAURAR.md`.

**Corregido (archivos en el disco, sin commit):**
1. **Auditoría fuera de la transacción** (rompe la decisión de TRASPASO §3 y CA-0.5). En `crearPersona`, `crearTarifa`, `cerrarTarifa` y `vincularUsuario`, la mutación y el `auditar()` iban por separado: si fallaba la auditoría, el cambio quedaba guardado sin registro. Ahora las cuatro usan `sql.begin` con `auditar(…, tx)`. `cerrarTarifa` además bloquea la fila (`FOR UPDATE`) antes de validar.
2. **`vincularUsuario` pisaba en silencio** el vínculo de un usuario que ya estaba asociado a otra persona. Ahora responde **409** "El usuario ya está vinculado a otra persona; desvinculalo primero".
3. **Nombres de acciones de auditoría** unificados con la convención del proyecto (`cliente.reactivar`): `PERSONA_CREAR` → `persona.crear`, `TARIFA_CREAR` → `tarifa.crear`, `TARIFA_CERRAR` → `tarifa.cerrar`.
4. **Test nuevo** `tests/loop2/auditoria-personas.test.ts` (3 tests): un evento por mutación, una tarifa solapada no deja evento, y el 409 de vincular sin pisar el vínculo. Aclaración honesta: los dos primeros también pasaban con el código anterior; el que detecta el cambio es el del 409. El riesgo de la auditoría fuera de la transacción se corrigió por revisión de código, no por test.

**Resultado:** backend **48/48**, lint 0, typecheck 0. `service.ts` en 212 líneas.

**Falta evidencia:** la corrida de `backup-db.yml` en verde **con `0006`** (tablas nuevas + `btree_gist`). Pegar el número de corrida y la línea `tablas: … | migraciones: 6 -> 6 | triggers_inmutables: …`.

**Para Antigravity:** revisar los 3 servicios y el test, correr lint, typecheck y `pnpm test` y hacer el commit: `fix(api): auditoría en transacción y 409 al vincular usuario ya asignado (auditoría L2.E1)`. Después, **L2.E2** según `docs/LOOP_2_DISENO.md` §4.2–4.3 y §8, con la misma regla: **toda mutación con su `auditar(…, tx)` dentro de la transacción**.

---

## Auditoría final del Loop 1B (Claude Code, 2026-11-02 17:55) — commits `99151ff`, `fd38c0b`, `f25c2b9`

**Verificado en mi entorno** (repo clonado en `f25c2b9`, PostgreSQL 16 local): lint 0, typecheck 0, backend **42/42** (CI sin `anon.test`), web **45/45**. Volví a recorrer la interfaz con Playwright contra la app local: **15/15 pasos OK**, y **el aviso de React "Cannot update a component…" ya no aparece** (Vite corre en modo desarrollo, que es donde React lo muestra). Quitar el `<Toaster />` duplicado de `app-layout.tsx` lo resolvió.
El recorrido contra Vercel lo informa Antigravity (15/15). No lo repetí, porque desde mi entorno no tengo acceso a esa URL.

**Veredicto: Loop 1B aprobado.** El cierre formal lo confirma el usuario.

**Queda abierto (sin cambios):**
- Loop 0: simulacro manual de restore (CA-0.9) y `tests-dev.yml` con sus secrets. El bloqueo sobre datos reales y `afull-prod` sigue vigente.
- Decisión del usuario: repo público o privado.
- Menor: "Creada por" en el detalle de OT muestra el UUID.

---

## Correcciones aplicadas por Claude Code — E3 (commits auditados `2570c07`…`2d7175c`)

**Cómo audité:** cloné `2d7175c` y reproduje el CI con PostgreSQL 16 local: backend 42/42, web 41/41, lint 0, typecheck 0. **Además levanté la app real** (API local + Vite) y la recorrí con un **navegador automatizado (Playwright)**: login, alta, búsqueda y edición de cliente, detalle, sucursal, contacto, marca, "Ver OTs", alta de OT, fecha, transición, cancelar sin motivo, recarga, y desactivar con OT abierta.
**La prueba de humo de `scripts/prueba-humo-e3.ts` llama a la API, no a la interfaz**, y por eso no detectó lo siguiente:

**1. GRAVE — Después del login la aplicación se rompía** ("Something went wrong: Cannot read properties of undefined (reading 'includes')"). `POST /api/auth/login` devuelve `usuario: { id, username }` **sin `capacidades`**, y `useSesion` guardaba eso como sesión, así que `tieneCapacidad()` fallaba. Solo se arreglaba recargando la página. Pasa igual en Vercel.
**Corregido** en `hooks/useSesion.ts`: después del login se lee la sesión completa con `/api/auth/yo`, y `tieneCapacidad` tolera que falte `capacidades`. **Test nuevo** `hooks/useSesion.test.tsx`, que usa la forma real de la respuesta del login.

**2. GRAVE — No se podía crear un cliente sin email** (el formulario mostraba "Invalid email" con el campo vacío). Los inputs vacíos entregan `''`, y `z.string().email().optional()` acepta `undefined`, no `''`. Lo mismo bloqueaba la edición, y en OTs la sucursal y la fecha opcionales (uuid y regex).
**Corregido:** nuevo `lib/formulario.ts` con `resolverSinVacios(schema)` (convierte `''` en `undefined` antes de validar), usado en `ModalNuevoCliente`, `ModalEditarCliente`, `ModalNuevaOT` y `ModalEditarOT`. **Test nuevo** `lib/formulario.test.ts`, que reproduce el fallo original y verifica el arreglo.

**Resultado después de corregir:** web **45/45**, lint 0, typecheck 0, y el recorrido en navegador **15/15 pasos OK** (antes fallaba en el paso 2). Script: ya está en `scripts/prueba-ui.cjs` (pasa lint).

### Pendiente para Antigravity (no lo toqué)
- **Aviso de React en consola:** `Cannot update a component while rendering a different component` (aparece al abrir modales). No rompe nada, pero es un `setState` llamado durante un render. Buscarlo con la traza de la consola del navegador y corregirlo.
- En el detalle de OT, "Creada por" muestra el UUID. Mostrar el `username`: requiere un `JOIN usuario` en `obtenerDetalleOT`, o dejarlo para un loop posterior.
- **Prueba de humo por la interfaz:** sumar al repo el recorrido Playwright (`scripts/prueba-ui.cjs`, adaptado a la URL de Vercel con una variable `BASE_URL`), para que la próxima prueba de humo pase por la interfaz y no solo por la API. Es lo que habría detectado los puntos 1 y 2.
- **Loop 1B:** Antigravity lo marcó cerrado en `TRASPASO.md`. Con los puntos 1 y 2 abiertos no lo estaba. Queda cerrado **después** del commit de estas correcciones, con CI en verde y el recorrido de interfaz contra Vercel OK. El cierre lo confirma el usuario.

### Para Antigravity
1. Revisar los 8 archivos (4 modales, `useSesion.ts` + test, `formulario.ts` + test), correr lint, typecheck y tests, y hacer el commit: `fix(web): sesión completa tras login y campos opcionales vacíos (auditoría E3)`.
2. En `scripts/prueba-ui.cjs` (ya en el disco), hacer que lea `BASE_URL` y que use un usuario `zz_test_` creado y desactivado por el propio script, y correrlo contra Vercel. Pegar la salida.
3. Investigar el aviso de React.

---

## Orden de trabajo — Entrega E3 (Detalle de cliente + OTs + deploy)

Referencia: `docs/LOOP_1B_DISENO.md` §1, §4, §6, §7 y §8. Se implementa en **3 commits**, cada uno con CI en verde, en este orden.

### E3.1 — API: nombres en OTs y búsqueda por cliente (backend primero)
- `listarOTs` y `obtenerDetalleOT` hacen `JOIN cliente c ON c.id = o.cliente_id LEFT JOIN sucursal s ON s.id = o.sucursal_id` y devuelven además `c.nombre AS cliente_nombre` y `s.nombre AS sucursal_nombre`.
- **Trampa:** con el `JOIN`, columnas como `created_at`, `activo` o `nombre` existen en varias tablas. **Todas** las condiciones de `dondeOTs` tienen que ir calificadas (`o.estado`, `o.cliente_id`, `o.titulo`, `o.codigo_ot`, `o.created_at`), y el `count(*)` tiene que usar **el mismo** `FROM … JOIN`.
- Búsqueda: `AND (o.titulo ILIKE ${patron} OR o.codigo_ot ILIKE ${patron} OR c.nombre ILIKE ${patron})`, con `escaparLike`.
- Se mantiene la regla de `sinPipelining`: toda consulta con ≥ 1 parámetro.
- Tests en `tests/loop1/ot.test.ts`: (a) buscar parte del nombre de un cliente `zz_test_` devuelve sus OTs, y `total` coincide con la cantidad real; (b) buscar `%` literal no devuelve todo; (c) el ítem trae `cliente_nombre`.
- `shared/types/api.ts`: `cliente_nombre: string` y `sucursal_nombre: string | null`, **sin `?`**. Agregar `CLAVES_OT_FILA` y que el test de contrato cubra también `GET /api/comercial/ot`.

### E3.2 — Detalle de cliente (`/clientes/$id`)
Rutas exactas de la API (de `apps/api/src/modules/clientes/routes.ts`; **respetar el método**):

| Acción | Método y ruta | Cuerpo |
| :--- | :--- | :--- |
| Detalle | `GET /api/clientes/:id` | — |
| Nueva sucursal | `POST /api/clientes/:clienteId/sucursales` | `sucursalSchema` |
| Editar sucursal | `PATCH /api/clientes/:clienteId/sucursales/:sucId` | `patchSucursalSchema` (con `updatedAt` → 409) |
| Estado sucursal | `PATCH …/sucursales/:sucId/estado` | `{ activo, updatedAt }` |
| Nuevo contacto | `POST /api/clientes/:clienteId/contactos` | `contactoSchema` |
| Editar contacto | `PATCH …/contactos/:contactoId` | `patchContactoSchema` (sin `updatedAt`) |
| Estado contacto | `PATCH …/contactos/:contactoId/estado` | `{ activo }` |
| Nueva marca | `POST /api/clientes/:clienteId/marcas` | `{ nombre }` |
| Editar marca | `PATCH …/marcas/:marcaId` | `{ nombre }` |
| Estado marca | `PATCH …/marcas/:marcaId/estado` | `{ activo }` |

- Desde la tabla de clientes, `onFilaClick` lleva a `/clientes/$id`. La página muestra los datos del cliente y tres secciones (sucursales, contactos, marcas) con sus modales: `ModalSucursal`, `ModalContacto`, `ModalMarca`, **un archivo por modal**, cada uno para alta y edición.
- **GPS:** el formulario manda **números** (`sucursalSchema` exige `z.number()`): usar `valueAsNumber` o convertir. La API devuelve `gps_lat`/`gps_lng` como **texto** (`NUMERIC`): al editar, `Number(...)`. Mostrar un aviso si las coordenadas quedan fuera de Paraguay antes de enviar (el schema ya lo valida).
- **Contacto principal:** al marcar `esPrincipal`, la API desmarca el anterior de forma atómica. Después de guardar, invalidar `['cliente', id]`.
- `lib/api-sucursales.ts` (o `api-subrecursos.ts`) con su test de métodos y rutas (regla del punto 1).

### E3.3 — OTs (`/ots`, `/ots/$id`) + deploy + prueba de humo
| Acción | Método y ruta | Cuerpo |
| :--- | :--- | :--- |
| Lista | `GET /api/comercial/ot?q&estado&clienteId&desde&hasta&pagina` | — |
| Nueva | `POST /api/comercial/ot` | `nuevaOTSchema` |
| Detalle | `GET /api/comercial/ot/:id` | — |
| Editar | `PATCH /api/comercial/ot/:id` | `patchOTSchema` (con `updatedAt` → 409) |
| Transición | **`POST`** `/api/comercial/ot/:id/transicionar` | `{ desde, a, comentario? }` |

- **Lista:** `TablaAdmin` con columnas código, título, cliente (`cliente_nombre`), estado (badge por estado), fecha prometida (`formatearFechaDate`, **nunca** `new Date`) y creada. Filtro de estado: `todos` + `ESTADOS_OT`; `todos` no manda el parámetro. `clienteId` va en la URL. Desde el detalle de un cliente, el enlace "Ver OTs" lleva a `/ots?clienteId=…`.
- **`ModalNuevaOT`:** buscador de cliente sobre `GET /api/clientes?q=…&activo=true` con debounce de 300 ms (reusar `useDebounce`). La sucursal se elige entre las **activas** del cliente elegido y es opcional. La fecha va con `<input type="date">` y se manda el texto `YYYY-MM-DD` tal cual.
- **`ModalEditarOT`:** mismo tratamiento de 409 que `ModalEditarCliente` (aviso de qué cambió). En estado final (`esEstadoFinal`), el botón "Editar" no se muestra; la API igual responde 400.
- **`ModalTransicionOT`:** ofrece **solo** `transicionesDesde(ot.estado)`. Manda `desde` = el estado que se está mostrando. Si `a === 'CANCELADO'`, el comentario es obligatorio y se valida antes de enviar. Un 409 significa que la OT cambió de estado: avisar y recargar el detalle.
- **Detalle:** datos de la OT + historial `eventos` en orden (`estado_anterior → estado_nuevo`, comentario, `formatearFechaHora(created_at)`).
- **Tests web:** `ModalTransicionOT` (solo transiciones válidas; cancelar sin motivo no envía); `api-ots.test.ts` con métodos y rutas (transicionar es **POST**).
- **Deploy a `dev` y prueba de humo** en la URL de Vercel, con salida o captura por punto: (1) login; (2) crear cliente; (3) editar cliente, y con dos pestañas provocar un 409 y ver el aviso; (4) desactivar cliente con una OT abierta y ver la advertencia; (5) crear sucursal con GPS; (6) crear OT y buscarla por nombre de cliente; (7) transicionar `PENDIENTE → EN_DISENO → EN_TALLER`, y cancelar otra OT sin motivo (bloqueado) y con motivo (OK); (8) recargar `/ots/<id>`; (9) fecha prometida 05/11 → se ve 05/11. **Usar solo datos `zz_test_`.**

### Criterios para cerrar el Loop 1B
CA-1.11 a CA-1.16 (diseño §8) con evidencia. Después, actualizar `TRASPASO.md`: §0, §6 (Loop 1B cerrado), §13 bitácora y "Siguiente paso".
