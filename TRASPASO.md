# Traspaso del proyecto aFull

Última actualización: 2 de noviembre de 2026 — 18:35 (America/Asuncion).
Archivo canónico: `D:\sistema-afull\TRASPASO.md`. Se actualiza al cerrar cada tarea o commit.

---

## 0. LEER PRIMERO: qué está verificado y qué no

**Estado de verificación actual:** El monorepo fue inicializado en `D:\sistema-afull` con lint y tipos en verde. Las migraciones `0001` a `0005` fueron aplicadas con éxito en Supabase `afull-dev` (São Paulo) mediante Drizzle. Se asignó la contraseña al rol `afull_api`, las consultas de comprobación dieron los resultados exactos esperados y `pnpm test` pasa **44 de 44 tests en verde** (14 suites backend) contra Supabase `dev` y PostgreSQL 17 en GitHub Actions CI, y `pnpm --filter @afull/web test` pasa **45 de 45 tests web en verde** (9 suites frontend con Vitest y jsdom).
- **Loop 1B CERRADO (CA-1.11 a CA-1.16 verificados):**
  - **Entrega E1 (`3cd0ef5`, `39d0949`):** Shell del frontend (React 19, Vite 8, TanStack Router y Query v5, paleta `#090a0f`, `#111318`, `#ea580c`, sin acentos azules, radios 4–6 px), login, protección de sesión, pantalla de caída de API con reintento, navegación filtrada por capacidades y logout seguro.
  - **Entrega E2 (`c9ee07b`, `b32f63a`):** Componente genérico `TablaAdmin<T>` con 4 estados (cargando, refrescando, error, vacío), búsqueda con debounce de 300 ms, paginador fijo de 25 filas accesible (`aria-live`), manejo de página fuera de rango, módulo de Clientes (listado, alta, edición con `PATCH`, control 409 con aviso detallado de campos modificados, y desactivación con advertencia de OTs abiertas).
  - **Entrega E3 (`2570c07`, `2ea59d8`, `078ca00`, `2546057`, `99151ff`):** API con nombres en OTs y búsqueda por nombre de cliente, detalle de cliente (`/clientes/$id`) con modales para sucursales (GPS validado en Paraguay `[-27.7, -19.2]` y `[-62.7, -54.2]`), contactos (conmutación atómica de `esPrincipal`) y marcas; módulo de OTs (`/ots` y `/ots/$id`) con modales de alta, edición y transición (restringida a `transicionesDesde`, motivo obligatorio al cancelar); formato de fecha prometida sin desfase (D7); sesión completa tras login vía `/api/auth/yo` (`useSesion.ts`), normalización de opcionales vacíos (`resolverSinVacios`); prueba de humo de 9 puntos en verde (`scripts/prueba-humo-e3.ts`) y **recorrido completo de interfaz en navegador Playwright de 15 pasos en verde contra Vercel** (`scripts/prueba-ui.cjs`).
  - **Restricción de tamaño (CA-1.11):** Todos los archivos de `apps/web/src` cumplen estrictamente con `max-lines: 250`.
- **Despliegue en Vercel (`gru1` São Paulo, Node 22) — CA-0.1 CERRADO (cumplido en caliente; cold start aceptado como excepción documentada por el usuario) y CA-0.10 por HTTP verificado:**
  - **Cuelgue anterior de 20 s en `POST /api/auth/login` — Estado: RESUELTO en commit `a588fbb`, CAUSA EXACTA SIN AISLAR** (se aplicaron juntos el puente `req.body → req.rawBody` en `apps/api/src/vercel.ts` y `api.bodyParser: false` en `api/index.js`).
  - **Sondas diagnósticas reales en `gru1` (sobre commit `a588fbb`):** Probe 1 (`POST /api/auth/login` con `{}`) → `400` en **600 ms** (1.ª llamada post-deploy, sin tocar Argon2 ni base de datos) y **460 ms**; Probe 2 (usuario inexistente ejecutando `verificarDummy()` con `@node-rs/argon2` + base de datos, ya con la instancia caliente) → `401` en **295 ms**.
  - **Las 4 mediciones en `gru1` contra Supabase `afull-dev` (pooler 6543):**
    1. **`@node-rs/argon2` en producción:** carga y verifica hashes Argon2id (19 MiB, 2 iteraciones, 1 hilo) sin errores en el runtime Node 22 de Vercel (`200` en login válido y `401` en usuario inexistente con hash dummy). El diseño de autenticación queda con Argon2id (no hace falta `scrypt`).
    2. **Latencia de `POST /api/auth/login` (en frío y en caliente):**
       - **Cold start real del login con Argon2 + DB (medido sobre el deploy de `703c0ec` tras >23 min sin tráfico):** `HTTP 200` en **1253 ms** (`1,25 s`), aceptado como excepción documentada por el usuario el 2026-11-02 en Sección 3.
       - **Ráfaga en caliente (9 muestras cálidas seguidas sobre `a588fbb`):** `147 ms`, `161 ms`, `150 ms`, `150 ms`, `152 ms`, `153 ms`, `163 ms`, `150 ms`, `155 ms` (**mín: 147 ms | mediana: 152 ms | promedio: 153 ms | máx: 163 ms**, total con red incluida, dentro del rango objetivo de **100–300 ms** de **CA-0.1** en caliente).
    3. **20 peticiones simultáneas a `GET /api/clientes` con cookie válida (`CA-0.10` por HTTP sobre `a588fbb`):** **20/20 responden `200 OK`** sin colgarse en **754 ms** de tiempo total de pared (`mín: 228 ms | mediana: 704 ms | máx: 752 ms`).
    4. **CSRF y flags de cookie:** `POST /api/auth/login` con `Origin` inválido devuelve `403` en **277 ms**; `Set-Cookie` en login válido incluye `HttpOnly`, `Secure` y `SameSite=Lax`.
  - **Higiene en `afull-dev`:** Todos los usuarios de prueba usan el prefijo `zz_test_` y son auto-desactivados tras cada suite; base dev en 0 usuarios activos y 0 sesiones abiertas (`limpiar-usuarios-prueba.ts --aplicar`).
- **Qué queda para cerrar Loop 0 al 100%:**
  1. Cargar los secrets restantes de dev en GitHub Actions y correr `tests-dev.yml`.
  2. Realizar el **restore manual completo hecho por una persona** en el proyecto temporal Supabase `afull-restore-drill` y documentarlo en `RESTAURAR.md` (**CA-0.9**). *(Nota: `backup-storage` se pospone al Loop 3, cuando la app empiece a subir fotos a Storage).*

| Pieza | Estado |
| :--- | :--- |
| Documento maestro v3.x | Copiado en `D:\sistema-afull\ARQUITECTURA_V3.md` (con aviso de que `TRASPASO.md` gana en caso de diferencia); `CLAUDE.md` sincronizado. |
| Repositorio y monorepo | Inicializado en `D:\sistema-afull`. Remoto: `https://github.com/Morochief/sistema-afull-v2.git` (rama `main`). `lint` y `typecheck` en verde. |
| Migraciones `0001` a `0006` (SQL) | **Aplicadas con éxito en Supabase `afull-dev`** con Drizzle journal (`0006` tareas, eventos, intervalos y tarifas con btree_gist en extensions). |
| Auth, sesiones, auditoría y seed admin | **Verificado contra Supabase `dev` y en Vercel (`gru1`)**. CA-0.1 cerrado con excepción: verificado en caliente (`147–163 ms`, mediana `152 ms` sobre `a588fbb`); cold start en frío de `1253 ms` sobre `703c0ec` aceptado por el usuario el 2026-11-02 como excepción documentada en Sección 3; CA-0.10 por HTTP (20/20 en 754 ms) verificado; pendientes secrets de `tests-dev.yml` y restore manual de CA-0.9. |
| Tests Loop 0 (Vitest) | **22/22 en verde contra Supabase `dev` y CI** (RLS, anon key `42501`, funciones y default privileges cerrados en `funciones.test.ts`, auth, seed idempotente, inmutabilidad, concurrencia por pooler + `sinPipelining`, CSRF en `csrf.test.ts`). |
| Tests Loop 1A (Vitest) | **16/16 en verde contra Supabase `dev` y CI** (`busqueda.test.ts`, `clientes.test.ts`, `ot.test.ts`, `ot-api.test.ts`). **Loop 1A cerrado (CA-1.1 a CA-1.10)**. |
| Tests Loop 1B (Vitest frontend + contrato) | **45/45 tests web en verde** (9 suites) y **6 tests de contrato/API adicionales**, más **15/15 pasos Playwright UI en verde contra Vercel**. **Loop 1B cerrado (CA-1.11 a CA-1.16)**. |
| Tests Loop 2 (Vitest backend) | **6/6 en verde contra Supabase `dev`** (`personas.test.ts`, `tarifas.test.ts`, `auditoria-personas.test.ts`, CA-2.3, CA-2.4). Total backend: **50/50 en verde** (48/48 en CI sin `anon.test.ts`). |
| Workflows de GitHub Actions | `ci.yml` (en verde en cada push), `tests-dev.yml` (**escrito, sin ejecutar**; requiere secrets `DEV_*`), `backup-db.yml` (**verificado en verde en corridas #2, #5 y #6 con D5-1 y migración 0006 con btree_gist comprobados**). |
| `backup-storage.mjs` | Escrito de memoria, sin probar; **pospuesto al Loop 3** (hoy no se usa Storage). |
| Proyectos Supabase `dev` y `prod` | `afull-dev` activo y verificado en São Paulo (`oxthxdnyxabupeebzwmn`); `prod` pendiente. |
| Proyecto Vercel | **Desplegado en `gru1` (Node 22)**: API Hono + React 19 SPA (rewrite `/(.*) -> /index.html` funcional con HTTP 200 en rutas profundas `/ots/:id`), prueba de humo de 9 puntos en verde. |

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
- **Excepción documentada CA-0.1 (login en frío en Vercel gru1):** Aceptada por el usuario el 2026-11-02. El tiempo en caliente cumple holgadamente el objetivo (`147–163 ms`, mediana `152 ms` con red incluida desde Paraguay y Argon2id en Node 22). El cold start tras >20 min sin tráfico (`1253 ms`, 1,25 s; causa probable: arranque de la instancia serverless y primera conexión TLS a Supabase) es admisible para la operativa de una oficina chica de cartelería y evita la necesidad de planes de pago con instancias siempre activas.
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
| `0005_default_privileges_funciones` | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;` (global, sin `IN SCHEMA`) y barrido idempotente en `public`. Cierra la herencia implícita de `EXECUTE` en funciones nuevas para `anon`/`authenticated`/`afull_api`. |

Notas de `0004`: `cliente` no lleva `token_portal` todavía (es del Loop 8; guardarlo **hasheado**, como las sesiones). `orden_trabajo` no lleva `presupuesto_id` ni `pedido_id` todavía; se agregan con `ALTER TABLE` cuando existan esas tablas. Verificar que `pg_trgm` en el esquema `extensions` funcione en el proyecto.

---

## 6. Estado por loop

Orden: 0 Base → 1 Clientes + OT → 2 Tareas, cronómetro y Control en Vivo → 3 Campo offline + flota → 4 Stock → 5 Costeo → 6 Pre-prensa → 7 RR.HH. → 8 Portal B2B.
(Costeo va temprano porque es lo que justifica el sistema.)

### Loop 0: Base (22/22 tests + CA-0.1 en caliente y CA-0.10 por HTTP en Vercel verificados; CA-0.1 cerrado con excepción; pendientes tests-dev.yml y restore manual de CA-0.9)

Tareas: 1 decidir API (Vercel Node, cerrada) · 2 repo + reglas de lint · 3 dos proyectos Supabase · 4 conexión y migraciones · 5 migraciones 0001–0003 y 0005 · 6 auth · 7 capacidades + seed del primer admin · 8 auditoría · 9 CI · 10 backups · 11 deploy y prueba de humo.

Criterios de aceptación:
- **CA-0.1** Login con Argon2id, cookie segura, fila en `sesion`; **medido en el entorno desplegado (`gru1`, Node 22)**: ráfaga de 9 muestras cálidas entre `147 ms` y `163 ms` (mediana `152 ms`, promedio `153 ms`, total con red incluida sobre `a588fbb`, dentro del objetivo de `100–300 ms`), cookie con `HttpOnly; Secure; SameSite=Lax`; el arranque en frío real del login con Argon2 + DB dio `1253 ms` (sobre `703c0ec` tras >23 min sin tráfico), seguido de `318 ms` en la 2.ª llamada inmediata. (**Verificado en caliente; cold start de 1253 ms aceptado por el usuario el 2026-11-02 como excepción documentada en Sección 3**)
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

### Loop 1: Clientes y OT (Loop 1A y Loop 1B CERRADOS)

Partido en dos. **1A** (base y API, **CERRADO**): migración `0004`, esquemas y máquina de estados en `shared` (`puedeTransicionar`, `esEstadoFinal`), infraestructura común (`ErrorApp`, `traducirErrorPg`, paginación), módulos `clientes` y `comercial`, tests (`busqueda.test.ts`, `clientes.test.ts`, `ot.test.ts`, `ot-api.test.ts`). **1B** (frontend, **CERRADO**): shell (React 19, Vite 8, TanStack Router y Query v5, login, layout accesible), componente genérico `TablaAdmin<T>` con 4 estados, hooks `useClientes`/`useOTs`/`useOT`, modales de alta, edición y transición con control 409 y confirmación atómica, formato de fechas sin desfase (D7), deploy a Vercel `gru1` y prueba de humo automatizada de 9 puntos en verde.

Criterios 1A (**todos verificados**): CA-1.1 paginación fija de 25 · CA-1.2 búsqueda < 100 ms **en la base** con 5000 registros · CA-1.3 GPS en Paraguay (Zod y base) · CA-1.4 máquina de estados aplicada (400 salto inválido y bloqueo de edición en estados finales, 409 dato viejo) · CA-1.5 código de OT sin duplicados ni huecos bajo concurrencia · CA-1.6 sucursal del cliente de la OT · CA-1.7 sin borrado físico (`42501` en `DELETE`) · CA-1.8 `ot_evento` en la misma transacción y coherente con el estado · CA-1.9 test de `anon key` sigue en verde (`42501`) · CA-1.10 todos los endpoints exigen `comercial` o `admin`.

Criterios 1B (**todos verificados**):
- **CA-1.11** Tabla con búsqueda con debounce 300 ms, filtros y paginador fijo de 25 con bordes deshabilitados y región `aria-live`; todos los archivos del frontend y monorepo cumplen estrictamente ≤ 250 líneas (`max-lines: 250`).
- **CA-1.12** Expulsión limpia: sesión expirada o usuario desactivado revoca acceso inmediatamente (401), limpia caché y redirige a `/login` con retorno seguro; caída de API renderiza pantalla con botón de reintento sin expulsar.
- **CA-1.13** Control de concurrencia optimista visible (409): modal de edición detalla campos modificados por otro usuario y preserva los inputs locales para permitir sobreescritura informada sin reintento ciego.
- **CA-1.14** Formato estricto de fechas y moneda: fecha prometida `2026-11-05` renderiza `05/11/2026` sin desfase de zona horaria (`formatearFechaDate`); moneda en Guaraníes sin decimales (`formatearGs`).
- **CA-1.15** Sub-recursos y pertenencia: sucursales con GPS en Paraguay, contacto principal con conmutación atómica sin dobles principales, marcas.
- **CA-1.16** Máquina de estados de OT en UI: modales restringen opciones a `transicionesDesde`, motivo obligatorio al cancelar, línea de tiempo ordenada de `ot_evento`, búsqueda cruzada de OTs por nombre de cliente.

Limitaciones conocidas: la búsqueda trigram no ignora acentos ("Cañete" ≠ "Canete"); si molesta, agregar `unaccent` en un loop posterior. Los datos `zz_test_*` de OT no se pueden limpiar (historial inmutable), así que `dev` acumula residuo esperable.

---

## 7. Verificaciones pendientes (cosas que se dieron por probables, no comprobadas)

- [x] Login y hash en Vercel: tiempo de 100–300 ms, **incluyendo cold start**; que `@node-rs/argon2` cargue en el runtime Node de Vercel (CA-0.1): **Cumplido en caliente en `gru1` (Node 22, commit `a588fbb`)** (`@node-rs/argon2` carga y verifica; 9 muestras cálidas `147–163 ms`, mediana `152 ms` con red incluida). **Cold start en frío (`1253 ms` sobre `703c0ec`) aceptado como excepción documentada por el usuario el 2026-11-02 en Sección 3.**
- [x] Comportamiento del pooler de transacciones (puerto 6543 con `sinPipelining` y `fetch_types: false`) desde funciones serverless de Vercel bajo peticiones concurrentes: **VERIFICADO en `gru1` (commit `a588fbb`)**. 20 requests simultáneas a `GET /api/clientes` con cookie válida devuelven **20/20 `200 OK`** en `754 ms` de pared (`min: 228 ms | mediana: 704 ms | max: 752 ms`). *Observación (sin causa confirmada):* el escalonamiento `228–752 ms` frente a ~150–200 ms de una petición cálida sugiere atención casi en serie (cola en una sola instancia/hilo o en el pooler).
- [ ] Términos del plan Vercel Hobby para uso comercial antes de operar con personal real.
- [x] Que Supabase permita `CREATE ROLE afull_api` y cómo se escribe el usuario en el pooler: **VERIFICADO**. Supabase permite `CREATE ROLE` sin error y el usuario en el transaction pooler 6543 es `afull_api.<ref-proyecto>`.
- [x] Que el rol funcione con RLS como se espera (políticas por rol): **VERIFICADO**. 16 tests de Loop 0 en verde contra Supabase `dev`.
- [x] Si `pg_dump` conecta desde runners de GitHub (IPv4): **VERIFICADO en corrida #2 de GitHub Actions (`cbd4a7c`)**. Conecta al Session Pooler puerto 5432 sin errores.
- [ ] Rutas y respuestas de la API de Storage en `backup-storage.mjs` (**pospuesto al Loop 3**, cuando la app suba archivos a Storage).
- [ ] Cuota de almacenamiento de artifacts de GitHub en cuenta gratuita.
- [ ] Que el proyecto Supabase no se pause en un feriado largo (el backup diario debería bastar; confirmar o agregar un `SELECT 1` programado).
- [ ] Limitar el esquema expuesto de la API de datos de Supabase (la app no usa PostgREST): tercera barrera, ver dónde está la opción en el panel.
- [ ] Hacer un restore manual completo y escribir `RESTAURAR.md`: `RESTAURAR.md` y `.github/workflows/backup-db.yml` implementados; corridas automáticas verificadas; pendiente simulacro manual en Supabase `afull-restore-drill`.
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

> **Excepción al principio 7 (2026-11-02, decisión del usuario):** se inició y cerró Loop 1B con el Loop 0 abierto en dos puntos: (a) CA-0.9, el simulacro manual de restore en `afull-restore-drill`; (b) los secrets `DEV_*` restantes y la corrida de `tests-dev.yml`. **Bloqueo:** no se crea `afull-prod` con datos reales ni se carga ningún dato real hasta cerrar (a) y (b). Nota: los artefactos de backup duran 30 días; si el simulacro se hace después del 2026-12-02, volver a correr `backup-db.yml`.

1. **Auditoría final de Entrega E3 / Cierre Loop 1B** por Claude Code.
2. **Apertura de Loop 2 (Tareas, Cronómetro y Control en Vivo):**
   - Definir diseño de Loop 2: asignación de tareas a colaboradores, estados de tarea, inicio y fin de cronómetro concurrente con detección de 409 (CA-0.3), módulo live tras interfaz portable de Supabase Broadcast.
   - Mantener el bloqueo activo sobre producción y datos reales hasta el cierre de (a) y (b).

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
| 2026-11-02 | `752d8f4` | ci(backup): agregar workflow backup-db.yml y guia RESTAURAR.md (CA-0.9). | CI Run `#41474185921` green |
| 2026-11-02 | `cbd4a7c` | fix(backup): anteponer /usr/lib/postgresql/17/bin en GITHUB_PATH para usar pg_dump 17. | CI Run `#41477871806` green, Backup Run #2 green |
| 2026-11-02 | `cfb5767` | feat(security): migracion 0005 default privileges funciones, test loop0 y D5-1 en backup. | 38/38 tests en dev, CI Run `#41482469212` green |
| 2026-11-02 | `82f4921` | fix(backup): corregir sintaxis bash en roles dinamicos y chequeo D5-1, cerrar CA-0.1 con decision de cold start. | CI Run `#41484116136` green |
| 2026-11-02 | `e24dc12` | fix(backup): filtrar comando multi-sentencia para extraer valor booleano en chequeo D5-1. | CI Run `#41485136748` green, Backup Run #5 (`#41485209561`) green |
| 2026-11-02 | `0ae475b` | fix(security): agregar tests CSRF, prefijo zz_test_u_ con auto-desactivacion y script de limpieza. | CI Run `#41504830491` green |
| 2026-11-02 | `c9ee07b` | feat(web): implementar Entrega E2 (TablaAdmin generica, clientes, modales, CA-1.11, CA-1.13 y test de contrato). | CI Run `#41508351425` green |
| 2026-11-02 | `b32f63a` | fix(web): PATCH en clientes, mensajes de error y aviso de 409 (auditoria E2). | CI Run `#41510053245` green |
| 2026-11-02 | `2570c07` | feat(api): incluir nombres de cliente y sucursal en OTs y habilitar busqueda por cliente (E3.1). | CI Run `#41511309493` green |
| 2026-11-02 | `2ea59d8` | feat(web): implementar detalle de cliente con sucursales, contactos y marcas (E3.2). | CI Run `#41512140776` green |
| 2026-11-02 | `078ca00` | feat(web): implementar OTs lista, detalle, modales de transicion y edicion (E3.3). | CI Run `#41513931532` green |
| 2026-11-02 | `2546057` | test(smoke): agregar script de prueba de humo automatizada de 9 puntos en Vercel (E3). | — |
| 2026-11-02 | `5de4ec4` | fix(smoke): tipado local y limite de lineas en script de prueba de humo. | CI Run `#41515506474` green |
| 2026-11-02 | `99151ff` | fix(web): sesión completa tras login y campos opcionales vacíos (auditoría E3). | CI Run `#41519975658` green |
| 2026-11-02 | `fd38c0b` | test(ui): recorrido Playwright de 15 pasos en Vercel y remoción de Toaster duplicado. | 15/15 pasos Playwright UI en Vercel green |
| 2026-11-02 | `ec3a77a` | feat(api): implementar migracion 0006, maquinas y API de personas y tarifas (L2.E1). | 47/47 tests backend en dev, Backup Run #6 green |
| 2026-11-02 | `379afa1` | fix(api): auditoría en transacción y 409 al vincular usuario ya asignado (auditoría L2.E1). | 50/50 tests backend en dev, 45/45 web, lint 0, tipos 0 |
