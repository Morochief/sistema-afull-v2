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

## Cierre de L4.E3 en `afull-dev` — Claude, 2026-11-09 10:45 (sin Antigravity desde hoy: `CLAUDE.md` §12)
- Commit `6ad91b3` en `main`; CI `42626244889` **verde** (lint, tipos, tests, web, build); Vercel: "Deployment has completed".
- `0018` aplicada con el conector de Supabase en una transacción con su fila en `drizzle.__drizzle_migrations` (hash `9006c11d…942ccb`, `when` 1793000017000). Verificado: 18 migraciones, `archivo` con RLS, `afull_api` = `INSERT,SELECT,UPDATE`, `anon`/`authenticated` sin permisos, 3 triggers, bucket `afull-archivos` `public = false`, `10485760`, 4 tipos.
- `SUPABASE_SECRET_KEY` cargada en Vercel (Production) por el usuario.
- Prueba real desde el navegador sobre `https://sistema-afull-v2-api.vercel.app` (usuario `zz_test_fotos_vercel`, desactivado al final): login 200; permiso 201; solicitar 201 con URL firmada de `oxthxdnyxabupeebzwmn.supabase.co`; PUT a Storage 200; confirmar 200 `SUBIDO`; listar 1 (778 bytes); descarga firmada 200 `image/jpeg` 778 bytes; URL pública del objeto **400**; 6 MB declarados como 1000 → confirmar **400** "supera el máximo de 5 MB" y reconfirmar 409 (objeto borrado).
- Linter de seguridad de Supabase: solo `function_search_path_mutable` (14 funciones de trigger, incluida la nueva). Pendiente en una migración aparte.
- `D:\sistema-afull` puesto en `6ad91b3` (fetch + reset; `ARQUITECTURA_V3.md` y `MESA_DE_TRABAJO.md` figuran modificados solo por finales de línea CRLF de antes: sin cambios de contenido).

---

## Loop 4 (L4.E3): fotos y archivos — Claude Code, 2026-11-09 09:20

**Decisiones del usuario (hoy):** fotos sin señal se guardan en el celular y suben solas; foto del odómetro **obligatoria** al iniciar y cerrar; entran los 4 usos (odómetro y montaje, muestras de impresión, comprobante de permiso, foto del pedido del portal).

**Diseño:** `docs/LOOP_4_DISENO.md` §7.

**En el disco, sin commit:**
- `migrations/0018_archivos.sql` + `meta/_journal.json` (tabla `archivo` + bucket privado `afull-archivos`).
- Shared: `schemas/archivos.ts` (+ export en `index.ts`).
- API: **nuevo** `lib/almacenamiento.ts` (Storage por REST, sin SDK; memoria para tests/local), **nuevo** `modules/archivos/{referencias,service,routes}.ts`; `index.ts` (monta `/api/archivos`; `/api/archivos-falso` solo con `ALMACENAMIENTO=memoria` fuera de producción); `lib/errores.ts` (503); `portal/cliente.routes.ts` (subir/ver fotos del pedido) y `portal/comercial.service.ts` (cantidad de fotos); `hojas-ruta/service.ts` (viajes de la hoja con fotos); `permisos/consultas.service.ts` (cantidad de comprobantes).
- Web: **nuevos** `lib/{api-archivos,fotos-pendientes,imagen}.ts` (+ tests), `hooks/useFotosPendientes.ts`, `components/archivos/{BotonFoto,GaleriaArchivos,SeccionArchivos}.tsx`, `components/campo/{FotoMontaje,FotosPorSubir}.tsx`, `components/campo/ViajeCard.test.tsx`, `components/hojas-ruta/FotosHoja.tsx`, `components/ots/MuestrasTarea.tsx`, `components/portal/FotosPedidoPortal.tsx`; cambios en `ViajeCard`, `ParadasHoja`, `TarjetasTrabajo`, `SeccionTareasOT`, `FormPedido`, `ListasPortal`, `ModalPedido`, `routes/{calle,mi-trabajo,portal,hojas-ruta/detalle,permisos/detalle}.tsx`, `lib/{api-campo,api-permisos,api-portal,cola-offline}.ts`, `hooks/useSesion.ts`, `main.tsx`.
- Pruebas: `tests/loop4/{archivos-api,archivos-usos,almacenamiento}.test.ts`; **nuevo** `scripts/prueba-fotos.cjs` y `scripts/foto-prueba.cjs`; `scripts/prueba-loop4.cjs` y `scripts/prueba-sin-senal.cjs` **actualizados** (ahora sacan la foto del odómetro, que es obligatoria).
- Docs: `docs/LOOP_4_DISENO.md` §7, `docs/MAPA_REQUISITOS.md`, `TRASPASO.md` (§5, §6, §7, §10, §12), `.env.example`.

**Verificado (base nueva `0001`–`0018`, PostgreSQL 16 local, Storage en memoria):** backend **164/164** (152 + 12 nuevos), web **155/155** (141 + 14 nuevos), lint 0, tipos 0, build OK. Recorridos en navegador: fotos **8/8** (las imágenes **cargan**: odómetro y montaje en la hoja de ruta, muestra en la OT, PDF en el permiso, foto del pedido en el portal y en Comercial), Loop 4 **7/7**, sin señal **5/5** (la foto del odómetro guardada sin señal sube sola después del inicio del viaje). Bloque del bucket de `0018` probado con un esquema `storage` simulado: sin Storage se saltea; con Storage crea el bucket privado (y pasa a privado uno previo público); sin la columna avisa y no falla.
**No verificado:** contra Supabase real (rutas REST tomadas del código de `storage-js` y probadas con fetch simulado). Lo confirma el paso 5.

### Mensaje para Antigravity
1. `git status`: `Documentos/` NO debe aparecer. Confirmar que entran los archivos nuevos de la lista (en especial `apps/api/src/modules/archivos/`, `apps/web/src/components/archivos/` y `migrations/0018_archivos.sql`).
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @afull/web test && pnpm build`. Commit: `feat(loop4): fotos y archivos — odómetro obligatorio, montaje, muestras, comprobantes y fotos del portal en Storage privado (Claude Code)`; push.
3. `pnpm db:migrate` en `afull-dev` (aplica `0018`). Pegá la salida, incluidos los `NOTICE`. Después, en el editor SQL: `SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'afull-archivos';` → tiene que dar `public = false`, `10485760` y los 4 tipos. Si la migración avisó que no pudo crearlo, crealo desde el panel (Storage → New bucket) con esos mismos datos y **privado**.
4. **El usuario** (o vos, sin pegarla en ningún chat ni archivo): en Supabase `afull-dev` → Settings → API Keys, crear/copiar una **secret key** (`sb_secret_…`) y cargarla en Vercel como `SUPABASE_SECRET_KEY` (entorno del deploy de dev). Redeploy. **No** cargar `ALMACENAMIENTO` en Vercel.
5. Contra Vercel (con `BASE_URL`): `node scripts/prueba-fotos.cjs`, `node scripts/prueba-loop4.cjs` y `node scripts/prueba-sin-senal.cjs`. Pegá las salidas. Si `prueba-fotos` falla en un paso de imágenes, pegá además la respuesta de `GET /api/archivos?viajeId=…` (sin la cookie) y el log de Vercel con `[almacenamiento]`.
6. Hash, CI y salidas en tu mesa; fila en la bitácora §13.

---

## Loop 4 (L4.E4): sin señal en la calle — Claude Code, 2026-11-03 21:30

**Antes, una corrección a tu mesa (Loop 9):** describiste los estados del pedido como `PENDIENTE, CONVERTIDO_OT, CONVERTIDO_PRESUPUESTO`; los reales son `NUEVO`, `CONVERTIDO` (con OT **o** presupuesto) y `DESCARTADO`, y el límite de 30 pedidos/día está en la API, no en un trigger. Corregilo en `MESA_DE_TRABAJO.md`.

**Diseño:** `docs/LOOP_4_DISENO.md` §6.

**En el disco, sin commit:**
- `migrations/0017_sin_senal.sql` + `meta/_journal.json`.
- Shared: `schemas/campo.ts` (`ocurridaAt` opcional; `completarParadaSchema`).
- API: `campo/comun.ts` (`horaDeAccion`: acota y marca), `campo/viajes.service.ts`, `campo/paradas.service.ts`, `campo/routes.ts`, `asistencia/routes.ts` (hora real, `sin_senal`, `recibida_at` en el listado).
- Web: `lib/cola-offline.ts` (+ `.test.ts`), `hooks/useColaOffline.ts`, `components/campo/EstadoConexion.tsx`; `MarcacionCard`, `ViajeCard`, `ParadasHoja`, `insumos/ModalCargarMaterial` (usan la cola); `lib/api-campo.ts` (respaldo de "hoy"); `routes/calle.tsx`; `routes/asistencia.tsx` y `lib/api-permisos.ts` (marca "sin señal"); `hooks/useSesion.ts` (último usuario conocido sin señal; dueño de la cola); `main.tsx` (sincronizador y registro del service worker solo en producción); **nuevo** `apps/web/public/sw.js`.
- Pruebas: `tests/loop4/sin-senal.test.ts`; `scripts/prueba-sin-senal.cjs`, `scripts/prueba-sin-senal-recarga.cjs` (este último necesita el sitio compilado o Vercel).
- Docs: `docs/LOOP_4_DISENO.md` §6, `TRASPASO.md` §5 y §6.

**Verificado:** base nueva `0001`–`0017`; backend **152/152**, web **141/141**, lint y tipos en 0; recorridos locales Loop 3 **9/9**, 4 **7/7**, 5 **7/7**, 6 **5/5**, 7 **5/5**, 8 **6/6**, 9 **7/7**, sin señal **4/4**; recarga sin señal con el sitio compilado: **OK**.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer. Confirmar que `apps/web/public/sw.js` SÍ entra (es nuevo).
2. `pnpm db:migrate` en `afull-dev` (aplica `0017`). Pegá la salida.
3. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop4): sin señal en la calle — cola en el celular con hora real y app que abre sin conexión (Claude Code)`; push.
4. Contra Vercel: `node scripts/prueba-sin-senal.cjs` y `node scripts/prueba-sin-senal-recarga.cjs` (con `BASE_URL`). Verificar que `https://…/sw.js` responde 200 (no el `index.html`). Hash, CI y salidas en tu mesa; fila en la bitácora §13.

---

## Loop 9: portal del cliente y pedidos — Claude Code, 2026-11-03 20:00

**Diseño, seguridad y supuestos:** `docs/LOOP_9_DISENO.md`.

**En el disco, sin commit:**
- `migrations/0016_portal.sql` + `meta/_journal.json`.
- Shared: `schemas/portal.ts` (+ export).
- API: `modules/portal/` (`cliente.routes.ts` público con `Authorization: Portal`, `comercial.service.ts`, `comercial.routes.ts`), rutas `/api/portal`, `/api/portal-accesos`, `/api/pedidos` en `index.ts`; `comercial/ot.service.ts` (`crearOTEnTx`) y `presupuestos/borrador.service.ts` (`crearPresupuestoEnTx`) para convertir el pedido en la misma transacción.
- Web: `lib/api-portal.ts` (+ `.test.ts`), `components/portal/` (`FormPedido`, `ListasPortal`, `ModalPedido`, `SeccionPortalCliente`), `routes/portal.tsx` (pública, fuera del AppLayout), `routes/pedidos/lista.tsx`; `routes/clientes/detalle.tsx` (sección Portal), `router.tsx` (rutas simples en una línea: quedó en 208), `routes/app-layout.tsx` (menú Pedidos), `hooks/useListadoUrl.ts`.
- Pruebas: `tests/loop9/portal-api.test.ts`; `scripts/prueba-loop9.cjs`.
- Docs: `docs/LOOP_9_DISENO.md`, `MAPA_REQUISITOS.md`, `TRASPASO.md` §5 y §6.

**Verificado:** base nueva `0001`–`0016`; backend **150/150**, web **135/135**, lint y tipos en 0; recorridos locales Loop 3 **9/9**, 4 **7/7**, 5 **7/7**, 6 **5/5**, 7 **5/5**, 8 **6/6**, 9 **7/7**.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer.
2. `pnpm db:migrate` en `afull-dev` (aplica `0016`). Pegá la salida.
3. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop9): portal del cliente por enlace y bandeja de pedidos (Claude Code)`; push. Correr `node scripts/prueba-loop9.cjs` contra Vercel. Hash, CI y línea de Vitest en tu mesa; fila en la bitácora §13.
4. **Verificar en Vercel** que `/portal` carga directo (sin pasar por el login) al abrir el enlace en una ventana de incógnito.

---

## Loop 8: RR.HH. (permisos y asistencia) — Claude Code, 2026-11-03 18:30

**Diseño y supuestos:** `docs/LOOP_8_DISENO.md` (basado en el formulario de permiso de la empresa; jefe = admin).

**En el disco, sin commit:**
- `migrations/0015_permisos.sql` + `meta/_journal.json`.
- Shared: `machines/permiso.ts`, `schemas/permisos.ts` (+ exports), `schemas/campo.ts` (`q` en el filtro de asistencia).
- API: `modules/permisos/` (`mutaciones.service.ts`, `consultas.service.ts`, `routes.ts`), ruta `/api/permisos` en `index.ts`; `asistencia/routes.ts` (búsqueda por persona).
- Web: `lib/api-permisos.ts` (+ `.test.ts`), `components/permisos/` (`etiquetas.ts`, `ModalNuevaSolicitud.tsx`), `routes/permisos/lista.tsx` y `detalle.tsx`, `routes/asistencia.tsx`; `router.tsx`, `routes/app-layout.tsx` (menú Permisos para todos, Asistencia para RR.HH.), `hooks/useListadoUrl.ts`.
- Pruebas: `tests/loop8/permisos-api.test.ts`; `scripts/prueba-loop8.cjs`.
- Docs: `docs/LOOP_8_DISENO.md`, `MAPA_REQUISITOS.md`, `TRASPASO.md` §5 y §6.

**Verificado:** base nueva `0001`–`0015`; backend **146/146**, web **122/122**, lint y tipos en 0; recorridos locales Loop 3 **9/9**, 4 **7/7**, 5 **7/7**, 6 **5/5**, 7 **5/5**, 8 **6/6**.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer.
2. `pnpm db:migrate` en `afull-dev` (aplica `0015`). Pegá la salida.
3. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop8): RR.HH. — solicitudes de permiso con firmas y pantalla de asistencia (Claude Code)`; push. Correr `node scripts/prueba-loop8.cjs` contra Vercel. Hash, CI y línea de Vitest en tu mesa; fila en la bitácora §13.

---

## Loop 6: costeo real por OT — Claude Code, 2026-11-03 17:00

**Diseño y supuestos:** `docs/LOOP_6_DISENO.md` (reparto de km en partes iguales, umbral 20 %, tiempo de viaje no imputado).

**En el disco, sin commit:**
- `migrations/0014_costeo.sql` + `meta/_journal.json`.
- Shared: `schemas/costeo.ts` (+ export en `index.ts`).
- API: `modules/costeo/` (`calculo.service.ts`, `consultas.service.ts`, `routes.ts`), ruta `/api/costeo` en `index.ts`; `comercial/ot.service.ts` (snapshot al pasar a TERMINADO o CANCELADO, misma transacción).
- Web: `lib/api-costeo.ts` (+ `.test.ts`), `lib/margen.ts`, `components/costeo/SeccionCosteoOT.tsx` y `SeccionCosteoProyecto.tsx`, `routes/rentabilidad.tsx`; `routes/ots/detalle.tsx`, `routes/proyectos/detalle.tsx`, `router.tsx`, `routes/app-layout.tsx` (menú Rentabilidad), `hooks/useListadoUrl.ts` (genérico para el resumen).
- Pruebas: `tests/loop6/costeo-api.test.ts`; `scripts/prueba-loop6.cjs`.
- Docs: `docs/LOOP_6_DISENO.md`, `TRASPASO.md` §5 y §6.

**Verificado:** base nueva `0001`–`0014`; backend **142/142**, web **115/115**, lint y tipos en 0; recorridos locales Loop 3 **9/9**, Loop 4 **7/7**, Loop 5 **7/7**, Loop 6 **5/5**, Loop 7 **5/5**.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer.
2. `pnpm db:migrate` en `afull-dev` (aplica `0014`). Pegá la salida.
3. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop6): costeo real por OT — snapshot al cerrar, consolidado de proyecto y rentabilidad (Claude Code)`; push. Correr `node scripts/prueba-loop6.cjs` contra Vercel. Hash, CI y línea de Vitest en tu mesa; fila en la bitácora §13.

---

## Loop 5 (parte 3): precios solo para admin y comercial + catálogo real — Claude Code, 2026-11-03 15:40

**Decisiones del usuario (2026-11-03 14:59):** "importa todos los insumos" y "los operarios nunca deben ver precios de nada, solo el admin y comercial".

**En el disco, sin commit (se suma a la parte 2, que tampoco tiene commit todavía):**
- Shared: `packages/shared/src/permisos.ts` (`puedeVerCostos`) y su export en `index.ts`.
- API: `insumos/routes.ts` (catálogo sin costo para operarios; `GET /api/consumos/ot/:otId` solo comercial), `flota/routes.ts` (vehículos sin `costo_km_gs` para la cuadrilla).
- Web: `BuscadorInsumo.tsx` (sin precio si viene null), `lib/api-campo.ts`.
- Pruebas: `tests/loop5/costos-visibles.test.ts` (nuevo); `tests/loop5/consumos-api.test.ts` (las consultas con costos ahora las hace admin); `scripts/prueba-loop5.cjs` (Edu no ve "Gs.").
- Importador: `scripts/importar-insumos.ts` (ignora repetidas idénticas; importa sin precio las filas sin costo).
- **Fuera del repo:** `D:\sistema-afull\Documentos\insumos_corregido.csv` (las 15 filas resueltas; ver `docs/LOOP_5_DISENO.md` §7).
- Docs: `LOOP_5_DISENO.md` §6–8, `TRASPASO.md` §3 (regla de precios), §5 y §12 (excepción solo para el catálogo en dev).

**Verificado:** base nueva `0001`–`0013`; backend **138/138**, web **110/110**, lint y tipos en 0; recorridos Loop 5 **7/7**, Loop 3 **9/9**, Loop 4 **7/7**, Loop 7 **5/5**. Importación en base local: 255 insumos (1 sin precio); la segunda corrida importa 0.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` (y `insumos_corregido.csv`) NO deben aparecer.
2. `pnpm lint && pnpm typecheck && pnpm build`. Dos commits: (a) la parte 2 con su mensaje; (b) `feat(loop5): precios solo para admin y comercial; importador acepta filas sin costo (Claude Code)`. Push.
3. **Autorizado por el usuario, solo en `afull-dev`:** `pnpm tsx scripts/importar-insumos.ts Documentos/insumos_corregido.csv` (prueba: tiene que decir `para importar: 255 (sin precio: 1) · repetidas idénticas: 5 · a revisar: 0`) y después lo mismo con `--aplicar` (tiene que decir `Importados: 255`). Verificá que `DATABASE_URL_ADMIN` apunte a **afull-dev**, no a prod. Pegá las dos salidas en tu mesa.
4. Hash, CI y línea de Vitest en tu mesa; filas en la bitácora §13.

---

## Loop 5 (parte 2): pantallas de material — Claude Code, 2026-11-03 15:00

**En el disco, sin commit:**
- Web nuevos: `lib/api-insumos.ts` (+ `.test.ts`), `components/insumos/` (`BuscadorInsumo`, `ModalCargarMaterial`, `ModalMerma` (+ `.test.tsx`), `ModalCompartido`, `AccionesMaterial`, `SeccionMaterialOT`), `routes/insumos.tsx`.
- Web cambiados: `TarjetasTrabajo.tsx` (botones Material/Merma/Compartido), `campo/ParadasHoja.tsx` (Material por parada), `lib/api-campo.ts`, `routes/ots/detalle.tsx` (sección Material usado), `router.tsx` (`/insumos`), `routes/app-layout.tsx` (menú Insumos, solo admin).
- API: `campo/paradas.service.ts` (la parada de "hoy" trae `orden_trabajo_id`); prueba en `tests/loop4/campo-api.test.ts`.
- `scripts/prueba-loop5.cjs` (nuevo); `.gitignore` (capturas `prueba-loop*-falla-*.png`); docs `LOOP_5_DISENO.md` §5–6, `TRASPASO.md`.

**Verificado:** base nueva `0001`–`0013`; backend **134/134**, web **110/110**, lint y tipos en 0; recorridos locales Loop 5 **7/7**, Loop 3 **9/9**, Loop 4 **7/7**, Loop 7 **5/5**. Sin migraciones nuevas.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer. **No correr el importador con `--aplicar`.**
2. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop5): pantallas de material — cargar, merma, compartido, material por OT y catálogo (Claude Code)`; push. Correr `node scripts/prueba-loop5.cjs` contra Vercel si se puede. Hash, CI y línea de Vitest en tu mesa; fila en la bitácora §13.

---

## Loop 5 (parte 1): insumos y consumos, sin stock — Claude Code, 2026-11-03 13:45

**Decisiones del usuario:** el Excel de insumos es el catálogo; **no hay stock**; cada operario carga lo que usó.

**En el disco, sin commit:** `migrations/0013_insumos_consumos.sql` + `_journal.json`; shared `formulas/material.ts`, `schemas/insumos.ts` (exportados en `index.ts`); API `modules/insumos/` (`routes.ts`, `catalogo.service.ts`, `consumos.service.ts`) y rutas `/api/insumos` y `/api/consumos` en `index.ts`; `scripts/importar-insumos.ts`; pruebas `tests/loop5/material.test.ts` y `tests/loop5/consumos-api.test.ts`; docs `docs/LOOP_5_DISENO.md`, `MAPA_REQUISITOS.md`, `TRASPASO.md`.

**Verificado:** base nueva `0001`–`0013`; backend **134/134**, web 99/99, lint y tipos (incluidos los tests) en 0. Importador probado con la planilla real **sin escribir**: 246 listos, 15 a revisar.

**Para Antigravity (solo esto):**
1. `git status`: `Documentos/` NO debe aparecer. `pnpm db:migrate` en `afull-dev` (aplica `0013`). **No correr el importador con `--aplicar`**: lo decide el usuario (datos reales).
2. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop5): insumos y consumos sin stock — catálogo, merma, plancha compartida e importador (Claude Code)`; push. Hash, CI y línea de Vitest en tu mesa; fila en la bitácora §13.

---

## Precio como en las planillas, procesos administrables y cronómetro para Comercial — Claude Code, 2026-11-03 13:00

**Origen:** el usuario dejó planillas reales en `D:\sistema-afull\Documentos`. ⚠️ **Esa carpeta NO se commitea** (el repo es público): ya está en `.gitignore` (`Documentos/`, `*.xlsx`, `*.docx`). Antigravity: verificá con `git status` que no aparezca antes de commitear.

**Decisiones del usuario:** margen **sobre la venta** (precio = costo ÷ (1 − margen), 30 % por defecto) con **precio final redondeado** opcional; cronómetro también para `comercial` (Juan y Sofi cargan presupuesto y relevamiento); catálogo de procesos administrable por Juan.

**En el disco, sin commit (además de L4.E4 de la sección siguiente):**
- `.gitignore`; `migrations/0012_procesos_margen.sql` + `_journal.json`.
- Shared: `formulas/presupuesto.ts` (margen sobre venta; reparto proporcional al costo), `machines/tarea.ts` (tipo = código de proceso), `schemas/tareas.ts` (+ esquemas de proceso), `schemas/presupuestos.ts` (margen < 100, `precioFinalGs`), `types/presupuestos.ts`.
- API: `modules/procesos/routes.ts` (nuevo) y ruta en `index.ts`; `comercial/tareas.service.ts` (proceso activo); `presupuestos/borrador|transiciones|consultas`; `comercial` en `cronometro/routes.ts`, `live/service.ts`, `personas/vinculos.service.ts`.
- Web: `lib/api-procesos.ts`, `components/procesos/` (opciones agrupadas por área), `routes/procesos.tsx` (admin), `SelectorTareasOT.tsx`, `ModalNuevaTareaOT.tsx`, `SelectorMarkup.tsx` (margen + precio final), `TablaItems.tsx`, `presupuestos/detalle.tsx`, `ModalNuevoPresupuesto.tsx`, `router.tsx`, `app-layout.tsx`.
- Pruebas: `tests/loop3/procesos-api.test.ts` (nuevo) y ajustes en `presupuesto-formulas`, `presupuestos-api`, `aprobacion-api`; `scripts/prueba-loop3.cjs` (montos con margen sobre venta).
- Docs: `LOOP_3_DISENO.md` §11, `MAPA_REQUISITOS.md` (hallazgos sin datos sensibles), `TRASPASO.md` §5.

**Verificado:** base nueva `0001`–`0012`; backend **125/125**, web **99/99**, lint y tipos en 0; recorridos locales Loop 3 **9/9**, Loop 4 **7/7**, Loop 7 **5/5**.

**Para Antigravity (solo esto):**
1. `git status`: confirmar que `Documentos/` NO aparece. `pnpm db:migrate` en `afull-dev` (aplica `0012`). Pegá la salida.
2. `pnpm lint && pnpm typecheck && pnpm build`. Dos commits: (a) los archivos de L4.E4 (sección siguiente) con su mensaje; (b) el resto: `feat: margen sobre venta, precio redondeado, catálogo de procesos y cronómetro para Comercial (Claude Code)`. Push.
3. Después del deploy: `prueba-loop3.cjs`, `prueba-loop4.cjs` y `prueba-loop7.cjs` con `BASE_URL` de Vercel. Pegá hash, CI, Vitest y las tres salidas; filas en la bitácora §13.

---

## Loop 4 — pantallas de campo (L4.E4, sin offline) — Claude Code, 2026-11-03 11:45

**En el disco, sin commit (solo web + script; sin migraciones):**
- `apps/web/src/lib/api-campo.ts` (+ test de métodos y rutas, 13 casos), `lib/dispositivo.ts` (huella de dispositivo, GPS, enlace a Google Maps).
- `routes/calle.tsx` + `components/campo/` (`MarcacionCard`, `ViajeCard`, `ParadasHoja`): pantalla "En la calle" para montaje/taller.
- `routes/hojas-ruta/lista.tsx` y `detalle.tsx`: coordinación (comercial).
- `routes/flota.tsx`: vehículos y sedes (admin).
- `router.tsx`, menú en `app-layout.tsx` ("En la calle", "Hojas de ruta", "Flota y sedes").
- `scripts/prueba-loop4.cjs`: recorrido coordinación → montador (GPS simulado) **7/7 en local**.
- Docs: `LOOP_4_DISENO.md` (estado), `MAPA_REQUISITOS.md`, `TRASPASO.md` §6.

**Verificado:** web **99/99**, lint y tipos en 0, archivos ≤ 250 líneas. Backend sin cambios (123/123).

**Para Antigravity (solo esto):**
1. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat(loop4): pantallas de campo — En la calle, hojas de ruta y flota (Claude Code)`; push.
2. Después del deploy: `node scripts/prueba-loop4.cjs` con `BASE_URL` de Vercel. Pegá hash, CI y la salida en tu mesa; fila en la bitácora §13.

---

## IVA aparte, markup en borrador y Loop 7 (diseños) — Claude Code, 2026-11-03 11:00

**Decisiones del usuario:** IVA **aparte** (10 % sobre el precio); markup elegible en el borrador (25/30/35/40 % o libre); geocerca que registra y avisa (ya era así); hacer ya la cola de diseños. Sofi: todo diseño, también el del cliente, se verifica "sí o sí".

**En el disco, sin commit:**
- `migrations/0011_iva_disenos.sql` + `_journal.json`: `presupuesto.iva_gs` (congelado por `fn_presupuesto_congelado`) y tabla `diseno_version`.
- Presupuestos: `formulas/presupuesto.ts` (`calcularIvaGs`), `transiciones.service.ts` (enviar guarda `iva_gs`), `consultas.service.ts`, `types/presupuestos.ts`; web `TablaItems.tsx` (costo, markup, precio sin IVA, IVA, total), `SelectorMarkup.tsx` (nuevo), `detalle.tsx`, `lista.tsx`, `imprimir.tsx` (subtotal + IVA + total), `ModalAccionPresupuesto.tsx`, `etiquetas.ts`.
- Diseños: `schemas/disenos.ts`, `apps/api/src/modules/disenos/`, ruta `/api/disenos` en `index.ts`; web `lib/api-disenos.ts` (+ test), `components/disenos/` (sección de OT, modal, botón para Mi trabajo, etiquetas), `routes/disenos.tsx`, `router.tsx`, menú en `app-layout.tsx`, `ots/detalle.tsx`, `TarjetasTrabajo.tsx`.
- Pruebas: `tests/loop7/disenos-api.test.ts`, ajustes en `tests/loop3/*` (IVA), `scripts/prueba-loop7.cjs` (nuevo, **5/5**), `scripts/prueba-loop3.cjs` (usa el precio sin IVA, **9/9**).
- Docs: `docs/LOOP_7_DISENO.md` (nuevo), `LOOP_3_DISENO.md` §11, `MAPA_REQUISITOS.md`, `TRASPASO.md` §5 y §6.

**Verificado:** base nueva `0001`–`0011`; backend **123/123**, web **86/86**, lint y tipos en 0, archivos ≤ 250 líneas.

**Para Antigravity (solo esto):**
1. `pnpm db:migrate` en `afull-dev` (aplica `0011`). Pegá la salida.
2. `pnpm lint && pnpm typecheck && pnpm build`; commit `feat: IVA aparte, markup en borrador y cola de diseños — Loop 7 (Claude Code)`; push.
3. Después del deploy: `node scripts/prueba-loop7.cjs` y `node scripts/prueba-loop3.cjs` con `BASE_URL` de Vercel. Pegá hash, CI, línea de Vitest y ambas salidas en tu mesa; fila en la bitácora §13.

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

---

## 2026-11-09 — Demo: datos, tablero de Inicio y recorrido (Claude, ciclo completo)

- **Base:** Vercel → `afull-demo` (`gjjtmjmxgoylcwpkkjwf`). Login `juan` en Vercel → 200; `/api/auth/yo` → admin.
- **Datos de demo por la API** (navegador integrado, origen Vercel): 4 clientes / 7 locales; PRE-2026-0001 aprobado → PRY-2026-0001 con OT-2026-0001..0003; presupuesto borrador y enviado; OT-0004 (diseño observado + v2), OT-0005 (terminada, sin presupuesto), OT-0006 (pendiente), OT-0007 (cancelada con motivo), OT-0008 (presupuesto aprobado, terminada). Hoja de ruta 09/11 con 2 paradas; 2 pedidos del portal (201/201); 3 permisos; consumos y merma; Edu con cronómetro abierto en OT-0002.
- **Excepción:** 8 intervalos cerrados (02–06/11) insertados por SQL en `tarea_intervalo` para horas realistas. Los triggers de inmutabilidad (`trg_tarea_intervalo_update`, `trg_ot_costeo_inmutable`) siguen intactos.
- **Costeo OT-2026-0008 (literal):** `horas 12, mano_obra_gs 380064, material_gs 1622200, total_gs 2002264, monto_presupuestado_gs 3914286, margen_pct 48.85, alertas []`.
- **Correcciones encontradas al recorrer:**
  1. Rentabilidad mostraba costo de todas las OTs junto al margen de solo las vendidas (3.914.286 vs 3.422.237 con margen 48,85 %): el resumen usa ahora `costo_con_venta` y muestra aparte el costo de OTs sin presupuesto.
  2. `/` llevaba a Clientes: nuevo tablero `/inicio` (`GET /api/inicio`, test `tests/loop9/inicio-api.test.ts`).
  3. En 375 px los montos del Inicio y Rentabilidad se cortaban: una columna en el celular.
  4. Portal: decía "Todavía no hiciste pedidos" mientras cargaba: ahora "Cargando…".
- **Verificación:** lint 0, tsc 0, build web 0, web 155/155, API (inicio + costeo) en verde; anon.test.ts solo corre con Supabase (CI dev). Recorrido de 24 rutas en Vercel sin errores; celular: Inicio, Mi trabajo (Gerardo), En la calle, Portal.

---

## 2026-11-09 — Loop 10: Tablero de Inicio cerrado con diseño y tests

La primera versión del Inicio salió sin diseño previo y con un test superficial. Se rehizo como loop: `docs/LOOP_10_INICIO_DISENO.md` (reglas de cada número y CA-10.1 a CA-10.9), tests escritos antes del arreglo, y cada test comprobado contra el código viejo.

**Errores encontrados al escribir el diseño (corregidos):**
1. "Pedidos nuevos" y "OTs atrasadas" mostraban el largo de la lista (tope 5 y 10), no el total → `pedidos_nuevos_total`, `atrasadas_total`.
2. "Terminadas (mes)" contaba por `orden_trabajo.updated_at` → ahora por el costeo congelado `TERMINADO` del mes; las canceladas ya no aparecen.
3. Presupuestos enviados: se suma `total_gs` (sin IVA, el mismo número de la lista; ya incluye el precio final redondeado).
4. Paradas resueltas: `COMPLETADA` u `OMITIDA` explícito.

**Evidencia (local, PostgreSQL 16):**
- `tests/loop10/inicio-api.test.ts` 2/2 (escenario por la API: 11 atrasadas + 1 prometida hoy + terminada y cancelada atrasadas, diseño pendiente, cronómetro abierto, presupuesto enviado, OT con venta terminada, 6 pedidos del portal, permiso, hoja de hoy con una parada omitida desde la calle; deltas exactos).
- `tests/loop10/rentabilidad-resumen.test.ts` 1/1: `resumen = { venta_gs: 1000000, costo_gs: 200000, costo_sin_venta_gs: 120000, margen_pct: 80 }`. Con el código viejo: `costo_gs: 320000` → falla.
- Web: `routes/inicio.test.tsx` 6/6 (con `pedidos_nuevos.length` en vez del total → falla), `routes/portal.test.tsx` 2/2 (sin el estado de carga → falla), `routes/rentabilidad.test.tsx` 2/2.
- `scripts/prueba-inicio.cjs` (Playwright, local): **6/6 OK**. Con la grilla vieja de montos: `FALLA 5 celular 375 px … montos cortados: Gs. 8.000.000, Gs. 2.000.000`.
- Totales: API 173/174 (falla solo `anon.test.ts`, necesita Supabase; corre en tests-dev), web 165/165, lint 0, tsc 0, build 0, archivos ≤ 250 líneas.

---

## 2026-11-09 — L9.E2: el cliente sigue su pedido hasta el final

**Error encontrado** (al explicarle el portal al usuario): un pedido convertido en **presupuesto** mostraba "Presupuestando" para siempre, aunque el presupuesto se aprobara y naciera la OT, se rechazara o pasara a v2. El camino **pedido → OT directa** funcionaba y se cubrió con test para no romperlo.

**Diseño:** `docs/LOOP_9_DISENO.md` §6 (CA-9.5 a CA-9.10). **Arreglo:** `apps/api/src/modules/portal/seguimiento.ts` (versión vigente del presupuesto; OT directa o la generada por el presupuesto aprobado: la del local del pedido, si no la menos avanzada), usado por el portal y la bandeja interna; `estadoPedidoCliente` en `@afull/shared` como regla única del texto.

**Evidencia (local):**
- `tests/loop9/seguimiento-pedido.test.ts`: antes del arreglo **4 fallas** (CA-9.6 `expected null to be 'OT-2026-0591'`, CA-9.7, CA-9.8, CA-9.9/10) y CA-9.5 (OT directa) en verde; después **11/11**.
- `ListasPortal.test.tsx` 4/4 (con la pantalla vieja falla "rechazado").
- `scripts/prueba-loop9.cjs` 7/7 (sin regresión) y `scripts/prueba-seguimiento-pedido.cjs` **6/6**; con la API vieja: `FALLA 4 … el cliente ve la OT "Recibido", ya no "Presupuestando"`.
- Totales: API 184/185 (solo `anon.test.ts`, necesita Supabase), web 169/169, lint 0, tsc 0, build 0.

---

## 2026-11-10 — L4.E5: agregar un proyecto entero a la hoja de ruta + Gerardo admin

**Pedido del usuario:** Gerardo (hermano de Juan) es admin: asigna las tareas y arma las hojas de ruta; cuando el trabajo es un proyecto, quiere agregar todas sus OTs de una vez. **Hecho en `afull-demo`:** el usuario `gerardo` pasa de `montaje` a `admin` (PATCH /api/usuarios, auditado) y su persona se llama "Gerardo (admin)".

**Diseño:** `docs/LOOP_4_DISENO.md` §8 (CA-4.20 a CA-4.23). **Código:** `POST /api/hojas-ruta/:id/paradas-proyecto` (`proyecto.service.ts`, una transacción, auditado), `paradasProyectoSchema`, `AgregarProyecto.tsx` en `/hojas-ruta/:id`.

**Evidencia (local):**
- `tests/loop4/hoja-proyecto.test.ts`: antes del código 3 fallas (`→ 404`); después **4/4** (abiertas en orden al final, salteando cerrada y repetida; en curso exige motivo y marca EXTRA; finalizada 409; nada para agregar o proyecto inexistente 400 sin cambios; taller 403).
- `AgregarProyecto.test.tsx` 4/4. `scripts/prueba-hoja-proyecto.cjs` **4/4** (admin arma hoja sin vehículo, agrega proyecto de 3 locales → "Se agregaron 3 paradas." y 1., 2., 3. en orden; repetir → aviso, sigue en 3).
- Totales: API 188/189 (solo `anon.test.ts`, necesita Supabase), web 173/173, lint 0, tsc 0, build 0.

---

## 2026-11-10 — L2.E5: el reloj de la tarea suma lo acumulado

**Error reportado por el usuario** (preparando la demo de Edu): al poner "Pausa breve" y reanudar, el reloj volvía a cero. Causa: la tarjeta mostraba solo el tramo abierto. Las horas no se perdían (cada tramo queda en `tarea_intervalo` y suma al costo).

**Diseño:** `docs/LOOP_2_DISENO.md` §9 (CA-2.20 a CA-2.22). **Arreglo:** `GET /api/mi-trabajo` devuelve `segundos_acumulados` por tarea (tramos cerrados de esa persona, todos los días, sin redondear); la tarjeta en curso muestra "Total en esta tarea" (acumulado + tramo) y "Este tramo"; la pausada, "Llevás …".

**Evidencia (local):**
- `tests/loop2/reloj-acumulado.test.ts`: antes del arreglo 3 fallas (`expected undefined to be 725`); después **3/3** (600 + 125 s de dos días = 725; otra tarea y otra persona no suman; el tramo abierto no entra).
- `TarjetasTrabajo.test.tsx` 3/3.
- `scripts/prueba-reloj-acumulado.cjs` (celular 375 px): con el código viejo `FALLA 4 reanuda … volvió a cero: marca 1 s`; con el nuevo **5/5**.
- Totales: API 191/192 (solo `anon.test.ts`, necesita Supabase), web 176/176, lint 0, `pnpm typecheck` 0 (incluye `tests/tsconfig.json`; el primer push falló en CI por un cast en el test, corregido), build 0.

---

## 2026-11-10 — Loop 11: la hoja de ruta de Gerardo vuelve a la OT

**Pedido del usuario:** en el sistema viejo el flujo estaba claro: Gerardo arma la **hoja de ruta de cada OT** (qué hace cada operario) y la manda por WhatsApp. En el nuevo eso estaba disperso. **Decisiones:** cada tarea tiene su día (el operario ve primero lo de hoy); la hoja nace en **Borrador** y los operarios no la ven hasta que se activa o se manda por WhatsApp; la pantalla de la camioneta pasa a llamarse **Salidas** (la ruta `/hojas-ruta` no cambia).

**Diseño:** `docs/LOOP_11_HOJA_RUTA_DISENO.md` (CA-11.1 a CA-11.7). **Migración `0019_hoja_ruta_ot`:** `orden_trabajo.hoja_estado` (BORRADOR|ACTIVA|CERRADA, default ACTIVA para las OTs que ya existen), `hoja_notas`, `hoja_activada_at`, `hoja_whatsapp_at`, `hoja_cerrada_at`; `tarea.fecha_trabajo`, `cantidad`, `unidad`, `minutos_estimados`. **API:** `POST/PATCH /api/ots/:id/hoja` (activar, cerrar con 409 si hay tareas sin terminar, reabrir; notas) y `POST /api/ots/:id/hoja/whatsapp` (texto con el formato viejo `*Hoja de Ruta — cliente*` / `⛔operario⛔` / `(Cant: n u)`; activa el borrador). OT nueva y OT de presupuesto aprobado nacen en Borrador ("Urgente: activar la hoja de ruta ya" la activa). `mi-trabajo` no muestra tareas de hojas en borrador y no deja iniciarlas (409). **Web:** sección "Hoja de ruta" en el detalle de la OT (tareas agrupadas por operario, estado, Activar, Enviar por WhatsApp, Cerrar/Reabrir, notas); "Mi trabajo" agrupado en Atrasadas / Para hoy / Próximas / Sin día con cantidad, día y tiempo estimado.

**Evidencia (local):**
- `tests/loop11/hoja-ruta-ot.test.ts` **4/4**; `SeccionHojaRuta.test.tsx` 6/6; `plan-tarea.test.ts` 4/4. Ajustes esperados por el cambio de comportamiento: `contrato-tipos` (claves nuevas), `inicio-api` (la OT de taller se crea con `activarHoja: true`), `inicio.test.tsx` ("No hay salidas para hoy.").
- `scripts/prueba-hoja-ruta-ot.cjs` **7/7** (Gerardo en escritorio y Edu en celular: borrador → Edu no la ve → WhatsApp con ⛔Edu⛔ y "(Cant: 3 m2)" → Activa → Edu la ve en "Para hoy" con "3 m2" → Cerrar rechazado, sigue Activa). Con el código viejo no existe la sección (falla en el paso 2).
- Recorridos previos re-corridos: loop2 9/9 (ahora marca "Urgente" al crear la OT), loop3 9/9 y prueba-ui 15/15 (el login del comercial va a `/inicio` desde el Loop 10), loop4 7/7 (link "Salidas", "¡Salida terminada!"), inicio 6/6, reloj acumulado 5/5, hoja + proyecto 4/4.
- Totales: API 195/196 (solo `anon.test.ts`, necesita Supabase), web 186/186, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-10 — L5.E3: en "Compartido" no se veía a qué OT era cada casillero

**Error reportado por el usuario** (captura de Edu en el celular): la ventana "Material compartido entre OTs" mostraba los casilleros de m² sin el código de OT ni el cliente. Causa: `Input` va envuelto en un `div` `w-full`, que en la fila flex aplastaba el nombre a 0 px. Arreglo: el casillero va en un contenedor fijo (`w-24 shrink-0`) y el nombre con `min-w-0`; placeholder "m²".

**Evidencia (local):** `scripts/prueba-compartido.cjs` (celular 375 px): con el código viejo `FALLA 2 Compartido muestra cada OT con su cliente…` (el nombre no es visible); con el arreglo **4/4** (cada OT con su cliente visible, reparte 5 m² en 2,857 / 2,143, la base suma 5). Web 186/186, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-10 — Loop 12: horas de máquina compartidas (tanda)

**Pedido del usuario** (ítem 1 del control cruzado con el sistema viejo): cuando Edu imprime una tanda con piezas de varios clientes, el tiempo de máquina tiene que repartirse por m² como el material. **Diseño:** `docs/LOOP_12_HORAS_COMPARTIDAS_DISENO.md`.

**Migración `0020_tanda_compartida`:** `tanda` y `tanda_tarea` (inmutables, RLS, sin DELETE), `tarea_intervalo.tanda_id` (el trigger impide cambiarlo) y la vista **`v_mano_obra`** (`security_invoker`): una fila por tramo cerrado y tarea, con `peso`/`peso_total` (m²; 1/1 sin tanda). **API:** `POST /api/mi-trabajo/tanda` (crea y arranca el reloj sobre la principal; misma clave para reintentos); iniciar/pausar/finalizar de la principal mueven las secundarias; operar una secundaria → 409; auto-pausa al cambiar de tarea pausa toda la tanda; la oficina no puede cancelar ni reasignar una tarea de una tanda abierta (409). Costeo de la OT, "Trabajado" de cada tarea y el aviso de relojes abiertos leen `v_mano_obra`. **Web:** botón "Tanda para varios clientes" en tareas de máquina, ventana con los m² propuestos desde la cantidad de cada tarea, etiqueta "Tanda compartida" en la tarjeta; Compartido (material) sigue listando las OTs de la tanda.

**Evidencia (local):**
- `tests/loop12/tanda.test.ts`: con el código anterior **6 fallas** (CA-12.2, sin regresión, en verde); con el código **7/7** (1 h de tanda → 12.000 y 9.000 Gs con tarifa 21.000; pausa/reanuda/finaliza mueven las dos; rechazos 400/403/409; inmutabilidad; oficina 409).
- `ModalTanda.test.tsx` **4/4**.
- `scripts/prueba-tanda.cjs` (celular 375 px) **6/6**: el tiempo queda en proporción 2 : 1,5 exacta entre las OTs. Sin regresión: compartido 4/4, reloj acumulado 5/5, hoja de ruta 7/7, loop2 9/9.
- Totales: API 202/203 (solo `anon.test.ts`, necesita Supabase), web 190/190, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-17 — Loop 18: Edu carga medidas en cm con la medida total del material

**Pedido** (reunión con Sofi del 10/11, notas y foto en el chat del 17/11): Edu mide en centímetros y anota la medida total del material (ej. adhesivo 137 × 691 cm) y las piezas de cada trabajo. **Diseño:** `docs/LOOP_18_MEDIDAS_CM_DISENO.md`.

**Qué cambió:** fórmula `calcularCorte` (cm con 2 decimales, exacta con BigInt; el desperdicio se reparte por m² de piezas y cierra exacto con lo usado), `POST /api/consumos/corte` (1 a 30 trabajos, solo insumos M2, idempotente; por OT una línea de piezas y una de desperdicio, mismo grupo). En la tarjeta de máquina, **Medidas (cm)** reemplaza a Merma y Compartido (los endpoints viejos siguen; la oficina conserva su Merma en metros en la OT). Ventana con anchos rápidos 137 y 152, varios trabajos (arranca con la OT o con toda la tanda), varias piezas por trabajo y resumen en vivo con el reparto. Se quitó `ModalCompartido` y su recorrido (reemplazados). Sin migración.

**Observación sobre la foto:** las cuatro piezas (87 × 330, 46 × 686, 90 × 303, 25 × 386) suman 9,7186 m², más que el adhesivo (9,4667 m²); probablemente la franja de bob (46) incluye la de mogul (25). El sistema lo frena con "Las piezas suman X m² y el material Y m²". A confirmar con Edu.

**Evidencia (local):** `tests/loop18/corte.test.ts` **7/7** (con el código anterior 7 fallas: no existía la fórmula ni el endpoint); `ModalCorte.test.tsx` **3/3**; `scripts/prueba-corte.cjs` (celular + oficina) **5/5** con el ejemplo de la reunión. Sin regresión: loop5 7/7 (actualizado a cm), tanda 6/6, loop2 9/9, reloj 5/5. Totales: API 209/210 (solo `anon.test.ts`), web 193/193, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-17 — Loop 19: Nachi verifica su diseño y lo corrige sin esperar a la oficina

**Pedido** (reunión con Sofi del 10/11): Nachi marca su diseño como verificado y Edu lo ve enseguida; si hay un error, ella reemplaza la versión sin pedir autorización. **Decisión del usuario (17/11):** la oficina igual puede observar después lo que verificó Nachi. **Diseño:** `docs/LOOP_19_NACHI_VERIFICA_DISENO.md`.

**Migración `0021_diseno_autoverificacion`:** `diseno_version` suma `autoverificada`, `motivo_cambio`, `anulada_por/at`, `motivo_anulacion`, `observado_por/at` y el estado `ANULADA`. El trigger permite PENDIENTE → APROBADO | OBSERVADO | ANULADA (una vez) y APROBADO autoverificada → OBSERVADO por la oficina (una vez); nada más cambia; sin DELETE. **API:** subir acepta `verificada` y `motivoCambio`; una pendiente **de la diseñadora** se anula al subir la corregida (la oficina mantiene el 409); `POST /api/disenos/:id/verificar` (diseñadora sobre lo suyo, o Comercial); observar sobre una autoverificada; `GET /api/mi-trabajo` trae `ultimo_diseno`. **Web:** en la tarjeta de Nachi, estado de su última versión, "Marcar como verificado", "Subir versión corregida" con "Qué cambió" y el tilde "Ya lo verifiqué"; en la OT, "Verificó la diseñadora …", Observar sobre la última autoverificada, versiones anuladas con su motivo.

**Evidencia (local):** `tests/loop19/nachi.test.ts` **6/6** (con el código anterior 6 fallas). El test del Loop 7 "Sofi sube dos veces → 409" falló con la primera versión del cambio (reemplazaba también la pendiente de la oficina, fuera del diseño): se corrigió el código, no el test. `Nachi.test.tsx` **5/5**. `scripts/prueba-nachi.cjs` (celulares de Nachi y Edu) **6/6**. Sin regresión: loop7 5/5 (texto del aviso actualizado), loop2 9/9, hoja de ruta 7/7. Totales: API 215/216 (solo `anon.test.ts`), web 198/198, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-17 — L18.E2: un trabajo impreso en el desperdicio de otro (pl mogul en isla bob)

**Pedido:** Edu (audio por WhatsApp) aclaró que el adhesivo siempre es más grande que lo impreso y que **pl mogul no está incluido en isla bob**: se imprime en el desperdicio de bob y a Juan le sale gratis. Por eso las 4 piezas sumaban 9,72 m² con un adhesivo de 9,47. **Decisión del usuario:** tilde "Sale del desperdicio" (no paga material, queda anotado). Diseño en `docs/LOOP_18_MEDIDAS_CM_DISENO.md` §8.

**Qué cambió:** `calcularCorte` acepta `deDesperdicioDe` (índice del trabajo de origen): ese trabajo no suma ni paga desperdicio; validaciones (≤ que su origen, sin cadenas, origen dentro del corte, al menos uno paga). `POST /api/consumos/corte` acepta `aprovechaDesperdicioDe` (otId del mismo corte): la OT queda con sus m² a costo 0 y la nota "aprovecha el desperdicio de OT-x". En la ventana, selector "Material: Usa material propio / Sale del desperdicio de…". En la OT, Material usado muestra la nota de cada línea. Sin migración.

**Evidencia (local):** `tests/loop18/corte.test.ts` **10/10** (las 3 nuevas fallaban antes); `ModalCorte.test.tsx` **4/4**; `scripts/prueba-corte.cjs` **5/5** con el ejemplo real de 4 trabajos (sin el tilde el sistema frena con "9,7186 m² y el material 9,4667 m²"; con el tilde 92,5 %, 0,7131 m²; Σ de las tres OTs que pagan = 9,4667 m² × 63.000). La primera corrida del recorrido falló porque la oficina no veía la nota de la línea: se agregó a Material usado. Sin regresión: loop5 7/7, tanda 6/6. Totales: API 218/219 (solo `anon.test.ts`), web 199/199, lint 0, `pnpm typecheck` 0, build 0.

---

## 2026-11-17 — Loop 13: corregir y cargar horas a mano

**Pedido:** el usuario ordenó los pendientes el 17/11 y este va primero ("si alguien se olvida de pausar, esas horas no se pueden arreglar"). Aclaró además que la calculadora de adhesivo del sistema viejo solo calculaba desperdicio: ya la cubre el Loop 18. **Diseño:** `docs/LOOP_13_CORREGIR_HORAS_DISENO.md` (decisión: Juan, Gerardo y Sofi; los operarios no se cargan horas).

**Migración `0022_correccion_horas`:** `tarea_intervalo` suma `origen` (RELOJ | MANUAL), `cargado_por`, `motivo_manual`, `cerrado_por`, `motivo_correccion` y el motivo de cierre `CORRECCION` (CHECKs: un MANUAL exige quién y motivo; un cierre de oficina, quién y motivo). Tabla `intervalo_correccion` (una por tramo, solo acorta: trigger; inmutable; RLS). Vista **`v_tramo`** con la hora de fin efectiva; `v_mano_obra` (Loop 12) pasa a leerla, y también el reloj de Mi trabajo ("Hoy" y acumulado) y Control en Vivo. **API** (`rrhh`, admin pasa): `POST /api/horas/:id/cerrar`, `POST /api/horas/:id/correccion`, `POST /api/horas/manual` (sin pisar otros tramos de la persona, candado por persona, hasta 31 días atrás, nada en el futuro, máx. 16 h, no en OTs terminadas o canceladas, auditado), `GET /api/personas/:id/horas` (25 por página, total del período) y `GET /api/horas/persona/:id/tareas`. **Web:** en Personas, botón "Horas" por persona: tramos con OT, duración, lo corregido (quién, por qué, hora anterior) y lo cargado a mano; "Cerrar con hora", "Corregir fin" y "Cargar horas a mano".

**Evidencia (local):** `tests/loop13/horas.test.ts` **6/6** (con el código anterior 6 fallas; el CA-13.5 se reforzó porque pasaba por no existir la tabla). `ModalHorasPersona.test.tsx` **3/3**. `scripts/prueba-horas.cjs` **5/5** (Gerardo cierra el reloj olvidado de Edu a las 9 y le carga 2 h: la OT queda con 3 h exactas y la tarea en pausa). Sin regresión: reloj acumulado 5/5, tanda 6/6, loop2 9/9, loop6 5/5. Totales: API 224/225 (solo `anon.test.ts`), web 202/202, lint 0, `pnpm typecheck` 0, build 0.

## 2026-11-17 — Loop 20: reportes en Excel (planilla de horas para pagar y pre-factura)

**Pedido:** segundo de la lista del 17/11 ("planilla de horas + pre-factura"). Juan llevaba un Excel con Proyecto, OT, Fecha, Cliente, Concepto (MO / Insumo / Vehículo), descripción, horas, cantidad, precio y total: el reporte lo arma solo con lo que ya carga la gente. **Diseño:** `docs/LOOP_20_REPORTES_DISENO.md` (CA-20.1 a CA-20.8). Sin migración.

**API** (`/api/reportes`): `GET /registros` y `/registros.xlsx` (`comercial`): una fila por tramo de mano de obra (lee `v_mano_obra` + `v_tramo`, con "(tanda x de y m²)", "(a mano)" y "(corregido)"), por consumo de insumo (desperdicio y corrección marcados) y por viaje (km × costo/km repartido entre las OTs no omitidas de la hoja); filtros por rango (máx. 366 días), cliente, proyecto, OT, persona (solo MO) y concepto; 25 por página con totales del filtro completo. `GET /horas` y `/horas.xlsx` (`rrhh`): por persona, tiempo, tramos, total en Gs., aviso de tramos sin tarifa y de reloj abierto, hoja "Detalle". `GET /prefactura` (`comercial`): por proyecto, o por cliente y período; costo de mano de obra, insumos y vehículos, presupuestado y registros. Excel con `exceljs@4.4.0` fijo; los textos que empiezan con `= + - @` se escapan (inyección de fórmulas). **Web:** menú "Reportes" (comercial o rrhh) con pestañas Registros, Horas para pagar y Pre-factura (margen sobre venta, precio sugerido, IVA 10 %, solicitante) y hoja A4 para imprimir o guardar PDF (`/reportes/prefactura/imprimir`, dice "documento interno, no válido como factura").

**Evidencia (local):** `tests/loop20/reportes.test.ts` **7/7**. `Reportes.test.tsx` **3/3**. `scripts/prueba-reportes.cjs` **6/6**: Juan filtra octubre y un cliente (5 registros, Gs. 144.000: 1 h de Edu 21.000 + 3 m² de lona 54.000 + 0,5 m² de desperdicio 9.000 + viaje de 30 km a 2.000 repartido en 2 OTs 60.000), descarga el Excel y la hoja "Registros" suma lo mismo; en Horas para pagar Edu 01:00 y Gs. 21.000; pre-factura del proyecto con 30 % → 205.714 + IVA = 226.285; la hoja A4 muestra cliente, RUC, solicitante y 5 registros.
Sin regresión, todos los recorridos en verde: corte 5/5, fotos 8/8, hoja-proyecto 4/4, hoja-ruta 7/7, horas 5/5, inicio 6/6, loop2 9/9, loop3 9/9, loop4 7/7, loop5 7/7, loop6 5/5, loop7 5/5, loop8 6/6, loop9 7/7, nachi 6/6, reloj acumulado 5/5, seguimiento 6/6, sin señal 5/5, sin señal con recarga (con `vite preview`), tanda 6/6, usuarios 4/4, prueba-ui 15/15 (local). Totales: API 231/232 (solo `anon.test.ts`, necesita Supabase), web 205/205, lint 0, `pnpm typecheck` 0, build 0.

**Corrección en un script viejo:** `prueba-nachi.cjs` fallaba al azar porque contaba la OT apenas aparecía el título "Para producir", antes de que llegara la lista (con 75 diseños acumulados de corridas anteriores la lista tarda más). Ahora espera `networkidle`. La app estaba bien: verde 2 veces seguidas.

**Tests contra `afull-dev` (workflow diario `tests-dev.yml`) en rojo desde el 10/11:** al auditar el CI se vio que fallaban siempre los mismos 3 tests, por tolerancias de reloj que no aguantan la latencia de GitHub (EE. UU.) a la base de São Paulo: `sin-senal` (cada `hace()` usaba la hora del momento: 8 s de más entre llamadas → ahora todas salen de un mismo `t0` y la duración del viaje se exige exacta), `tanda` (el tramo pausado dura segundos y no milisegundos: Gs. 12.016 en vez de 12.000 → se admiten hasta 30 s) e `inicio` (~40 llamadas: pasaba el tope general de 120 s → 300 s para ese test). No eran fallas de la app.

## 2026-11-17 — Loop 14: panel de Gerardo (quién está y en qué)

**Pedido:** tercero de la lista del 17/11. **Diseño:** `docs/LOOP_14_PANEL_GERARDO_DISENO.md` (decisión del 10/11: Gerardo solo asigna, no inicia el reloj de otro). Ajustes al implementar en su §8: con salida marcada **y** reloj abierto la persona sigue en "Trabajando" con el aviso "Marcó salida: ¿se olvidó de pausar?" (el caso del reloj de Edu que quedó corriendo desde el 10/11); "Trabajando" incluye a quien usa el reloj sin haber marcado entrada. Sin migración.

**API:** `GET /api/panel` (`comercial`; admin pasa): `trabajando[]` (tarea, OT, cliente, desde cuándo, `salio`), `en_pausa[]` (motivo y desde qué hora), `sin_tarea[]` (marcó entrada, sin salida ni reloj; `pendientes_hoy` = lo mismo que ve en Mi trabajo) y `sin_marcar[]` (personas activas con usuario de taller, montaje o diseño). Una sola consulta con la fecha de Asunción, sin montos ni tarifas. **Eventos en vivo nuevos** (tipo + id, sin datos): `tarea.crear`, `ot.hoja` (activar, cerrar, reabrir, WhatsApp) y `asistencia.marcar`. Antes crear una tarea o activar la hoja no avisaba, y Mi trabajo esperaba la consulta de 30 s. **Web:** menú "Panel" con tres columnas (Sin tarea en marcha, Trabajando con reloj, En pausa) y abajo "No marcaron entrada". Botón "Asignar tarea" en cada persona: busca la OT (no final), tipo, qué hacer, día (hoy por defecto), tiempo y cantidad. Si la hoja está en borrador ofrece activarla (tildado); si está cerrada, avisa y no deja.

**Evidencia (local):** `tests/loop14/panel.test.ts` **6/6** (con el código anterior, 6 fallas). `Panel.test.tsx` **3/3**. `scripts/prueba-panel.cjs` **5/5**: el montador marca entrada en el celular; Gerardo lo ve "sin tarea, no tiene nada para hoy", le asigna una tarea en una OT con la hoja en borrador (la activa en el mismo paso), el montador la ve en Mi trabajo, la inicia, y Gerardo lo ve "Trabajando" en esa OT. Sin regresión: los 23 recorridos en verde (incluye prueba-ui 15/15 local y sin señal con recarga). Totales: API 237/238 (solo `anon.test.ts`), web 208/208, lint 0, `pnpm typecheck` 0, build 0.

## 2026-11-17 — Loop 15: lo que ya terminé (historial del operario)

**Pedido:** cuarto de la lista del 17/11. **Diseño:** `docs/LOOP_15_HISTORIAL_TERMINADAS_DISENO.md` (§5 con lo decidido al implementar). Sin migración.

**API:** `GET /api/mi-trabajo/terminadas?desde&hasta&pagina` (sesión con persona vinculada; si no, 403): tareas LISTO asignadas a la persona o con un tramo suyo, por fecha del último evento LISTO en Asunción, de la más reciente a la más vieja, 25 por página. Cada fila: OT, cliente, qué hizo, cuándo, **su** tiempo (de `v_mano_obra`: con su parte de tanda y la hora corregida), cantidad y unidad. Además `horas_periodo_segundos`: todas sus horas del período, terminadas o no. Rango hasta 92 días. Sin montos. **Web:** Mi trabajo con pestañas **Pendientes** y **Terminadas**. Terminadas tiene Esta semana (por defecto, desde el lunes), Semana pasada y Este mes, el resumen "Esta semana trabajaste 32 h 15 min" y paginado.

**Evidencia (local):** `tests/loop15/terminadas.test.ts` **4/4** (con el código anterior, 4 fallas; incluye una terminada a las 23:30 de Asunción que en UTC ya es el día siguiente). `Terminadas.test.tsx` **5/5** (rangos con lunes y zona horaria; el test de volver a pedir al abrir la pestaña falla sin el arreglo). `scripts/prueba-terminadas.cjs` **4/4** en celular: Edu reanuda una tarea con 30 min, la finaliza y la ve en Terminadas con 30 min, OT, cliente y 4 m2. El recorrido encontró que la pestaña mostraba la lista vieja (caché de 30 s): ahora pide cada vez que se abre. Sin regresión: los 24 recorridos en verde. Totales: API 241/242 (solo `anon.test.ts`), web 213/213, lint 0, `pnpm typecheck` 0, build 0.

## 2026-11-17 — Loop 16: asistencia de la cuadrilla y marcación desde afuera

**Pedido:** quinto de la lista del 17/11. **Diseño:** `docs/LOOP_16_ASISTENCIA_CUADRILLA_DISENO.md` (decisión del 10/11: solo el conductor marca por los demás). Ajustes al implementar en su §8.

**Migración `0023_asistencia_cuadrilla`:** `marcacion_asistencia` suma `origen` (PROPIA | CUADRILLA | REMOTO), `marcada_por`, `hoja_ruta_id` y `motivo_remoto`. Un CHECK exige los datos de cada origen (CUADRILLA: quién y la salida; REMOTO: el motivo; PROPIA: nada). La tabla sigue inmutable y los permisos no cambian. **API:** `POST /api/asistencia/cuadrilla`: el conductor de esa salida, ese día (fecha de Asunción de la marcación), marca por los de la salida con una clave por persona. Respuesta `{ marcadas, rechazadas }`, con rechazo por persona si ya entró, si no entró (para la salida) o si no es de la salida. Candado por persona. `GET /api/asistencia/cuadrilla` trae la cuadrilla de hoy con la última marcación. **Fuera de zona:** en línea y sin motivo, 400 con `codigo: FUERA_DE_ZONA` (nuevo `codigo` en `ErrorApp`/`ErrorApi`); con motivo queda REMOTO, o CUADRILLA con el motivo. **Lo guardado sin señal no se rechaza nunca por esto** (no puede preguntar). El listado de RR.HH. trae origen, quién marcó y motivo. **Web:** en "En la calle" el conductor ve la tarjeta **Cuadrilla**: Entrada/Salida (sugiere la salida cuando la mayoría ya entró) y tildes. Quien ya marcó aparece en gris; funciona sin señal con la última lista del día. Fuera de zona, el celular pide el motivo (3 sugerencias o texto) y reenvía con las mismas claves. RR.HH. ve la columna "Quién marcó" con el motivo.

**Cambio de comportamiento aprobado:** el test viejo CA-4.4 esperaba que una marcación en línea fuera de zona se guardara sin motivo. CA-16.4 lo cambia: primero pide el motivo y después se guarda (no bloquea). Se actualizó el test con esa nota. Los scripts `loop4`, `panel`, `sin-senal` y `sin-senal-recarga` ahora buscan el botón "Marcar entrada" con nombre exacto, porque el conductor ve además "Marcar entrada de N" de la cuadrilla.

**Evidencia (local):** `tests/loop16/cuadrilla.test.ts` **7/7** (con el código anterior, 7 fallas). `Cuadrilla.test.tsx` **5/5**. `scripts/prueba-cuadrilla.cjs` **5/5**: Carlos, en su casa (Luque), marca la entrada de los 3; el celular pide el motivo y él elige "Salí desde casa con el camión". Gerardo los ve "sin tarea en marcha" en el Panel y en Asistencia ve "El conductor (Carlos)" con el motivo. El recorrido encontró que, después de marcar la entrada, la tarjeta quedaba en "Entrada de 0": ahora sugiere la salida. Sin regresión: los 25 recorridos en verde. Totales: API 248/249 (solo `anon.test.ts`), web 218/218, lint 0, `pnpm typecheck` 0, build 0.

## 2026-11-17 — Loop 17: constancia de entrega en la parada

**Pedido:** sexto y último de la lista del 17/11. **Diseño:** `docs/LOOP_17_CONSTANCIA_ENTREGA_DISENO.md` (decisión del 10/11: remisión obligatoria por defecto, desmarcable por OT). Ajustes al implementar en su §9.

**Migración `0024_constancia_entrega`:** `hoja_ruta_parada` suma `receptor_nombre`, `receptor_cargo` y `completada_por`; un trigger (`SET search_path`) impide cambiarlos una vez cargados. `orden_trabajo.lleva_remision` (por defecto sí). `archivo` suma el tipo `REMISION_PARADA` (cuelga de la parada; una subida por parada, con índice único). **API:** "Hecha" (`POST /api/campo/paradas/:id/completar`) exige receptor y, si la OT lleva remisión, la foto. Acepta la foto ya subida, todavía en el celular (`remisionEnCelular`) o con la parada cerrada sin señal, porque la foto y la acción viajan por colas distintas. Un reintento igual da 200; otro receptor, 409. `GET /api/comercial/ot/:id/entregas` y `POST /api/comercial/ot/:id/remision`. El portal suma `entrega` (fecha, nombre y cargo; nunca la foto). **Web:** en "En la calle", "Hecha" abre la **Entrega**: foto de la remisión firmada, recibió y cargo; sin señal queda guardada. La OT tiene la sección **Entrega** (foto en grande, recibió, cargo, hora, quién cargó, "sin señal", "la foto todavía no llegó") con el tilde "Esta OT no lleva remisión". El portal muestra "Entregado el … · Recibió: …".

**Cambio de comportamiento aprobado:** "Hecha" ya no cierra la parada sin quién recibió. Se actualizaron los tests viejos CA-4.6 y CA-4.7 (con nota) y los recorridos `fotos`, `loop4` y `sin-senal`, que ahora completan la entrega.

**Evidencia (local):** `tests/loop17/entrega.test.ts` **6/6** (con el código anterior, 5 fallas; "omitir no pide entrega" pasa en los dos, porque protege lo que no cambia). `Entrega.test.tsx` **4/4**. `scripts/prueba-entrega.cjs` **4/4**: Carlos intenta sin nombre ni foto y no lo deja; con la foto y "María (encargada)" queda entregada. Sofi ve en la OT la remisión, quién recibió, el cargo y quién lo cargó; el cliente lo ve en su portal, sin la foto. Sin regresión: los 26 recorridos en verde (incluye "sin señal": la entrega con la foto todavía en el celular llega bien al volver la señal). Totales: API 254/255 (solo `anon.test.ts`), web 222/222, lint 0, `pnpm typecheck` 0, build 0.

## 2026-11-17 — Loop 0 (cierre): respaldos en plan free

**Pedido:** "los respaldos (Loop 0)… todo el trabajo se mantendrá en plan free". **Diseño:** `docs/LOOP_0_RESPALDOS_DISENO.md`. **Hechos verificados hoy:** Supabase Free no tiene respaldos automáticos, permite 2 proyectos activos y pausa con poca actividad de la base en una semana. En repo público, GitHub guarda los artefactos 90 días como máximo y apaga los cron tras 60 días sin actividad.

**Migración `0025_rol_respaldo`:** el rol `afull_respaldo` (`NOLOGIN NOINHERIT BYPASSRLS`) tiene `SELECT` en todo `public` y `drizzle` (tablas y secuencias), *default privileges* para las tablas futuras y nada más. La clave se pone por entorno. `GRANT … TO postgres WITH INHERIT FALSE, SET TRUE` permite probar la lectura con `SET ROLE` sin ponerle clave. Probada en `afull-dev` dentro de una transacción deshecha: con `SET ROLE` ve las 5106 filas de `usuario` (con RLS).

**`backup-db.yml`:**
- Cron diario a las 07:23 UTC (04:23 en Asunción) contra `afull-demo`; a mano, `demo` o `dev`.
- Cifra, **descifra lo guardado y restaura eso** en Postgres 17 limpio. Verifica estructura, migraciones (≥ 25), triggers inmutables, las filas de **todas** las tablas y permisos.
- Los roles salen del catálogo (`aclexplode`), así funciona con el rol de solo lectura.
- **Levanta la API real sobre la copia** con un admin descartable y prueba login, `/api/clientes`, `/api/reportes/registros` y `/api/panel`.
- Artefacto de 90 días. Se reactiva solo por API, por la regla de 60 días (**sin verificar** que eso reinicie el contador).
- Trabajo `archivos`: baja todo el bucket con `scripts/respaldo-archivos.mjs` (bajar / verificar / subir, sin dependencias), lo compara con `archivo SUBIDO`, cifra, descifra y vuelve a verificar. Sin `DEMO_SUPABASE_SECRET_KEY`: falla si hay archivos y avisa si no hay (hoy demo tiene 0 objetos y 15 MB de base).

**`RESTAURAR.md`:** qué se respalda, dónde y por cuánto; los 4 secretos; `afull_respaldo` en el Paso 2; Paso 7 nuevo (archivos); registro de CA-0.9 con la parte automática y la de una persona (pendiente, en Postgres local en `D:` porque no hay lugar para un tercer proyecto).

**Evidencia (local):**
- `tests/loop0/respaldo.test.ts` **4/4** (sin la migración, 4 fallas).
- `tests/loop0/respaldo-archivos.test.ts` **4/4**: paginado por carpetas, sha256, faltantes, corruptos, restauración y bucket vacío.
- **Ensayo local del workflow**: se ejecutaron los pasos tal como están en el YAML (`/tmp/ensayo.py` los extrae), con la base local como origen y una base vacía como destino. Resultado:
  - archivo cifrado de 5,1 MB, descifrado y restaurado;
  - 44 → 44 tablas, 25 → 25 migraciones, 41 → 41 triggers inmutables y filas de todas las tablas;
  - la API sobre la copia respondió 200 a los 3 endpoints.
- Sin regresión: API 262/263 (solo `anon.test.ts`), web 222/222, lint 0, `pnpm typecheck` 0, build 0 y los 26 recorridos en verde.

**Falta (usuario):** cargar `DEMO_DATABASE_URL_RESPALDO` (le dejo el valor en un archivo en su compu, sin pasar por el chat) y `DEMO_SUPABASE_SECRET_KEY`; después, la primera corrida real y el simulacro de una persona.

**Primera corrida real del workflow nuevo** (a mano, origen `dev`, run `44184376014`, `bac74fd`) **en verde**. El archivo cifrado `afull-db-dev-2026-11-17.pgdump.gpg` (3,4 MB) se descifró y se restauró: `tablas: 44 -> 44 | migraciones: 25 -> 25 | triggers inmutables: 41 -> 41 | defacl: 3 -> 3`; `Filas: usuario 5106 · cliente 2791 · OT 3209 · tramos 874`; `Permisos restaurados OK`. Sobre la copia: `/api/clientes -> 200`, `/api/reportes/registros… -> 200`, `/api/panel -> 200`. Artefacto `respaldo-db-dev` subido (ID 14372569521). El trabajo `archivos` se salteó, como corresponde con `dev`. CI de `bac74fd` en verde. `0025` aplicada en `afull-dev` y `afull-demo` (fila 25 del journal, hash `96e55784…`).
**`afull_respaldo` en demo:** login habilitado con un verificador SCRAM generado en la compu del usuario (la clave no pasó por el chat ni por este espacio). La URL quedó en `D:\sistema-afull\Documentos\PEGAR_EN_GITHUB_DEMO_DATABASE_URL_RESPALDO__BORRAR_DESPUES.txt`, carpeta ignorada por git. Host del pooler `aws-1-sa-east-1`, el mismo que dev; se confirma en la primera corrida de demo.

## 2026-11-18 — Loop 21: recibos de dinero y cobranzas (como el de Prosegur)

**Pedido (Juan, por audio, vía el usuario):** "¿complicado es adelantar el recibo electrónico?… yo factura electrónica ya tengo… este es el que me envía Prosegur". Confirmado por el usuario: quiere un recibo **como el de Prosegur**. **Diseño:** `docs/LOOP_21_RECIBOS_DISENO.md`. El recibo de dinero no es comprobante timbrado (consulta DNIT). El "Recibo Electrónico de Dinero" del SIFEN (Decreto 872/2023) es otro proyecto y **no** se hace.

**Migración `0026_recibos`:**
- `empresa_dato` (una sola fila): datos de aFull para el encabezado.
- `factura_cliente`: las facturas que aFull ya emite con su sistema. Número `^\d{3}-\d{3}-\d{7}$` único. `afull_api` solo puede hacer `UPDATE` en las columnas de anulación.
- `recibo`: `REC-AAAA-NNNN` con `siguiente_valor`, clave de idempotencia, cobrador (nombre guardado al emitir). Mismo límite de `UPDATE`.
- `recibo_aplicacion`: inmutable. FK compuestas `(recibo, cliente)` y `(factura, cliente)`, así un recibo no paga facturas de otro cliente.
- Trigger `BEFORE INSERT`: bloquea la factura (`FOR UPDATE`) y rechaza si está anulada o si lo cobrado vigente pasa su monto. Otro trigger: una anulación no se deshace, y no se anula una factura con cobros vigentes.
- Vista `v_factura_saldo` (`security_invoker`): cobrado, saldo, estado (PENDIENTE / PARCIAL / PAGADA / ANULADA). Sin `DELETE` en ninguna.

**API `/api/cobranzas` (comercial; `PUT /empresa` solo admin):**
- empresa (GET / PUT);
- facturas: listar (paginado, filtros, saldo total), cargar (409 número repetido, 400 mal formado), anular (409 con cobros vigentes);
- recibos: listar, ver (con aplicaciones, cliente, empresa y `monto_letras`), emitir, anular.
- Emitir: importe = Σ aplicaciones − retenciones (> 0). Bloquea las facturas en orden fijo; 400 si pasa el saldo o la factura es de otro cliente; misma clave → 200 con el mismo recibo.
- `GET /clientes/:id/saldo`.
- Portal: `GET /api/portal/recibos` y `/:id`, solo del propio cliente (si no, 404) y sin nota ni quién emitió.

**`packages/shared`:** `montoEnLetras()` (apócope un / veintiún / treinta y un, cien / ciento, mil, millón de, mil millones) y los esquemas de cobranzas.

**Web:**
- Menú **Cobranzas** con pestañas: **Facturas a cobrar** (por defecto "Con saldo", con el saldo total, "Cobrar" y "Anular"), **Recibos** y **Datos de aFull** (solo admin).
- **Nuevo recibo**: facturas con saldo para tildar (cada una con su monto, por defecto el saldo), medio, banco, nº de operación, retenciones y comprobante, nota interna. Muestra el importe y las letras.
- Recibo A4 `/cobranzas/recibos/:id`, armado como el de Prosegur: RUC y número, Recibimos de, RUC/C.I., Guaraníes X, medio y banco, importe en número y letras, retenciones, facturas, TOTAL, lugar y fecha, Cobrador Autorizado. Marca **ANULADO** si corresponde. Botón Imprimir / Guardar PDF.
- Pestaña **Recibos** en el portal.
- Línea "Saldo por cobrar" en la ficha del cliente.

**Evidencia (local):**
- `tests/loop21/cobranzas.test.ts` **6/6**; con el código anterior, 6 fallas. Incluye dos recibos simultáneos sobre el mismo saldo → `[201, 400]`, y como `afull_api` directo: no puede pasar el monto, no mezcla clientes, `permission denied` al cambiar importes o borrar.
- `tests/loop21/letras.test.ts` **16/16**.
- `Cobranzas.test.tsx` **3/3**.
- `scripts/prueba-recibos.cjs` **7/7**: Juan carga los datos de aFull; Sofía carga la factura, la cobra con retención y ve el A4; el cliente lo ve en el portal; Sofía lo anula y la factura vuelve a Pendiente.
- PDF A4 revisado a ojo.
- Totales: API 284/285 (solo `anon.test.ts`, que pasa solo en CI), web 225/225, lint 0, `pnpm typecheck` 0, build 0.

**Después del push:** el CI de `efd751d` pasó (run `44339203792`). `0026` está aplicada en `afull-dev` y en `afull-demo` en una sola transacción, junto con la fila del journal (hash `04e0aaa6…`, `when` 1793000025000). `D:\sistema-afull` quedó en `efd751d`. **Vercel** (demo), con el usuario temporal `zz_test_loop21_vercel` (comercial, ya desactivado):
- login 200;
- `GET /api/cobranzas/facturas` 200 (0 facturas), `/recibos` 200 y `/empresa` 200 (vacío);
- `PUT /empresa` como comercial 403;
- factura con número mal formado 400;
- la pantalla `/cobranzas` carga con sus pestañas y filtros.

En demo no se cargaron facturas ni recibos de prueba.

## 2026-11-24 — Loop 22: áreas de trabajo y procesos de aFull

**Pedido:** José (aFull) mandó la lista de tareas comunes por área (imágenes) y respondió: quieren saber "cuánto dura x trabajo en el área de trabajo" y "en qué área se fueron más horas"; "Montaje" de Impresiones es el armado ("tetris") de Edu antes de imprimir; "Ploteo y lijado" es de Terminaciones y "Enduido y lijado" de Pintura; "Redes sociales" son publicaciones de aFull; medidas en cm también en Corte MDF, no en Despiece. **Diseño:** `docs/LOOP_22_AREAS_DISENO.md`.

**Migración `0027_areas_trabajo`:**
- `tipo_tarea.area` pasa a las áreas de aFull: TERMINACIONES, CARPINTERIA, PINTURA, IMPRESIONES, HERRERIA, LOGISTICA, más MONTAJE, DISENO, ADMINISTRACION y OTRO.
- Nombre único **por área**. `con_medidas` reemplaza la lista fija `TIPOS_CON_MERMA`.
- Renombres: Relevamiento, Corte adhesivo, Preparación de materiales, Fabricación (Herrería), Proceso de pintura, Carga de móvil, Retiro de materiales, Entrega de materiales.
- El proceso "Carpintería" se desactiva.
- 16 procesos nuevos, entre ellos Corte MDF (con medidas), Montaje de impresión, Redes sociales y Cobranza.

**API:**
- Procesos devuelve y acepta `con_medidas` / `conMedidas`. Un nombre repetido en otra área lleva el área en el código (`LIJADO_HERRERIA`).
- Mi trabajo trae `con_medidas`. La tanda lo exige (400 si falta).
- El costo de la OT trae `areas` (horas y costo por área), que también se guardan en el costo congelado.
- `GET /api/reportes/areas` y `areas.xlsx` (comercial): por período, OT × área, con la tanda repartida por m² como en el costo.

**Web:**
- Procesos agrupados por área, con el interruptor "Con medidas en cm / Sin medidas" y la casilla al crear.
- Medidas (cm) y Tanda se guían por la marca del proceso.
- Costo real de la OT con una línea por área.
- Reportes → **Horas por área**: columnas por área, totales, el área con más horas resaltada y Excel.

**Cambios de comportamiento aprobados:**
- `tests/loop3/procesos-api.test.ts`: el área `TALLER` ya no existe y pasa a `CARPINTERIA`.
- `ModalTanda.test.tsx`: los datos de prueba llevan `con_medidas`.

**Sin código:** el trabajo interno (Redes sociales, Limpieza, Carga de móvil) va en un cliente "aFull (interno)" con una OT por mes. Supuesto a confirmar: "Montaje e instalación" como área propia de la cuadrilla.

**Evidencia (local):**
- `tests/loop22/areas.test.ts` **5/5**; con el código anterior, 5 fallas.
- `Areas.test.tsx` **3/3**.
- `scripts/prueba-areas.cjs` **6/6**.
- Totales: API 289/290 (solo `anon.test.ts`, que pasa solo en CI), web 228/228, lint 0, `pnpm typecheck` 0, build 0.

**Después del push (25/11):**
- CI de `a53e403` en verde.
- `0027` aplicada en `afull-dev` y en `afull-demo`, en una transacción con la fila del journal (hash `1ac294c0…`, `when` 1793000026000).
- **Demo estaba pausada** (Supabase Free, una semana sin actividad): se reactivó con el conector antes de migrar.
- **Vercel**, con el usuario temporal `zz_test_loop22_vercel` (ya desactivado):
  - login 200;
  - `GET /api/procesos` 200, con los procesos activos de las 10 áreas (Terminaciones 10, Carpintería 4, Pintura 4…) y `CORTE_MDF` con medidas;
  - `GET /api/reportes/areas` (1–25/11) 200, 6 OT;
  - área vieja `TALLER` 400.
- `D:\sistema-afull` quedó en `a53e403`.

## 2026-11-25 — Respaldo de demo funcionando (Loop 0, secretos cargados)

El usuario cargó `DEMO_DATABASE_URL_RESPALDO` y `DEMO_SUPABASE_SECRET_KEY` en GitHub. Corrida manual `45620681827` (origen demo): **verde**.
- **base:** `tablas: 49 -> 49 | migraciones: 27 -> 27 | triggers inmutables: 43 -> 43 | defacl: 3 -> 3`. Sobre la copia restaurada, `/api/clientes`, `/api/reportes/registros` y `/api/panel` → 200 ("La API responde sobre la copia restaurada"). El host del pooler anotado en la URL (`aws-1-sa-east-1`) quedó confirmado.
- **archivos:** "Archivos en el respaldo: 0. Faltan: 0. Con sha256 distinto: 0". Demo no tiene archivos: `archivo` 0 filas, `storage.objects` 0. La clave secreta autentica bien.
- Desde ahora el respaldo diario (07:23 UTC) también mantiene activa la base de demo, que el 25/11 estaba pausada por inactividad.
- Falta: la restauración hecha a mano una vez por una persona (`RESTAURAR.md`).

## 2026-11-26 — Loop 22, ajuste: el montaje va en Logística (`0028`)

**Pedido (José, 25/11):** "Entra en logística, pero también se tiene en cuenta que a veces la gente de producción ayuda en montaje y/o instalación… todos los de producción deberían tener ese apartado de logística (montaje/desmontaje/instalación)".

**Cambio:** se saca el área Montaje e instalación. Montaje / colocación y Reparación pasan a Logística, y se suman Desmontaje e Instalación. Producción ya tiene ese apartado: la capacidad `taller` incluye En la calle, y cualquier persona puede recibir una tarea de montaje o ir en una salida. No cambia ningún permiso.

**Evidencia (local):**
- `tests/loop22/montaje-logistica.test.ts` (CA-22.8) 1/1; con el código anterior, 1 falla.
- Loop 22 completo y procesos del Loop 3: 8/8.
- Totales: API 290/291 (solo `anon.test.ts`, que pasa solo en CI), web 228/228, lint 0, `pnpm typecheck` 0, build 0, recorridos 29/29.
