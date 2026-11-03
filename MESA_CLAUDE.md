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

## Ajuste por roles reales (Claude Code, 2026-11-03 09:45)

Sofi confirmó que **Nachi registra su tiempo como todos** y que **todo diseño (también el del cliente) lo verifica Juan o Sofi** antes de producir. Cambios en el disco, sin commit:
- `migrations/0010_tarea_diseno.sql` + `_journal.json`: tipo de tarea `DISENO`.
- `packages/shared/src/machines/tarea.ts`: `DISENO` en `TIPOS_TAREA`.
- API: capacidad `diseno` en `cronometro/routes.ts`, `live/service.ts` y `personas/vinculos.service.ts` (asignables).
- Web: `lib/rutas.ts` (+ test), `routes/app-layout.tsx`, etiquetas en `ModalNuevaTareaOT.tsx` y `SelectorTareasOT.tsx`.
- `tests/loop4/geo.test.ts`: caso de tarea `DISENO` y acceso de `diseno` a "Mi trabajo".
- `docs/MAPA_REQUISITOS.md`, `TRASPASO.md` §5.

Verificado: backend 118/118, web 84/84, lint y tipos en 0. **Antigravity:** incluir en el commit del Loop 4 (o un `feat:` aparte) y correr `pnpm db:migrate` (aplica `0010`).

---

## Loop 4 (parte 1) implementado por Claude Code — L4.E1 y L4.E2 (2026-11-03 04:30)

**Qué hay en el disco (sin commit), además de todo el Loop 3 de la sección siguiente:**
- `docs/LOOP_4_DISENO.md` (diseño, supuestos a confirmar, CA-4.1 a CA-4.8).
- `migrations/0009_campo_flota.sql` + entrada en `_journal.json`.
- `packages/shared/src/formulas/geo.ts` (Haversine, ruta × 1,35, alerta de desvío, geocerca) y `schemas/campo.ts`; exportados en `index.ts`.
- API: `modules/flota/` (vehículos y sedes), `modules/hojas-ruta/`, `modules/campo/` (hoy, iniciar/cerrar viaje, completar/omitir parada), `modules/asistencia/` (marcar, listado para RR.HH.); rutas en `index.ts`.
- Pruebas: `tests/loop4/geo.test.ts`, `tests/loop4/campo-api.test.ts` (CA-4.1 a 4.6). `tests/loop3/helpers-comercial.ts`: `sesion()` ahora expone `usuarioId`.

**Verificado:** base nueva `0001`–`0009`; backend **117/117**, web 84/84, lint y tipos en 0.

**Para Antigravity (reemplaza los pasos de la sección del Loop 3; un solo commit por loop):**
1. En `afull-dev`: `SELECT count(*) FROM presupuesto WHERE total_gs < 0;` (debe dar 0) y `pnpm db:migrate` (aplica `0008` y `0009`). Pegá las salidas.
2. `pnpm lint && pnpm typecheck && pnpm build`.
3. Commit 1 con los archivos del Loop 3 (`feat(loop3): …`, ver sección siguiente) y commit 2 con los del Loop 4: `feat(loop4): base y API de campo y flota — viajes, hojas de ruta y asistencia (Claude Code)`. Si separarlos es complicado, un solo commit `feat: loops 3 y 4 (parte 1) (Claude Code)`. Push.
4. Pegá en tu mesa hash, run del CI, línea de Vitest y el resultado de `node scripts/prueba-loop3.cjs` contra Vercel.

---

## Loop 3 completo implementado por Claude Code — L3.E3 y L3.E4 (2026-11-03 03:30)

> El usuario pidió (01:53) que Claude Code haga todo el proyecto de corrido mientras duerme. **Antigravity: solo commit y push; no modificar código ni documentos.** Esta sección reemplaza las instrucciones de commit de las secciones L3.E2 y L3.E1.

**L3.E3 (API):** `aprobacion.service.ts` (aprobar con evidencia: 1 OT, o proyecto + 1 OT por sucursal con `monto_presupuestado_gs` repartido exacto; todo en una transacción; doble aprobación → 409), módulo `proyectos/` (listado, detalle con OTs y total presupuestado, cerrar/cancelar solo con OTs finales → si no, 409 con la lista), `POST /api/comercial/ot/:id/proyecto` (asociar una OT **directa** a un proyecto abierto del mismo cliente), detalle de OT con presupuesto, proyecto, monto y **"Creada por" con nombre** (pendiente menor resuelto). Pruebas `tests/loop3/aprobacion-api.test.ts` (CA-3.4, 3.5, 3.7 + vínculo) y helpers `tests/loop3/helpers-comercial.ts`.

**L3.E4 (web):** `/presupuestos` (lista), `/presupuestos/$id` (ítems agrupados, total en vivo con la misma fórmula exacta del servidor, acciones según estado, versiones, historial), `/presupuestos/$id/imprimir` (hoja limpia para imprimir o guardar PDF, fuera del menú), `/proyectos` y `/proyectos/$id`, menú y guarda de rutas, `lib/api-presupuestos.ts` (+ test de métodos y rutas), `lib/numero.ts` (montos en formato paraguayo "150.000" / "2,5", + test), `hooks/useListadoUrl.ts`, `lib/fechas.ts` → `formatearDia` (día en hora de Asunción). Recorrido **`scripts/prueba-loop3.cjs` (CA-3.10): 9/9 OK en local**.

**Verificado:** base PostgreSQL 16 nueva con `0001`–`0008` desde cero; backend **107/107**, web **84/84**, lint y tipos en 0; ningún archivo de `apps/` o `packages/` supera 250 líneas.

**Para Antigravity (solo esto):**
1. En `afull-dev`: `SELECT count(*) FROM presupuesto WHERE total_gs < 0;` (debe dar 0) y `pnpm db:migrate`. Pegá las salidas.
2. `pnpm lint && pnpm typecheck && pnpm build`. **Un** commit con todo lo del disco: `feat(loop3): circuito comercial completo — presupuestos, aprobación, proyectos y pantallas (Claude Code)`. Push.
3. Después del deploy: `node scripts/prueba-loop3.cjs` con `BASE_URL` de Vercel. Pegá hash, run del CI, línea de Vitest y salida del recorrido en tu mesa; fila en la bitácora §13 de `TRASPASO.md` en un commit `docs:`.

---

## L3.E2 implementada por Claude Code — API de presupuestos (2026-11-03 02:30)

**Protocolo nuevo (decisión del usuario, 2026-11-03):** Claude Code implementa, prueba y documenta. **Antigravity solo hace commit y push** de lo que está en el disco, con el mensaje indicado, y pega el resultado del CI en `MESA_DE_TRABAJO.md`. No modifica código ni documentos.

**Qué hay en el disco (sin commit) — incluye también las correcciones de L3.E1 de la sección siguiente:**
- `apps/api/src/modules/presupuestos/` (nuevo): `routes.ts`, `consultas.service.ts` (listado paginado con búsqueda por número, título o **nombre de cliente**; detalle con ítems, eventos con autor y versiones), `borrador.service.ts` (crear con `siguiente_valor('PRE-AAAA')` en la misma transacción, editar cabecera con `updatedAt` → 409, agregar y editar ítems; todo con la cabecera `FOR UPDATE` y solo en `BORRADOR` → si no, 409 "creá una nueva versión"), `transiciones.service.ts` (enviar, rechazar, anular, nueva versión).
- **Enviar** calcula y congela `total_gs` **en el servidor**, con los valores leídos como texto de la base y la fórmula exacta de `shared`. Exige ≥ 1 ítem activo y "todos con sucursal o ninguno".
- **Nueva versión** bloquea **todas** las versiones del número (`FOR UPDATE`): desde `ENVIADO` el original pasa a `REEMPLAZADO`; desde `RECHAZADO` queda como está; copia cabecera e ítems activos. Si ya existe una versión posterior → 409.
- Rechazar y anular exigen comentario (400). Auditoría y evento siempre en la misma transacción.
- `apps/api/src/index.ts`: ruta `/api/presupuestos`. `tests/loop1/ot-api.test.ts`: CA-1.10 exige 403 sin `comercial` también en `/api/presupuestos`.
- `packages/shared/src/schemas/presupuestos.ts`: cantidad y precio con **máximo 4 decimales**, margen con 2 (la base redondearía en silencio), topes de largo y de valor.
- `migrations/0008_comercial_blindaje.sql`, punto 5 (agregado): el `CHECK` de `0007` (`estado = 'BORRADOR' OR total_gs IS NOT NULL`) **impedía anular un borrador**. Ahora el total es obligatorio salvo en `BORRADOR` y `ANULADO`.
- `tests/loop3/presupuestos-api.test.ts` (8 casos): número y evento inicial; sucursal de otro cliente y 5 decimales → 400; total exacto 196 con ítem inactivo excluido; sin ítems y sucursales mezcladas → 400; **CA-3.6** (cabecera e ítems 409 después de enviar) y doble envío simultáneo → un solo 200; versiones; doble "nueva versión" simultánea → una sola; anular exige motivo, búsqueda por nombre de cliente, taller → 403.
- `TRASPASO.md`: forma de trabajo, `0008` en §5, §12 "Siguiente paso", backup-storage al Loop 4.

**Verificado en base PostgreSQL 16 nueva, migraciones `0001`–`0008` desde cero:** backend **102/102** (sin `anon.test`), web 76/76, lint y tipos en 0, todos los archivos ≤ 250 líneas.

**Para Antigravity (solo esto):**
1. En `afull-dev`: `SELECT count(*) FROM presupuesto WHERE total_gs < 0;` debe dar 0. Después `pnpm db:migrate` (aplica `0008`). Pegá ambas salidas.
2. `pnpm lint && pnpm typecheck && pnpm build`, y un commit con **todo** lo que hay en el disco: `feat(loop3): API de presupuestos (L3.E2) y blindaje del motor comercial (Claude Code)`. Push.
3. Pegá en `MESA_DE_TRABAJO.md` el hash, el run del CI y la línea `Test Files … / Tests …`. Agregá la fila del commit en la bitácora §13 de `TRASPASO.md` en un segundo commit `docs:`.

---

## Correcciones aplicadas por Claude Code — L3.E1 (commits auditados `780fe04`, `285ea5e`) — 2026-11-03 01:30

**Verificado en clon limpio + PostgreSQL 16:** la migración `0007` aplica desde cero; suite backend 85/85 (sin `anon.test`); conteo de Loop 2 aclarado (65). La estructura de `0007` está bien: FK compuestas, índice parcial de versión viva, evento inmutable, sin `DELETE`. Encontré **un error de cálculo** y **cinco agujeros del motor**. Los corregí en el disco, **sin commit**:

| # | Problema (reproducido) | Corrección |
|---|---|---|
| 1 | **Las fórmulas usaban `float` de JS**, contra el diseño (§4). Caso real: ítem de Gs 170 con margen 15 % → 195,5 debe dar **196** y daba **195** (en float es 195,4999…). Igual con 870 → 1001 vs 1000. Además, el test de "reparto inexacto" no ejercitaba el ajuste del resto (la diferencia daba 0). | `packages/shared/src/formulas/presupuesto.ts` reescrito con **BigInt en escala fija** (4 decimales para cantidad y precio, 2 para el margen, un solo redondeo mitad hacia arriba). Acepta `number` o `string` (postgres-js devuelve NUMERIC como string) y rechaza más de 4 decimales. **Cambio de firma:** `calcularTotalPresupuesto(items, margenPct)` (antes recibía una base `number`, que ya perdía exactitud). `calcularSubtotalItem` y `calcularBaseImponible` quedan solo para mostrar. |
| 2 | `fn_ot_presupuesto_inmutable` comparaba con `<>`: **`SET presupuesto_id = NULL` pasaba** (NULL no es distinto con `<>`). Lo mismo con el monto. | `IS DISTINCT FROM`. |
| 3 | El trigger de ítems solo miraba el presupuesto **de destino**: un ítem de un presupuesto `ENVIADO` se podía mover a un borrador y editarse. | Prohibido cambiar `presupuesto_id` o `cliente_id` de un ítem. |
| 4 | **Carrera:** un ítem insertado mientras otra transacción envía el presupuesto quedaba fuera del total congelado (el trigger leía el estado sin lock). | El trigger lee la cabecera `FOR SHARE`: espera al envío y ve `ENVIADO`. |
| 5 | La cabecera de un presupuesto `ENVIADO` se podía cambiar (margen, total, título): CA-3.6 solo se cumplía en código. Y uno `APROBADO` podía volver a `ENVIADO`. | Trigger `fn_presupuesto_congelado`: fuera de `BORRADOR` solo cambia `estado`; en estado final, nada. |
| 6 | `total_gs` admitía negativos. | `CHECK (total_gs IS NULL OR total_gs >= 0)`. |

**Archivos:** `migrations/0008_comercial_blindaje.sql` (nueva: 0007 ya está aplicada en dev, no se edita) + entrada en `migrations/meta/_journal.json`; `packages/shared/src/formulas/presupuesto.ts`; `tests/loop3/presupuesto-formulas.test.ts` (adaptado a la firma nueva + 3 casos); `tests/loop3/presupuesto-auditoria.test.ts` (nuevo, 6 casos). **Los 6 casos del motor fallan con `0007` sola** y pasan con `0008`. Suite completa: **94/94** backend, 76/76 web, lint y tipos en 0.

**Para Antigravity:** ⚠️ *Reemplazado por las instrucciones de L3.E2 (arriba): un solo commit con todo.*
1. Antes de aplicar `0008` en `afull-dev`: `SELECT count(*) FROM presupuesto WHERE total_gs < 0` debe dar 0 (si no, el `CHECK` falla). Probar con `BEGIN … ROLLBACK` y pegar la salida; después `pnpm db:migrate`.
2. Lint, tipos, suites, y **un** commit: `fix(loop3): fórmulas exactas en BigInt y blindaje del motor de presupuestos (auditoría Claude Code)`. CI en tu mesa.
3. **Para L3.E2 y L3.E3:** el total y el reparto se calculan **siempre en el servidor** con estas funciones, a partir de los valores leídos de la base (strings de NUMERIC), nunca con números que vengan del navegador. Enviar = `FOR UPDATE` de la cabecera → leer ítems activos → calcular → `UPDATE` estado + `total_gs` + `enviado_at` en la misma transacción.
4. Seguir con L3.E2.

---

## Orden de trabajo — Loop 3 Comercial (2026-11-02 23:15)

**Cambio de plan decidido por el usuario.** El circuito comercial (presupuesto → proyecto → OT) no tenía loop asignado. Nuevo orden: `3 Comercial → 4 Campo y flota → 5 Stock → 6 Costeo → 7 Pre-prensa → 8 RR.HH. → 9 Portal`. Decisiones de negocio y matriz completa de requisitos (incluidos los del sistema viejo y la reunión del 19/10) en **`docs/MAPA_REQUISITOS.md`**. Diseño en **`docs/LOOP_3_DISENO.md`**.

**Para Antigravity:**
1. **Primero cerrar el Loop 2:** commit de las correcciones L2.E4 (sección siguiente) y propuesta de cierre en tu mesa. El Loop 3 arranca cuando el usuario confirme el cierre.
2. Actualizar `TRASPASO.md` §6 (orden de loops) y §8 (backlog renumerado: lo que era Loop 3 pasa a 4, y así hasta Portal = 9), y referenciar `docs/MAPA_REQUISITOS.md`. En el mismo commit, agregar los dos documentos nuevos.
3. Leer `LOOP_3_DISENO.md` completo. Si algo no cierra técnicamente, anotarlo en tu mesa **antes** de implementar esa parte.
4. Implementar L3.E1 → L3.E4 en orden (§10), una entrega por commit, con CI en verde y evidencia literal.
5. **Puntos donde es fácil equivocarse** (los reviso primero):
   - FK compuestas `(x_id, cliente_id)` en ítem, OT→presupuesto y OT→proyecto: la coherencia de cliente la garantiza el motor.
   - Índice único **parcial** de versión viva; "nueva versión" en una sola transacción.
   - Trigger que congela los ítems fuera de `BORRADOR`; `presupuesto_evento` inmutable; nada de `CASCADE` ni `DELETE`.
   - **Un solo redondeo**, al enviar; reparto por sucursal con ajuste de resto: Σ montos de OT = `total_gs` exacto. Sin `float` de JS para guaraníes.
   - Aprobar: `FOR UPDATE` + `desde`; OTs, proyecto, eventos y auditoría en **la misma transacción**; `publicarLive` después del commit.
   - Rutas nuevas en CA-1.10 y en la guarda de rutas de `AppLayout`.
   - El IVA queda **incluido** en los precios hasta que el usuario diga lo contrario (§0.4).

---

## Correcciones aplicadas por Claude Code — L2.E4 (commits auditados `bcbdc07`, `546d9c3`) — 2026-11-02 22:30

**Verificado en clon limpio + PostgreSQL 16:** lint 0, typecheck 0, web 76/76, `prueba-loop2.cjs` 9/9 en navegador. L2.E4 cumple el plan (los 7 puntos de mi respuesta están implementados). Exploré por API y por Playwright los casos que CA-2.9 no cubre y encontré **cuatro problemas**: tres de backend que dejaban un cronómetro corriendo para siempre y uno de navegación. Los corregí en el disco, **sin commit**:

| # | Problema (reproducido) | Corrección | Archivo |
|---|---|---|---|
| 1 | Se podía pasar una OT a `TERMINADO` o `CANCELADO` con una tarea `EN_CURSO`: el intervalo quedaba abierto en una OT cerrada y sumaba horas sin fin. | `transicionar()`: si el destino es final y hay tareas `EN_CURSO` → **409** "Hay N tarea(s) en curso: el operario debe pausarlas o finalizarlas antes". | `apps/api/src/modules/comercial/ot.service.ts` |
| 2 | Se podía **iniciar** una tarea de una OT `TERMINADO`/`CANCELADO` (201), y esas tareas seguían en "Mi trabajo". | `iniciarTarea()`: lee la OT con `FOR UPDATE OF t FOR SHARE OF ot` (serializa contra `transicionar`, que la toma `FOR UPDATE`) → **409** si es final. `GET /api/mi-trabajo` ya no lista tareas de OTs finales (salvo una `EN_CURSO`, por seguridad). | `apps/api/src/modules/cronometro/service.ts` |
| 3 | Desactivar una persona con el cronómetro abierto respondía 200, y después el operario **no podía pausar** (403 "Persona inactiva"): intervalo huérfano. | `cambiarEstadoPersona()`: al desactivar, si tiene intervalo abierto → **409** "La persona tiene una tarea en curso: debe pausarla antes de desactivarla". | `apps/api/src/modules/personas/service.ts` |
| 4 | `ModalTransicionOT` mostraba cualquier 409 como "cambió concurrentemente", lo que ocultaba el motivo del punto 1. | Muestra el mensaje real del servidor (`mensajeDeError`) y recarga igual. | `apps/web/src/components/modals/ModalTransicionOT.tsx` |
| 5 | Un operario que escribía `/clientes` o `/en-vivo` a mano veía la pantalla con "Nuevo Cliente" y errores 403 (la API sí bloqueaba bien). | `AppLayout`: si la ruta pertenece a una sección sin capacidad → `<Navigate>` a `rutaInicialSegunCapacidades()` (con guarda contra bucle). Verificado con Playwright: operario en `/clientes` y `/en-vivo` termina en `/mi-trabajo`; admin en `/ots` se queda. | `apps/web/src/routes/app-layout.tsx` |

**Test nuevo:** `tests/loop2/cronometro-ot-final.test.ts` (3 casos). **Los tres fallan con el código de `546d9c3`** (200/201 en vez de 409) y pasan con la corrección. Suite backend: **65/65** (sin `anon.test`), web 76/76, lint y tipos en 0. Todos los archivos ≤ 250 líneas (`ot.service.ts` 232, `cronometro/service.ts` 212, `personas/service.ts` 217, `app-layout.tsx` 177).

**Comprobado y correcto (sin cambios):** 403 de operario en `/api/clientes`, `/api/personas`, `/api/live/estado`; tarifa solapada → 409 con su toast; reasignar tarea `EN_CURSO` → 409; cancelar `EN_CURSO` → 400 (la máquina no lo permite: hay que pausar antes); selector de vincular usuario; sin errores de consola fuera de los 401 previos al login.

**Ojo con `tests/loop0/seed.test.ts`:** cuenta **todos** los usuarios `zz_test_%` activos. Si un script de prueba (Playwright o manual) deja un usuario `zz_test_` activo en la base, ese test falla. Todo script debe desactivar sus usuarios al terminar.

**Para Antigravity:**
1. Revisar los 5 archivos + el test nuevo, correr `pnpm lint`, `pnpm typecheck`, backend y web, y hacer **un** commit: `fix(loop2): cronómetro no queda abierto en OT final ni persona inactiva; guarda de rutas por capacidad (auditoría Claude Code)`. Pegar el CI run en `MESA_DE_TRABAJO.md`.
2. Agregar a `docs/LOOP_2_DISENO.md` §3 las dos reglas nuevas: "Una OT no pasa a estado final con tareas `EN_CURSO`" y "No se inicia trabajo en una OT final"; y en §4 la de persona.
3. Volver a correr `scripts/prueba-loop2.cjs` contra local y contra Vercel después del deploy.
4. Con eso, proponer el **cierre del Loop 2** en tu mesa (CA-0.3, CA-2.1…CA-2.9 con su evidencia). No empezar otro loop: lo decide el usuario.

Pendiente menor que sigue abierto: "Creada por" en el detalle de OT muestra el UUID (mostrar `username`).

---

## Respuesta al plan de L2.E4 (Claude Code, 2026-11-02 20:50)

**Corrección de la auditoría L2.E2/E3 verificada** en `3ffd125` (CI #47 en verde). **Plan de L2.E4 aprobado**, con estos agregados:

1. **Falta un endpoint en la API.** `ModalVincularUsuario` necesita elegir un usuario, pero no existe ninguna ruta que liste usuarios (comprobado en `apps/api/src/index.ts`). Agregar `GET /api/usuarios/vinculables?q` (capacidad `admin`): devuelve `id`, `username`, `persona_id` y `activo`, solo usuarios activos, máximo 25. **Nunca** `password_hash`. Con su test de permisos (403 sin `admin`) y la entrada en el recorrido de CA-1.10.
2. **Ruta `/` según capacidad.** Hoy `/` redirige a `/clientes`, así que un operario de taller que entra a la raíz ve un 403. La redirección tiene que salir de la sesión (`/api/auth/yo`): operario → `/mi-trabajo`, `comercial` → `/clientes`, solo `rrhh` → `/personas`. Lo mismo después del login cuando no hay `volver`.
3. **"Mi trabajo" también se desactualiza:** si Comercial reasigna o cancela, el operario tiene que verlo. `useMiTrabajo` consulta cada 30 s **y** se invalida con los eventos de `suscribirseLive`, igual que `useLive`.
4. **Usuario sin persona vinculada:** `/api/mi-trabajo` responde 403 "Tu usuario no está vinculado a una persona". La pantalla tiene que mostrar ese mensaje claro (pedirle a RRHH o al administrador que lo vincule), no un error genérico.
5. **`claveIdempotencia`:** una clave **por toque**; se reutiliza **solo** si se reintenta ese mismo toque (error de red). No se guarda entre acciones distintas.
6. **Variables en Vercel:** en el log se ve una sola llamada a `create_project_env`. Pegar en la mesa la lista de **nombres** de las 4 variables configuradas (sin valores) y el entorno de cada una. Las `VITE_*` se leen al hacer el build, así que hay que **redeployar** después de cargarlas.
7. **CA-2.9 por la interfaz (Playwright):** el script crea el operario y su persona vinculada con el rol admin de la base (prefijo `zz_test_`), y al final cierra sus intervalos y desactiva todo, como `prueba-ui.cjs`.

---

## Correcciones aplicadas por Claude Code — L2.E2 y L2.E3 (commits auditados `e1fc4ad`, `d38e9b7`)

**Cómo audité:** cloné `0d5ed28`, apliqué `0001`–`0006` en un PostgreSQL 16 limpio y reproduje el CI: backend 57/57, web 47/47, lint 0, typecheck 0. Revisé el cronómetro, las tareas y el módulo `live`.

**Bien:** el cronómetro sigue el diseño (bloqueo de la persona con `FOR UPDATE`, idempotencia antes de validar, auto-pausa en la misma transacción, auditoría con `tx`, `publicarLive` después del commit). Usar `clock_timestamp()` con `greatest(…, hora_inicio)` es una buena solución para el `CHECK >=`. El payload de live es solo `{ tipo, id }`.

**Corregido (archivos en el disco, sin commit):**
1. **Clave y URL de Supabase escritas en el código** (`live/publicar.ts` y `web/src/lib/live.ts`, como valores por defecto). La clave anon es pública por diseño, pero el valor por defecto **fijo al proyecto `afull-dev`** hace que un deploy de prod sin variables publique en dev sin que nadie lo note. Además, **el CI llamaba de verdad a Supabase dev** en cada test que inicia una tarea. Ahora no hay valores por defecto: sin `SUPABASE_URL`/`SUPABASE_ANON_KEY` (API) o `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (web), no se publica ni se suscribe, y queda la consulta periódica. El test CA-2.6 configura sus propias variables y las restaura.
2. **"Hoy" en Control en Vivo usaba el día UTC** (`date_trunc('day', now())`). Entre las 21:00 y las 24:00 de Paraguay, los minutos de hoy se reiniciaban antes de tiempo, y no coincidían con "Mi trabajo", que sí usa `America/Asuncion`. Corregido con la misma expresión.
3. **Control en Vivo listaba a todas las personas activas**, incluido el personal de oficina. Ahora muestra las que tienen usuario activo con `taller`/`montaje`, más cualquiera con un cronómetro abierto.
4. **Pausar y finalizar no eran idempotentes:** recibían `claveIdempotencia` pero no la usaban. Un reintento de red después de un pausado exitoso respondía **400** al operario. Ahora, si la tarea ya está en el estado pedido, responde 200 sin repetir eventos ni publicar.
5. **Reasignar una tarea `EN_CURSO` a otra persona** dejaba el intervalo abierto del operario anterior sobre una tarea que ya no era suya: no podía pausarla, porque recibía 403, y su cronómetro quedaba corriendo. Ahora responde **409** "el operario debe pausarla antes de reasignarla".
6. **Test nuevo** `tests/loop2/cronometro-reintentos.test.ts` (2 tests, para 4 y 5). **Comprobé que fallan con el código anterior** (2 failed) y pasan con la corrección.

**Resultado:** backend **59/59**, web 47/47, lint 0, typecheck 0.

**Para Antigravity:**
1. Revisar los 6 archivos y el test nuevo, correr lint, typecheck y tests, y hacer el commit: `fix(api,web): live sin claves fijas, día de Asunción, idempotencia de pausar/finalizar y bloqueo de reasignación en curso (auditoría L2.E2/E3)`.
2. **Configurar en Vercel** `SUPABASE_URL` y `SUPABASE_ANON_KEY` (función de la API) y `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (build del web), con los valores de `afull-dev`. Sin eso no hay tiempo real en el deploy.
3. **Higiene de datos de prueba:** los fixtures de `live.test.ts` y `cronometro.test.ts` crean personas y clientes con prefijos `zz_op_`/`zz_cli_` y **dejan intervalos abiertos** en `dev`. Esas personas aparecen en Control en Vivo de `dev` para siempre. Usar `zz_test_` y, en el `afterAll` de cada archivo, **cerrar** los intervalos abiertos que creó (`UPDATE tarea_intervalo SET hora_fin = now(), motivo_cierre = 'FIN' WHERE hora_fin IS NULL AND persona_id IN (…)`). Borrarlos no se puede porque son inmutables, y está bien que así sea.
4. Para **L2.E4**: `suscribirseLive` ya no debe ser la única fuente. El hook de la pantalla (por ejemplo `useLive`) tiene que **consultar cada 30 s siempre** e invalidar al recibir un evento (diseño §5).

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
