# Traspaso del proyecto aFull

Última actualización: 2 de noviembre de 2026 — 12:13 (America/Asuncion).
Archivo canónico: `D:\sistema-afull\TRASPASO.md`. Se actualiza al cerrar cada tarea o commit.

---

## 0. LEER PRIMERO: qué está verificado y qué no

**Estado de verificación actual:** El monorepo fue inicializado en `D:\sistema-afull` con lint y tipos en verde. Las migraciones `0001` a `0004` fueron aplicadas con éxito en Supabase `afull-dev` (São Paulo) mediante Drizzle. Se asignó la contraseña al rol `afull_api`, las 4 consultas de comprobación dieron los resultados exactos esperados y `pnpm test` pasa **36 de 36 tests en verde** (11 archivos: 20 de Loop 0 y 16 de Loop 1) contra Supabase `dev` y contra PostgreSQL 17 en GitHub Actions CI.
- **Despliegue en Vercel (`gru1` São Paulo, Node 22) — CA-0.1 cumplido en caliente (cold start excede el objetivo; pendiente de decisión del usuario) y CA-0.10 por HTTP verificado:**
  - **Cuelgue anterior de 20 s en `POST /api/auth/login` — Estado: RESUELTO en commit `a588fbb`, CAUSA EXACTA SIN AISLAR** (se aplicaron juntos el puente `req.body → req.rawBody` en `apps/api/src/vercel.ts` y `api.bodyParser: false` en `api/index.js`).
  - **Sondas diagnósticas reales en `gru1` (sobre commit `a588fbb`):** Probe 1 (`POST /api/auth/login` con `{}`) → `400` en **600 ms** (1.ª llamada post-deploy, sin tocar Argon2 ni base de datos) y **460 ms**; Probe 2 (usuario inexistente ejecutando `verificarDummy()` con `@node-rs/argon2` + base de datos, ya con la instancia caliente) → `401` en **295 ms**.
  - **Las 4 mediciones en `gru1` contra Supabase `afull-dev` (pooler 6543):**
    1. **`@node-rs/argon2` en producción:** carga y verifica hashes Argon2id (19 MiB, 2 iteraciones, 1 hilo) sin errores en el runtime Node 22 de Vercel (`200` en login válido y `401` en usuario inexistente con hash dummy). El diseño de autenticación queda con Argon2id (no hace falta `scrypt`).
    2. **Latencia de `POST /api/auth/login` (en frío y en caliente):**
       - **Cold start real del login con Argon2 + DB (medido sobre el deploy de `703c0ec` tras >23 min sin tráfico):** `HTTP 200` en **1253 ms** (`1,25 s`, **excede el objetivo de 100–300 ms**; pendiente de decisión del usuario si se acepta como excepción documentada en Sección 3), seguido de **318 ms** en la 2.ª petición inmediata.
       - **Ráfaga en caliente (9 muestras cálidas seguidas sobre `a588fbb`):** `147 ms`, `161 ms`, `150 ms`, `150 ms`, `152 ms`, `153 ms`, `163 ms`, `150 ms`, `155 ms` (**mín: 147 ms | mediana: 152 ms | promedio: 153 ms | máx: 163 ms**, total con red incluida, dentro del rango objetivo de **100–300 ms** de **CA-0.1** en caliente).
    3. **20 peticiones simultáneas a `GET /api/clientes` con cookie válida (`CA-0.10` por HTTP sobre `a588fbb`):** **20/20 responden `200 OK`** sin colgarse en **754 ms** de tiempo total de pared (`mín: 228 ms | mediana: 704 ms | máx: 752 ms`). **Observación (sin causa confirmada):** dado que una petición cálida individual tarda ~150–200 ms, la distribución (`228 ms` a `752 ms`, mediana `704 ms`) sugiere que las 20 simultáneas se atienden casi en serie (cola en una sola instancia/hilo de función o en el pooler), no 20 ejecuciones en paralelo; tenerlo presente cuando una oficina real consulte a la vez.
    4. **CSRF y flags de cookie:** `POST /api/auth/login` con `Origin` inválido devuelve `403` en **277 ms** (y **200 ms** en sonda previa); `Set-Cookie` en login válido incluye `HttpOnly`, `Secure` y `SameSite=Lax`.
  - **Higiene en `afull-dev`:** el script de cold start limpió en su `finally` **únicamente** a `zz_test_vercel_probe` (`activo = false`, `0` sesiones de ese usuario).
- **Qué queda para cerrar Loop 0 al 100%:**
  1. Decisión del usuario sobre el cold start de `1253 ms` en `CA-0.1` (si se acepta como excepción documentada en Sección 3).
  2. Cargar los 4 secrets `DEV_*` en GitHub Actions y correr `tests-dev.yml`.
  3. Crear y verificar `.github/workflows/backup-db.yml`, realizar el **restore manual completo hecho por una persona** y documentarlo en `RESTAURAR.md` (**CA-0.9**). *(Nota: `backup-storage` se pospone al Loop 3, cuando la app empiece a subir fotos a Storage).*
- **Loop 1A cerrado (CA-1.1 a CA-1.10 verificados):** 16/16 tests de `tests/loop1` en verde contra Supabase `dev` y en CI.
  - **Entrega 1 (commit `b9d0d58`):** Clientes (listado con `q`, `activo`, `desde`/`hasta`, detalle completo, edición con `updatedAt` → `409`, desactivar/reactivar advirtiendo OTs abiertas), sucursales (`sucursales.service.ts`), contactos con cambio atómico de contacto principal y marcas (`subrecursos.service.ts`), benchmark CA-1.2 ejecutando `queryListarClientes` real (`busqueda.test.ts`), y `clientes.test.ts` cubriendo CA-1.1 (paginación 25), CA-1.7 (bloqueo `DELETE` real con `42501`) y CA-1.10 en `/api/clientes`.
  - **Entrega 2 (commit `ed0621b`):** Detalle de OT (`GET /api/comercial/ot/:id` devolviendo la OT más el historial `ot_evento` ordenado por `created_at ASC, id ASC` coincidente con `estado`, CA-1.8), filtro por `clienteId` en `listarOTs`, edición de OT (`PATCH /api/comercial/ot/:id` con `SELECT ... FOR UPDATE`, exigiendo `updatedAt` → `409`, validando sucursal activa del cliente o `null`, auditando `ot.editar` en la misma transacción y bloqueando con `400` mediante `esEstadoFinal` si está en `TERMINADO` o `CANCELADO`), recorrido dinámico global de `app.routes` (CA-1.10 reforzado: todas las rutas de la app exigen `401` sin sesión salvo `POST /api/auth/login`, y `/api/comercial/ot` exige `403` sin capacidad `comercial`/`admin`) y CA-0.10 (20 requests HTTP simultáneas en `ot-api.test.ts`).

| Pieza | Estado |
| :--- | :--- |
| Documento maestro v3.x | Copiado en `D:\sistema-afull\ARQUITECTURA_V3.md` (con aviso de que `TRASPASO.md` gana en caso de diferencia); `CLAUDE.md` sincronizado. |
| Repositorio y monorepo | Inicializado en `D:\sistema-afull`. Remoto: `https://github.com/Morochief/sistema-afull-v2.git` (rama `main`). `lint` y `typecheck` en verde. |
| Migraciones `0001` a `0004` (SQL) | **Aplicadas con éxito en Supabase `afull-dev`** con Drizzle journal. |
| Auth, sesiones, auditoría y seed admin | **Verificado contra Supabase `dev` y en Vercel (`gru1`)**. CA-0.1 cumplido en caliente (`147–163 ms`, mediana `152 ms` sobre `a588fbb`), pero en frío dio `1253 ms` sobre `703c0ec` (**excede 100–300 ms; pendiente decisión del usuario**); CA-0.10 por HTTP (20/20 en 754 ms) verificado; pendientes secrets de `tests-dev.yml` y CA-0.9 (`backup-db.yml` + restore manual + `RESTAURAR.md`). |
| Tests Loop 0 (Vitest) | **20/20 en verde contra Supabase `dev` y CI** (RLS, anon key `42501`, auth, seed idempotente con limpieza de `zz_test_%`, inmutabilidad, concurrencia por pooler + `sinPipelining` y auditoría estática de parámetros). |
| Tests Loop 1A (Vitest) | **16/16 en verde contra Supabase `dev` y CI** (`busqueda.test.ts`, `clientes.test.ts`, `ot.test.ts`, `ot-api.test.ts`). **Loop 1A cerrado (CA-1.1 a CA-1.10)**. |
| Workflows de GitHub Actions | `ci.yml` (en verde en cada push), `tests-dev.yml` (**escrito, sin ejecutar**; requiere secrets `DEV_*`), `backup-db.yml` (**pendiente de crear**). |
| `backup-storage.mjs` | Escrito de memoria, sin probar; **pospuesto al Loop 3** (hoy no se usa Storage). |
| Proyectos Supabase `dev` y `prod` | `afull-dev` activo y verificado en São Paulo (`oxthxdnyxabupeebzwmn`); `prod` pendiente. |
| Proyecto Vercel | **Desplegado en `gru1` (Node 22)**: `@node-rs/argon2` operativo, login cálido `147–163 ms` (mediana `152 ms` en commit `a588fbb`), login cold start `1253 ms` (en commit `703c0ec`, excede objetivo de 100–300 ms), 20 GET concurrentes 20/20 `200 OK` en `754 ms` (atendidas casi en serie), CSRF `403` y cookies `HttpOnly; Secure; SameSite=Lax`. |

---

## 1. Qué es el proyecto

Sistema de gestión para una empresa de cartelería y rotulación (Paraguay). Cubre: clientes y órdenes de trabajo (OT), pre-prensa de diseño, taller, montaje en calle con app offline, flota, control en vivo, RR.HH., stock, costeo real y portal de clientes.

La empresa es chica. **Restricción central: no pagar por ahora.** Primera inversión futura prevista: Supabase Pro (USD 25/mes) por backups diarios y ausencia de pausa por inactividad.

El proyecto anterior se rompió por acumulación de parches. Por eso se rediseñó desde cero. **No se tira:** sirve como fuente de datos reales (clientes, sucursales, insumos, tarifas) para importar al sistema nuevo mediante un script con modo de prueba que no escribe nada.

---

## 2. Principios de ingeniería (no negociables)

1. **Eventos inmutables, no contadores.** Horas, estados y consumos son filas históricas. Saldos y costos se calculan sumando eventos.
2. **Restricciones duras en PostgreSQL**, no solo en código: un cronómetro abierto por persona, un viaje abierto por vehículo, idempotencia de eventos de campo, tarifas sin solapamiento.
3. **Nada se borra, todo se desactiva.** El rol de la API no tiene `DELETE` sobre tablas de negocio.
4. **Modularidad atómica.** Ningún archivo supera 250 líneas (lo hace cumplir ESLint `max-lines` y el CI). Un módulo por dominio con `routes.ts`, `service.ts` y tests. Un archivo por modal en el frontend, un hook `useX` por vista.
5. **Toda tabla administrativa** tiene paginación por servidor de 25 filas fijas, buscador con debounce de 300 ms, filtro de estado y rango de fechas.
6. **Guaraníes sin decimales** (`BIGINT`) en totales; tarifas, costos unitarios y costo por km en `NUMERIC(15,4)`. Redondeo una sola vez, al generar el snapshot de cierre de la OT.
7. **Trabajo por loops.** No se avanza al siguiente loop sin cerrar el actual con sus tests y criterios de aceptación.

---

## 3. Decisiones tomadas (no reabrir sin un problema real)

### Despliegue y costos
- **Stack gratuito:** Vercel (runtime **Node**, no Edge) + Supabase Free (región São Paulo) + GitHub Actions.
- **Frontend y API bajo el mismo sitio** (mismo proyecto de Vercel o subdominios del mismo dominio), porque la cookie es `SameSite=Lax` y no viaja entre sitios distintos.
- **Fly.io no es gratis en 2026** (sin plan gratuito, solo créditos de prueba). Queda como destino de migración futura si la API necesita un proceso siempre vivo.
- **Pendiente de verificar:** el plan Vercel Hobby es para uso no comercial según lo conocido. Revisar los términos actuales antes de operar con personal real. Alternativa: Cloudflare Workers, pero su límite de CPU probablemente no alcanza para Argon2.
- Dos entornos desde el día 1: proyectos Supabase `dev` y `prod`.

### Tiempo real
- **Supabase Broadcast**, no `postgres_changes` (este último respeta RLS y requiere Supabase Auth, que no se usa).
- La API publica un mensaje mínimo (tipo de evento e ID, sin datos sensibles) y el navegador vuelve a pedir el dato por la API con su sesión.
- Aislado tras una interfaz portable: `publicarLive()` / `suscribirseLive()`.
- El cronómetro corre en el navegador; solo se emiten cambios de estado (límite gratuito: 2 M mensajes/mes).

### Base de datos y seguridad
- **Dos roles:** las migraciones corren como `postgres`; la API se conecta como `afull_api` (sin ser dueño de nada, sin DDL, `NOBYPASSRLS`). Así la inmutabilidad de la auditoría es real a nivel motor.
- Conexión de la API por el **pooler de transacción (puerto 6543)** con `prepare: false`, `fetch_types: false` y el envoltorio `sinPipelining(sql)` en `apps/api/src/db/client.ts`. Migraciones y backups por conexión directa o pooler en modo sesión (puerto 5432 del pooler).
- **Hallazgo del pooler de transacciones (Supavisor, puerto 6543) — Estado: MITIGADO, CAUSA SIN CONFIRMAR:**
  - *Síntoma:* Al lanzar 20 requests HTTP simultáneas (`CA-0.10`) contra la API usando el pooler 6543, 14 completaban y 6 quedaban colgadas hasta el timeout de 30 s.
  - *Hipótesis (basada en lectura de `postgres@3.4.9`, sin traza aislada de protocolo en Supavisor):* Con `prepare: false`, las consultas con `>= 1` parámetro activan `describeFirst = true`, haciendo que `execute(q)` devuelva `false` y mueva la conexión a la cola `full` (una sola consulta en vuelo por ciclo `ReadyForQuery`). Las consultas con `0` parámetros dejan `describeFirst = false`, por lo que `execute(q)` devuelve `true` y mueve la conexión a la cola `busy`, donde una consulta siguiente puede encadenarse en el mismo socket antes de recibir `ReadyForQuery`. Lo que está demostrado empíricamente es que con las mitigaciones el síntoma desaparece.
  - *Mitigación aplicada y cautelas:*
    1. **Envoltorio `sinPipelining` en `apps/api/src/db/client.ts` y versión fija `postgres@3.4.9`:** asigna `options.onexecute = () => false` en toda `Query` de plantilla (sin alterar el `onexecute` interno que `sql.begin` usa en `BEGIN`), forzando a que `execute(q)` devuelva siempre `false` incluso en consultas de 0 parámetros. **Cautela:** `options.onexecute` es un detalle interno de `postgres-js`, no API pública; por ello `postgres` está fijado en `"3.4.9"` (sin `^`) en `package.json`, y el test de 40 consultas mixtas en `tests/loop0/secuencia.test.ts` detecta cualquier regresión si se decide actualizar la librería.
    2. **Regla de consultas parametrizadas + test estático:** toda consulta ejecutada con `await sql/tx/runner/adminSql` en `apps/api/src` interpola al menos un parámetro `${...}` (incluyendo `WHERE ${true}` en `dondeClientes`/`dondeOTs` y `siguiente_valor(${'CLI'})`). **Cautela:** el test estático por expresión regular en `tests/loop0/secuencia.test.ts` es una red útil pero tiene falsos negativos (no ve `sql.unsafe` ni fragmentos reutilizados), por lo que no sustituye a `sinPipelining`.
    3. **Ejecución en serie de archivos de test (`fileParallelism: false` en `vitest.config.ts`):** no "optimizar" activando paralelismo entre archivos. Todos los archivos de test atacan la misma base `dev`, comparten secuencias globales (como `OT-2026` en `ot.test.ts` CA-1.5) y comparten el cupo de conexiones simultáneas del pooler de Supabase Free Tier.
  - *Pendiente de verificar:* confirmar este comportamiento bajo funciones serverless en Vercel y verificar si la corrida diaria de `tests-dev.yml` basta como actividad para evitar que Supabase pause `dev` por inactividad.
- **RLS activado en todas las tablas**, `REVOKE ALL` a `anon` y `authenticated`, y `REVOKE EXECUTE` sobre funciones (cierra el RPC de PostgREST).
- **Regla para toda tabla nueva** (tres pasos, al final de cada migración):
  ```sql
  ALTER TABLE nueva ENABLE ROW LEVEL SECURITY;
  GRANT <solo lo necesario> ON nueva TO afull_api;   -- nunca DELETE en tablas de negocio
  CREATE POLICY api_acceso ON nueva FOR ALL TO afull_api USING (true) WITH CHECK (true);
  ```
  Tablas append-only (auditoría, eventos): políticas separadas de `SELECT` e `INSERT`, y trigger que bloquea `UPDATE`, `DELETE` y `TRUNCATE`.
- Códigos secuenciales (`OT-2026-0001`, `CLI-0001`) con la función atómica `siguiente_valor()`, **dentro de la misma transacción** que el insert. Nunca `MAX()+1`.
- Capacidades atómicas (`admin`, `comercial`, `diseno`, `taller`, `montaje`, `ver_costos`, `rrhh`) con `CHECK` en la base. Los "roles" son solo plantillas de interfaz. `admin` pasa siempre.

### Autenticación
- Argon2id con `@node-rs/argon2` (OWASP: 19 MiB, 2 iteraciones, 1 hilo; apuntar a 100–300 ms en Vercel). Alternativa si el binario nativo no carga: `scrypt` de `node:crypto`.
- Token de 32 bytes aleatorios en la cookie `afull_session` (`HttpOnly`, `Secure`, `SameSite=Lax`). En la base solo se guarda su SHA-256.
- Sesión validada en cada request contra `sesion` y `usuario.activo` (revocación instantánea). Expiración deslizante de 30 días; `last_active_at` se refresca como máximo cada 5 minutos.
- CSRF: `SameSite=Lax` más verificación del header `Origin` en toda petición que modifica datos.
- Fuerza bruta: tabla `intento_login` (5 fallos por usuario o 20 por IP en 15 minutos). Mensaje de error idéntico para usuario inexistente, inactivo o clave mala.
- La auditoría de mutaciones va **dentro de la misma transacción**. La de login/logout va fuera, con `try/catch`, para que una falla de auditoría no deje a todos sin entrar (decisión a documentar en el registro de cambios).
- `metadata` de auditoría nunca lleva contraseñas ni tokens (`limpiarMetadata` los filtra, pero no depender de eso).

### Dominio
- Una OT tiene **una sola sucursal**. La sucursal debe pertenecer al cliente de la OT (FK compuesta).
- `TERMINADO` y `CANCELADO` son **estados finales**. Cancelar exige motivo.
- Máquina de estados de la OT en `packages/shared/machines/ot.ts`:
  `PENDIENTE → EN_DISENO | EN_TALLER | CANCELADO`; `EN_DISENO → EN_TALLER | CANCELADO`; `EN_TALLER → EN_MONTAJE | TERMINADO | CANCELADO`; `EN_MONTAJE → TERMINADO | CANCELADO`.
- Cada transición usa `SELECT ... FOR UPDATE` y exige el campo `desde` (el estado que el usuario veía): si cambió, responde `409`.
- `ot_evento` es el historial inmutable; `orden_trabajo.estado` es solo el último valor.
- Auditoría de flota: se compara el odómetro contra la **distancia de ruta de las paradas planificadas** (`hoja_ruta_parada`), no contra Haversine entre inicio y fin. La línea recta subestima las calles (factor ~1,2–1,5), así que **la alerta es informativa, nunca bloqueante**, y se permiten paradas extra con motivo. Mejor aún: calcular la distancia por ruta con OSRM o similar al armar la hoja de ruta (a evaluar).
- La geocerca de asistencia (100 m) es **disuasiva**, no seguridad dura: el GPS del navegador es falsificable.

---

## 4. Estructura del repositorio

- **Repositorio Remoto Oficial:** `https://github.com/Morochief/sistema-afull-v2.git`
- **Rama principal:** `main`

```
sistema-afull/
├── packages/shared/src/{schemas,formulas,machines,types}/
├── apps/api/src/
│   ├── index.ts                  # monta routers, < 60 líneas, exporta `app` para tests
│   ├── db/client.ts              # postgres-js / Drizzle, prepare: false
│   ├── lib/{errores,paginacion}.ts
│   └── modules/{auth,auditoria,clientes,comercial,preprensa,taller,montaje,flota,rrhh,stock,live,costeo}/
├── apps/web/src/{routes,hooks,lib,components/{ui,forms,modals}}/
├── migrations/                   # 0001..000N, aplicadas con drizzle-kit (con registro)
├── tests/{loop0,loop1,...}/
├── scripts/backup-storage.mjs
├── .github/workflows/{ci,tests-dev,backup-db,backup-storage}.yml
├── TRASPASO.md
└── RESTAURAR.md                  # procedimiento de restore (sin secretos)
```

Stack: pnpm workspaces, React 19 + Vite, TanStack Query v5 y Router, Tailwind + shadcn/ui (paleta `#090a0f`, `#111318`, `#ea580c`, radios 4–6 px), Dexie, Hono, Drizzle, Zod, Vitest, PostgreSQL 17.

---

## 5. Migraciones

Aplicarlas con `drizzle-kit migrate` (conexión admin), **no** pegándolas a mano en el editor SQL, para que `dev` y `prod` tengan el mismo historial. Crear con `drizzle-kit generate --custom --name=...`. Siempre en `dev` primero.

| N.º | Contenido |
| :--- | :--- |
| `0001_fundacion` | `persona`, `usuario`, `sesion`, `permiso_capacidad` (con `CHECK`), `secuencia_contador` + `siguiente_valor()`, `evento_auditoria` (`ON DELETE RESTRICT`, triggers contra `UPDATE`/`DELETE`/`TRUNCATE`), trigger `updated_at`, RLS + `REVOKE` a `anon`/`authenticated`, `REVOKE EXECUTE` de funciones |
| `0002_rol_api` | Rol `afull_api` (`NOINHERIT`, `NOBYPASSRLS`, `statement_timeout 15s`), `GRANT` mínimos, políticas. La contraseña se asigna aparte con `ALTER ROLE` y **no va en el repo** (`openssl rand -hex 32`) |
| `0003_intento_login` | Tabla de intentos de login |
| `0004_clientes_ot` | `pg_trgm` (esquema `extensions`), `cliente`, `cliente_contacto`, `cliente_marca`, `sucursal` (GPS dentro de Paraguay), `orden_trabajo` (FK compuesta sucursal-cliente), `ot_evento` (inmutable) |

Notas de `0004`: `cliente` no lleva `token_portal` todavía (es del Loop 8; guardarlo **hasheado**, como las sesiones). `orden_trabajo` no lleva `presupuesto_id` ni `pedido_id` todavía; se agregan con `ALTER TABLE` cuando existan esas tablas. Verificar que `pg_trgm` en el esquema `extensions` funcione en el proyecto.

---

## 6. Estado por loop

Orden: 0 Base → 1 Clientes + OT → 2 Tareas, cronómetro y Control en Vivo → 3 Campo offline + flota → 4 Stock → 5 Costeo → 6 Pre-prensa → 7 RR.HH. → 8 Portal B2B.
(Costeo va temprano porque es lo que justifica el sistema.)

### Loop 0: Base (20/20 tests + CA-0.1 en caliente y CA-0.10 por HTTP en Vercel verificados; pendientes decisión sobre cold start de CA-0.1, `tests-dev.yml` y CA-0.9)

Tareas: 1 decidir API (Vercel Node, cerrada) · 2 repo + reglas de lint · 3 dos proyectos Supabase · 4 conexión y migraciones · 5 migraciones 0001–0003 · 6 auth · 7 capacidades + seed del primer admin · 8 auditoría · 9 CI · 10 backups · 11 deploy y prueba de humo.

Criterios de aceptación:
- **CA-0.1** Login con Argon2id, cookie segura, fila en `sesion`; **medido en el entorno desplegado (`gru1`, Node 22)**: ráfaga de 9 muestras cálidas entre `147 ms` y `163 ms` (mediana `152 ms`, promedio `153 ms`, total con red incluida sobre `a588fbb`, dentro del objetivo de `100–300 ms`), cookie con `HttpOnly; Secure; SameSite=Lax`; el arranque en frío real del login con Argon2 + DB dio `1253 ms` (sobre `703c0ec` tras >23 min sin tráfico), seguido de `318 ms` en la 2.ª llamada inmediata. (**Cumplido en caliente; el arranque en frío de `1253 ms` excede el objetivo de `100–300 ms` — pendiente de decisión del usuario si se acepta como excepción documentada en Sección 3**)
- **CA-0.2** Desactivar un usuario invalida su cookie en la siguiente request (401). (**Verificado**)
- **CA-0.4** Sin la capacidad: 403. (**Verificado**)
- **CA-0.5** Toda acción sensible genera `evento_auditoria`; si la mutación falla, la auditoría se revierte con ella. (**Verificado**)
- **CA-0.6** CI: `tsc --noEmit`, lint y Vitest en verde. (**Verificado en GitHub Actions**)
- **CA-0.7** Con la `anon key`, ninguna tabla responde ni acepta escrituras (test recorre `information_schema` y verifica error `42501` en PostgREST); las funciones no se invocan por RPC. (**Verificado**)
- **CA-0.8** `UPDATE`/`DELETE`/`TRUNCATE` sobre `evento_auditoria` fallan, y `afull_api` no puede hacer `DROP`/`DISABLE TRIGGER`. (**Verificado**)
- **CA-0.9** Backup diario con restore verificado automáticamente **más un restore manual completo hecho una vez por una persona**. Sin ese restore manual, no está cumplido. (Pendiente)
- **CA-0.10** 20 requests simultáneas por el pooler sin errores de prepared statements ni de conexiones. (**Verificado a nivel DB, en `ot-api.test.ts` y por HTTP en Vercel `gru1`: 20/20 `GET /api/clientes` responden `200 OK` en `754 ms` de pared; observación: la distribución `228–752 ms`, mediana `704 ms`, sugiere atención casi en serie**)
- **CA-0.11** El CI falla si algún archivo supera 250 líneas. (**Verificado**)
- **CA-0.3 (cronómetros concurrentes) se movió al Loop 2**: necesita tablas que aún no existen.

Tests: `tests/loop0/{anon,auditoria,usuarios,secuencia,auth,auditoria.service,seed}.test.ts`. El test de la `anon key` no corre en CI (necesita la API REST de Supabase); correrá a diario contra `dev` en `tests-dev.yml` (pendiente). Los tests tienen un guard `TEST_ENV=dev` y **nunca se corren contra `prod`**.

### Loop 1: Clientes y OT (Loop 1A cerrado; Loop 1B pendiente)

Partido en dos. **1A** (base y API, **CERRADO**): migración `0004`, esquemas y máquina de estados en `shared` (`puedeTransicionar`, `esEstadoFinal`), infraestructura común (`ErrorApp`, `traducirErrorPg`, paginación), módulos `clientes` y `comercial`, tests (`busqueda.test.ts`, `clientes.test.ts`, `ot.test.ts`, `ot-api.test.ts`). **1B** (frontend, **pendiente**): shell (Vite, Router, login, layout), componente genérico `TablaAdmin`, hooks `useClientes`/`useOT`, modales, deploy a `dev`.

Criterios 1A (**todos verificados**): CA-1.1 paginación fija de 25 · CA-1.2 búsqueda < 100 ms **en la base** con 5000 registros (nota: con 5000 filas el planner puede optar por Seq Scan en ~12 ms; validar índice GIN trigram con ≥ 50.000 filas o `enable_seqscan = off` si se requiere forzar Bitmap Index Scan) · CA-1.3 GPS en Paraguay (Zod y base) · CA-1.4 máquina de estados aplicada (400 salto inválido y bloqueo de edición en estados finales, 409 dato viejo) · CA-1.5 código de OT sin duplicados ni huecos bajo concurrencia · CA-1.6 sucursal del cliente de la OT · CA-1.7 sin borrado físico (`42501` en `DELETE`) · CA-1.8 `ot_evento` en la misma transacción y coherente con el estado · CA-1.9 test de `anon key` sigue en verde (`42501`) · CA-1.10 todos los endpoints exigen `comercial` o `admin` (verificado recorriendo `app.routes`). Pendiente 1B: CA-1.11 tabla con debounce 300 ms, filtros y paginador, archivos ≤ 250 líneas.

Pendiente del 1B: `TablaAdmin` (props, estados de carga, error y vacío) y `useClientes`. Son las piezas que se repiten en todos los módulos siguientes.

Limitaciones conocidas: la búsqueda trigram no ignora acentos ("Cañete" ≠ "Canete"); si molesta, agregar `unaccent` en un loop posterior. Los datos `zz_test_*` de OT no se pueden limpiar (historial inmutable), así que `dev` acumula residuo esperable.

---

## 7. Verificaciones pendientes (cosas que se dieron por probables, no comprobadas)

- [ ] Login y hash en Vercel: tiempo de 100–300 ms, **incluyendo cold start**; que `@node-rs/argon2` cargue en el runtime Node de Vercel (CA-0.1): **Cumplido en caliente en `gru1` (Node 22, commit `a588fbb`)** (`@node-rs/argon2` carga y verifica; 9 muestras cálidas `147–163 ms`, mediana `152 ms` con red incluida). **En frío no cumple el objetivo de 100–300 ms:** el cold start real del login con Argon2 + DB (medido sobre el deploy de `703c0ec` tras >23 min sin tráfico) dio **`1253 ms`** (`HTTP 200`, seguido de `318 ms` en la 2.ª llamada inmediata). Pendiente de decisión del usuario si se acepta `1253 ms` en frío como excepción documentada en Sección 3.
- [x] Comportamiento del pooler de transacciones (puerto 6543 con `sinPipelining` y `fetch_types: false`) desde funciones serverless de Vercel bajo peticiones concurrentes: **VERIFICADO en `gru1` (commit `a588fbb`)**. 20 requests simultáneas a `GET /api/clientes` con cookie válida devuelven **20/20 `200 OK`** en `754 ms` de pared (`min: 228 ms | mediana: 704 ms | max: 752 ms`). *Observación (sin causa confirmada):* el escalonamiento `228–752 ms` frente a ~150–200 ms de una petición cálida sugiere atención casi en serie (cola en una sola instancia/hilo o en el pooler).
- [ ] Términos del plan Vercel Hobby para uso comercial antes de operar con personal real.
- [x] Que Supabase permita `CREATE ROLE afull_api` y cómo se escribe el usuario en el pooler: **VERIFICADO**. Supabase permite `CREATE ROLE` sin error y el usuario en el transaction pooler 6543 es `afull_api.<ref-proyecto>`.
- [x] Que el rol funcione con RLS como se espera (políticas por rol): **VERIFICADO**. 16 tests de Loop 0 en verde contra Supabase `dev`.
- [ ] Si `pg_dump` conecta desde runners de GitHub (IPv4): usar pooler en modo sesión; confirmar.
- [ ] Rutas y respuestas de la API de Storage en `backup-storage.mjs` (**pospuesto al Loop 3**, cuando la app suba archivos a Storage).
- [ ] Cuota de almacenamiento de artifacts de GitHub en cuenta gratuita.
- [ ] Que el proyecto Supabase no se pause en un feriado largo (el backup diario debería bastar; confirmar o agregar un `SELECT 1` programado).
- [ ] Limitar el esquema expuesto de la API de datos de Supabase (la app no usa PostgREST): tercera barrera, ver dónde está la opción en el panel.
- [ ] Hacer un restore manual completo y escribir `RESTAURAR.md`: `RESTAURAR.md` y `.github/workflows/backup-db.yml` implementados; pendiente primera corrida de `workflow_dispatch` en GitHub Actions y simulacro manual de restore.
- **Dato conocido de `pg_default_acl` en Supabase:** el default ACL de `postgres` para tablas en `public` incluye `service_role=Dxtm` (`DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`, además de ignorar RLS). No afecta a `afull_api` (que no tiene `DELETE`) y el `TRUNCATE` sobre tablas inmutables sigue bloqueado por triggers, pero confirma que la `service_role key` jamás debe salir de GitHub Secrets.

---

## 8. Backlog por loop (anotado para no olvidarlo)

- **Loop 2:** CA-0.3 (dos inicios simultáneos de cronómetro: uno falla con `409`, nunca dos filas abiertas). Exclusion constraint de tarifas (requiere `btree_gist`). Aislar el módulo `live` tras la interfaz portable. Eventos de Broadcast solo en cambios de estado.
- **Loop 3:** la cola Dexie guarda también los **blobs de las fotos**, e **idempotencia** en `marcacion_asistencia`, viajes e intervalos. **Un `401` no descarta eventos**: se conservan, se pide login y se reintenta. Definir la regla de reparto de km entre varias OT de un mismo viaje (por paradas o por km de tramo) en `shared/formulas`. `sucursal.gps_lat/lng` ya existe.
- **Loop 4:** cada `consumo_insumo` genera su `movimiento_stock` (`SALIDA_PRODUCCION`) **en la misma transacción**, con FK entre ambos y costo unitario congelado al momento del consumo. Definir cómo se deriva el costo promedio (promedio móvil). Quitar `costo_promedio_gs` y `km_actual` como contadores mutables del diseño original.
- **Loop 5:** snapshot de costeo al cierre de la OT (no vista materializada): horas × tarifa vigente + insumos + km × costo por km. Cálculo en alta precisión y redondeo único al final.
- **Loop 6:** máquina de estados de diseño en `shared/machines`; el botón "Abrir original en Drive" para Edu.
- **Loop 7:** formulario PDF de permisos, generado on-demand (sin `pg-boss`).
- **Loop 8:** `token_portal` guardado hasheado; el portal usa un acceso por enlace sin contraseña.
- **Fuera de v1, con punto de enganche anotado:** retrabajos y garantías, desperdicio de material, mantenimiento de vehículos, notificaciones al cliente (WhatsApp/email).

---

## 9. Diferencias entre el documento maestro y lo decidido después

El documento maestro (`ARQUITECTURA_V3.md` en la raíz) se escribió antes de varias correcciones. Si hay conflicto, **gana este archivo (`TRASPASO.md`)**. Actualizar el maestro con un registro de cambios en lugar de pretender que es definitivo.

- El maestro menciona `postgres_changes`: se reemplazó por **Broadcast**.
- Los criterios CA-0.7 a CA-0.11 y el rol `afull_api` se agregaron después; el maestro puede no tenerlos.
- CA-0.3 se movió al Loop 2.
- `0004` omite `token_portal`, `presupuesto_id` y `pedido_id` en `cliente` / `orden_trabajo` (llegan con sus loops).
- El maestro dice que el SSE y `pg-boss` quedan fuera; confirmado: no se usan.

---

## 10. Variables de entorno y secretos

Nunca en el repo. Locales en `.env` y `.env.test` (en `.gitignore`); en producción, en Vercel y en GitHub Secrets.

| Variable | Uso |
| :--- | :--- |
| `DATABASE_URL` | La API (rol `afull_api`, pooler 6543) |
| `DATABASE_URL_ADMIN` | Migraciones y tests (rol `postgres`, directa o pooler en modo sesión) |
| `DATABASE_URL_API` | Tests (rol `afull_api`) |
| `APP_ORIGIN` | Verificación de `Origin` (CSRF) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Test de la `anon key` y cliente Realtime |
| `TEST_ENV` | Debe ser `dev` para que corran los tests |
| GitHub Secrets | `DEV_*`, `PROD_DATABASE_URL_BACKUP`, `BACKUP_PASSPHRASE`, `PROD_SUPABASE_URL`, `PROD_SUPABASE_SERVICE_KEY`, `RCLONE_CONF` |

**Guardá `BACKUP_PASSPHRASE` también en un gestor de contraseñas.** Si solo existe en GitHub y se pierde el acceso, los respaldos cifrados son inútiles. La `service_role key` da acceso total: solo en secrets de un repositorio **privado**, nunca en el frontend.

---

## 11. Cómo trabajar (para Claude Code o una sesión nueva)

1. Leer este archivo (`TRASPASO.md`) y el documento maestro (`ARQUITECTURA_V3.md`) completos. Resumir el estado en 10 líneas para confirmar alineación.
2. Tratar todo lo "sin verificar" como tal. Marcar con claridad lo que no se pudo ejecutar.
3. No reabrir decisiones de la sección 3 sin un problema real; si lo hay, explicarlo.
4. Verificar precios, límites y versiones actuales de servicios externos antes de afirmarlos.
5. Antes de cerrar una tarea: tests en verde, lint en verde, archivo ≤ 250 líneas, y actualizar la sección 0 y "Siguiente paso".
6. Los fallos de tests no se "ajustan para que pasen": primero se investiga si revelan un permiso o una restricción mal puestos.

---

## 12. Siguiente paso

1. **Orden recomendado para cerrar el Loop 0 antes de iniciar Loop 1B:**
   1) **Decisión sobre cold start de `CA-0.1` (usuario):** definir si se acepta el arranque en frío de `1253 ms` como excepción documentada en Sección 3 (dado que en caliente cumple con `147–163 ms`, mediana `152 ms`).
   2) **Secrets `DEV_*` y corrida manual de `tests-dev.yml` (usuario):** cargar `DEV_DATABASE_URL_ADMIN`, `DEV_DATABASE_URL_API`, `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY` en GitHub Settings y disparar `workflow_dispatch`.
   3) **Backup diario y restore manual (CA-0.9):** auditar e implementar `.github/workflows/backup-db.yml` y `RESTAURAR.md` (Ronda 1 en `MESA_DE_TRABAJO.md`), y realizar el restore manual completo hecho por una persona antes de cargar cualquier dato real. (`backup-storage` queda pospuesto al Loop 3).
   4) **Cerrar Loop 0 en `TRASPASO.md` y comenzar Loop 1B (`TablaAdmin` y `useClientes`).** *(Si se decide iniciar 1B en paralelo mientras solo haya datos de prueba, anotarlo explícitamente aquí como excepción al principio 7 con fecha y bloqueo de carga de datos reales hasta cerrar CA-0.9).*

---

## 13. Bitácora histórica de commits (`main`)

| Fecha | Commit | Resumen | Verificación |
| :--- | :--- | :--- | :--- |
| 2026-11-02 | `2352a53` | Seed idempotente del primer admin (`scripts/seed-admin.ts`, `seed.ts`, `seed.test.ts`) y bloqueo real `42501` en `anon.test.ts`. | 25/25 tests en `dev`, CI Run `#4` green |
| 2026-11-02 | `b9d0d58` | **Loop 1A — Entrega 1:** CRUD completo de clientes, sucursales, contactos (principal atómico) y marcas; `busqueda.test.ts` (CA-1.2 real) y `clientes.test.ts` (CA-1.1, CA-1.7 `42501`, CA-1.10 `app.routes`). | 29/29 tests en `dev`, CI Run `#5` green |
| 2026-11-02 | `cc6a1b4` | Registro de Entrega 1 y conteo de líneas en `TRASPASO.md`. | CI Run `#6` green |
| 2026-11-02 | `ed0621b` | **Loop 1A — Entrega 2 (Cierre Loop 1A):** Detalle de OT con `ot_evento` (CA-1.8), filtro `clienteId`, edición de OT con `409` y bloqueo `400` en estados finales (`esEstadoFinal`), CA-1.10 global sobre `app.routes` y CA-0.10 (20 requests HTTP simultáneas en `ot-api.test.ts`). | 34/34 tests en `dev`, CI Run `#7` green |
| 2026-11-02 | `f672ea4` | Mitigación de fondo del pooler 6543 (`sinPipelining` en `client.ts`), auditoría de consultas en `apps/api/src`, tests de 40 consultas mixtas y auditoría estática en `secuencia.test.ts`, y creación de `.github/workflows/tests-dev.yml`. | 36/36 tests en `dev`, CI Run `#8` green |
| 2026-11-02 | `b34a5a8` | Fijación de versión exacta `postgres@3.4.9` (sin `^`), entrypoint de Vercel (`api/index.js`, `apps/api/src/vercel.ts`, `vercel.json` en `gru1`) con precompilación de `@afull/shared` y `@afull/api`. | CI Run `#9` green |
| 2026-11-02 | `ba3e970` | Ajuste de build para Vercel (`public/index.html`, `outputDirectory: "public"` en `vercel.json` y `"engines": { "node": "22.x" }` en `package.json`). | CI Run `#10` green |
| 2026-11-02 | `a588fbb` | Fix de body stream en Vercel Node runtime (`api.bodyParser: false` en `api/index.js` y puente `req.body → req.rawBody` en `apps/api/src/vercel.ts`; resuelto, causa exacta sin aislar). | **CA-0.1 en caliente y CA-0.10 por HTTP verificados en `gru1`:** 9 muestras cálidas 147–163 ms (mediana 152 ms), 20 GET concurrentes 20/20 `200 OK` en 754 ms |
| 2026-11-02 | `56ddd08` | Registro de mediciones de Vercel `gru1` en `TRASPASO.md`. | CI Run `#12` green |
| 2026-11-02 | `703c0ec` | Refinamiento en `TRASPASO.md`: distinción entre login cálido y cold start pendiente, observación de serialización en las 20 concurrentes y checklist de cierre del Loop 0. | CI Run `#13` green |
| 2026-11-02 | `e896d54` | Medición de cold start de login (`1253 ms` sobre `703c0ec`), sincronización de `CLAUDE.md` y copia de `ARQUITECTURA_V3.md` en la raíz. | CI Run `#14` green |
