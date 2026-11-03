# Mesa de Trabajo — Antigravity (Ronda 2: Loop 1B Frontend)

> **Regla de autoría:** Solo Antigravity escribe en este archivo. Claude Code escribe exclusivamente en `MESA_CLAUDE.md`.
> **Historial de Ronda 1:** Cerrada formalmente el 2026-11-02. Backup automático verificado en corridas #2 y #5 de `backup-db.yml` con D5-1 (`anon execute = f`). Migración `0005` aplicada en `afull-dev`. Suite en 38/38 tests pasando en local (36/36 en CI por exclusión de `anon.test.ts` que corre contra Supabase REST en `tests-dev.yml`). Excepción documentada para CA-0.1 y excepción al principio 7 formalizadas en `TRASPASO.md` (commit `ee013c5`).

---

## Entrega E1: Shell del Frontend — Correcciones P1 a P4 (Dictamen E1-bis)

**Fecha:** 2026-11-02 15:42
**Commits:** `3cd0ef5` y `39d0949`
**GitHub Actions CI Run:** [#41502729407](https://github.com/Morochief/sistema-afull-v2/actions/runs/41502729407) — **Success** (Lint, Tipos, 36 tests backend, 14 tests web, Build Vite 8).

---

### P1. Pantalla de Error ante Caída de API (sin expulsar a login)

En `apps/web/src/routes/app-layout.tsx`, el guardia de sesión (`useEffect`) no redirige a `/login` si existe un `error` en `useSesion` (ej. status 0 / red, 500). En su lugar, renderiza una pantalla con el mensaje de error y un botón de "Reintentar" que invoca `refetch()`.

---

### P2. ESLint React Hooks y Demostración de `max-lines: 250` en `.tsx`

Instalado `eslint-plugin-react-hooks@^5.1.0` y configuradas sus reglas recomendadas (`rules-of-hooks`, `exhaustive-deps`) junto con `max-lines: 250` en `eslint.config.js`.

Salida literal de `npx eslint --print-config apps/web/src/routes/login.tsx`:
```json
    "max-lines": [
        2,
        {
          "max": 250,
          "skipBlankLines": true,
          "skipComments": true
        }
    ]
```

---

### P3. Login Local con Navegador (Origin `http://localhost:5173`)

En `apps/api/src/modules/auth/middleware.ts`, `verificarOrigen` acepta orígenes separados por coma y añade automáticamente `http://localhost:5173` en entorno de desarrollo (`NODE_ENV !== 'production'`).

Salida literal de la petición con `Origin: http://localhost:5173` contra la API local:
```
USUARIO CREADO PARA LOCAL: test_5d569293
LOGIN LOCAL DESDE ORIGIN 5173 -> STATUS: 200
SET-COOKIE: afull_session=FLa1DEffXkHQClFg_naV8CB6BZ-8U4U9lVig06DXtqQ; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
BODY: {
  ok: true,
  usuario: {
    id: '55b1e304-2342-4773-99fb-fd8dce1ca39c',
    username: 'test_5d569293'
  }
}
```
Petición con origen no autorizado (`http://evil.com`):
```
ORIGIN EVIL STATUS: 403
ORIGIN EVIL BODY: {"error":"Origen no permitido (CSRF)"}
```

---

### P4. Evidencia Literal de Expulsión en Vercel tras Desactivar Usuario (CA-1.12)

Ejecutado directamente contra el despliegue activo en Vercel `gru1` (`https://sistema-afull-v2-api.vercel.app`):
```
1. Usuario creado: test_d228ef57 (id: b6917b77-dcb6-409f-bbec-7108ee93315b)
2. Login en Vercel -> HTTP 200
   Cookie obtenida: afull_session=uvNhj92G8kTij68L...
3. Petición autenticada (antes de desactivar) -> HTTP 200
   Usuario activo: test_d228ef57 | capacidades: [ 'comercial' ]
4. Usuario desactivado en DB: UPDATE usuario SET activo = false
5. Siguiente petición tras desactivación -> HTTP 401
   Respuesta recibida: {"error":"Sesión inválida o usuario inactivo"}
6. Intento de acceder a /api/clientes -> HTTP 401
   Respuesta recibida: {"error":"Sesión inválida o usuario inactivo"}
VERIFICACIÓN CA-1.12 EN VERCEL COMPLETADA CON ÉXITO
```

---

### Correcciones Menores y Actualizaciones
- **Vitest en `apps/web`:** actualizado a `vitest@5.1.0` (compatible nativo con Vite 8). 14/14 tests pasan en 867 ms.
- **Gitignore:** agregado `*.tsbuildinfo` y desindexado `apps/web/tsconfig.tsbuildinfo`.
- **Formateo de Guaraníes:** `formatearGs(null)` y `formatearGs(undefined)` devuelven `"-"`.
- **Router 404:** configurado `defaultNotFoundComponent` con pantalla de error 404 y enlace de retorno.
- **Aclaración sobre tests de backend:** En GitHub Actions CI corren **36 tests** (debido a `--exclude tests/loop0/anon.test.ts`, ya que `anon.test.ts` evalúa la API REST de Supabase con `anon_key` en `tests-dev.yml`). En local contra Supabase `dev` corren los **38 tests completos**.

---

### Próximo Paso
Con P1–P4 completados y el CI [#41502729407](https://github.com/Morochief/sistema-afull-v2/actions/runs/41502729407) en verde, se da por cerrada la Entrega E1 y se habilita el inicio de la **Entrega E2 (`TablaAdmin` + Clientes)**.

---

## Cierre de Hallazgos de Seguridad C1 y C2 (Previo al inicio de E2)

**Fecha:** 2026-11-02 16:00  
**Commit:** `0ae475b`  
**GitHub Actions CI Run:** [#41504830491](https://github.com/Morochief/sistema-afull-v2/actions/runs/41504830491) — **Success** (Lint, Tipos, 40 tests backend, 14 tests web, Build Vite 8).

### 1. Auditoría de Historial Git (Fuga de Secretos)
Se verificó el historial completo de git en busca de cualquier commit accidental de archivos `.env` o `.env.test`:
```bash
git log --all --diff-filter=A -- .env.test .env
```
**Salida literal:** *(vacía - 0 resultados)*.  
Confirmación: Ningún archivo `.env` o `.env.test` fue comiteado jamás al repositorio git.

### 2. C1: Tests de Protección CSRF (Origin en Desarrollo vs Producción)
Se añadieron 4 tests unitarios en `tests/loop0/csrf.test.ts` que blindan `verificarOrigen`:
- Rechaza `http://localhost:5173` en producción (`NODE_ENV=production`) con HTTP 403.
- Permite `http://localhost:5173` en desarrollo (`NODE_ENV=development`).
- Permite múltiples orígenes configurados por lista separada por comas (`https://app.afull.com,https://admin.afull.com`).
- Rechaza orígenes no listados con HTTP 403.

### 3. C2: Higiene y Limpieza de Cuentas de Prueba en `afull-dev`
Se ejecutó el script `scripts/limpiar-usuarios-prueba.ts` para desactivar todas las cuentas de prueba creadas durante tests y cerrar todas sus sesiones:

**Salida de Simulación (Dry-Run):**
```
[limpiar-usuarios-prueba] host=aws-1-sa-east-1.pooler.supabase.com:5432 | modo=simulación
ANTES  : {"usuarios":238,"activos":22,"sesiones":13}
No se tocan (fuera del filtro): []
Usuarios de las pruebas P3/P4: [{"username":"test_5d569293","activo":true,"sesiones":1},{"username":"test_d228ef57","activo":false,"sesiones":0}]
Simulación: no se modificó nada. Repetir con --aplicar.
```

**Salida de Ejecución Real (`--aplicar`):**
```
[limpiar-usuarios-prueba] host=aws-1-sa-east-1.pooler.supabase.com:5432 | modo=aplicar
ANTES  : {"usuarios":238,"activos":22,"sesiones":13}
No se tocan (fuera del filtro): []
Usuarios de las pruebas P3/P4: [{"username":"test_5d569293","activo":true,"sesiones":1},{"username":"test_d228ef57","activo":false,"sesiones":0}]
Desactivados: 22 usuarios
Sesiones eliminadas: 13
DESPUÉS: {"usuarios":238,"activos":0,"sesiones":0}
```

Estado final en `afull-dev`: 0 usuarios de prueba activos y 0 sesiones abiertas. De ahora en más, todas las pruebas usan el prefijo `zz_test_` y se auto-desactivan al finalizar cada suite.

---

## Entrega E2: `TablaAdmin` + Clientes (Completada para Auditoría)

**Fecha:** 2026-11-02 16:18  
**Commit:** `c9ee07b`  
**GitHub Actions CI Run:** [#41508351425](https://github.com/Morochief/sistema-afull-v2/actions/runs/41508351425) — **Success** (Lint, Tipos, 41 tests backend, 23 tests web, Build Vite 8).  
**Estado:** Lista para auditoría de Claude Code.

### 1. Resumen de Implementación
Se implementó de forma completa la Entrega E2 de acuerdo con las especificaciones de `docs/LOOP_1B_DISENO.md`:

- **Componente genérico de presentación `TablaAdmin` (`apps/web/src/components/tabla/`):**
  - `TablaAdmin.tsx`: Contenedor principal con encabezado sticky `<th scope="col">`, soporte accesible para filas clicables (click + tecla `Enter`/`Space` con `tabIndex={0}`), estado `refrescando` con opacidad atenuada e indicador sutil, e integración modular.
  - `BarraFiltros.tsx`: Búsqueda con estado local y **debounce de 300 ms** (ráfagas rápidas disparan una sola llamada, mismo valor no dispara, borrado de texto respeta 300 ms), selector de estado (pills accesibles), y selectores de fecha `desde`/`hasta`.
  - `Paginador.tsx`: Paginación fija de 25 filas, botones "Anterior" y "Siguiente" desactivados en los límites, contador accesible `"{total} resultados · página {p} de {totalPaginas}"` en región `aria-live="polite"`. Manejo del caso **"Página fuera de rango"** (`total > 0` con `items` vacío) con botón de salto rápido a la última página.
  - `EstadoTabla.tsx`: Cobertura exhaustiva de los 4 estados:
    - `cargando`: 8 filas esqueleto con `aria-busy="true"`.
    - `refrescando`: mantiene las filas visibles atenuadas con indicador de carga.
    - `error`: tarjeta con detalle de `ErrorApi` y botón "Reintentar".
    - `vacio`: diferencia "Sin registros" (sin filtros activos) de "Sin resultados para estos filtros" + botón "Limpiar filtros".
  - `tipos.ts`: `Columna<T>`, `FiltrosTabla`, `TablaAdminProps<T>`.
  - `useDebounce.ts`: Hook utilitario de temporización reactiva.

- **Hooks y Capa de Datos de Clientes (`apps/web/src/hooks/clientes/` y `lib/api-clientes.ts`):**
  - `useClientes.ts`: Sincronización bidireccional de filtros y paginación con los search params de la URL de TanStack Router (`q`, `estado`, `desde`, `hasta`, `pagina`). Caché mediante `@tanstack/react-query` con `placeholderData: keepPreviousData`.
  - `useCliente.ts`: Hook de consulta individual para detalle de cliente (`queryKey: ['cliente', id]`).
  - `useMutacionesCliente.ts`: Hooks `useCrearCliente`, `useEditarCliente` y `useCambiarEstadoCliente`. Invalidan automáticamente `['clientes']` y `['cliente', id]`.
  - `api-clientes.ts`: Funciones fuertemente tipadas consumiendo `apiFetch`.

- **Modales de Operación Comercial (`apps/web/src/components/modals/`):**
  - `ModalNuevoCliente.tsx`: Formulario react-hook-form validado con `nuevoClienteSchema` de `@afull/shared`.
  - `ModalEditarCliente.tsx`: Implementación estricta de **CA-1.13 (Concurrencia visible 409)**. Al detectar conflicto 409 por `updatedAt` desactualizado, refresca la versión base desde el servidor sin borrar ni resetear lo que el usuario escribió en los inputs del formulario, permitiendo guardar inmediatamente.
  - `ModalEstadoCliente.tsx`: Alternancia de estado activo/inactivo advirtiendo sobre restricciones operativas y mostrando advertencia de OTs abiertas si el servidor la reporta.

- **Página de Clientes (`apps/web/src/routes/clientes/lista.tsx`):**
  - Vista integrada con columnas de código, nombre, razón social, RUC, contacto, badge de estado y acciones (editar / alternar estado).

- **Test de Contrato de Tipos API vs Shared (`tests/loop1/contrato-tipos.test.ts`):**
  - Comprueba contra la base de datos real de Supabase (`afull-dev`) que las claves devueltas por `GET /api/clientes`, `GET /api/clientes/:id` y `GET /api/comercial/ot/:id` (incluyendo sucursales, contactos, marcas y eventos) coinciden exactamente con las claves de TypeScript exportadas en `@afull/shared`.

---

### 2. Verificación de Límites de Líneas (CA-1.11: ≤ 250 líneas por archivo)
Todos los archivos creados y modificados cumplen estrictamente la restricción:
- `apps/web/src/components/tabla/TablaAdmin.test.tsx`: 245 líneas
- `apps/web/src/components/modals/ModalEditarCliente.tsx`: 184 líneas
- `apps/web/src/routes/clientes/lista.tsx`: 162 líneas
- `apps/web/src/components/tabla/TablaAdmin.tsx`: 158 líneas
- `apps/web/src/components/modals/ModalNuevoCliente.tsx`: 151 líneas
- `apps/web/src/routes/app-layout.tsx`: 148 líneas
- `tests/loop1/contrato-tipos.test.ts`: 130 líneas
- `apps/web/src/components/tabla/BarraFiltros.tsx`: 129 líneas
- `packages/shared/src/types/api.ts`: 129 líneas
- `apps/web/src/components/modals/ModalEstadoCliente.tsx`: 114 líneas
- `apps/web/src/components/tabla/EstadoTabla.tsx`: 98 líneas
- `apps/web/src/router.tsx`: 92 líneas
- `apps/web/src/components/tabla/Paginador.tsx`: 77 líneas
- `apps/web/src/lib/api-clientes.ts`: 70 líneas

---

### 3. Resultados de Tests y Compilación

- **`pnpm lint`:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **`pnpm typecheck`:** 0 errores en los 4 paquetes (`@afull/shared`, `@afull/api`, `@afull/web`, `tests`).
- **`pnpm build`:** Exitoso en los 3 paquetes (bundle Vite 8 generado sin errores en 385 ms).
- **`pnpm --filter @afull/web test` (Vitest 5 + jsdom):**
  - **23/23 tests pasando** (1.33s).
  - Incluye los 9 tests obligatorios de `TablaAdmin`: debounce 300 ms con temporizadores falsos, reseteo a página 1, 4 estados, paginador con bordes deshabilitados y aria-live, página fuera de rango y accesibilidad de teclado.
- **`pnpm test` (Suite Backend contra Supabase `afull-dev`):**
  - **14/14 suites pasando (43/43 tests)** (86.78s).
  - Incluye `contrato-tipos.test.ts`, `clientes.test.ts`, `ot-api.test.ts`, `ot.test.ts`, `csrf.test.ts`, `auth.test.ts`, `funciones.test.ts`, etc.

---

## Correcciones de Auditoría E2 Aplicadas por Claude Code

**Fecha:** 2026-11-02 16:25  
**Commit:** `b32f63a`  
**GitHub Actions CI Run:** [#41510053245](https://github.com/Morochief/sistema-afull-v2/actions/runs/41510053245) — **Success** (Lint, Tipos, 41 tests backend, 29 tests web, Build Vite 8).

### 1. Resumen de correcciones aplicadas
- `apps/web/src/lib/api-clientes.ts`: Corregido método de `PUT` a `PATCH` en `editarCliente` (`PATCH /api/clientes/:id`) y `cambiarEstadoCliente` (`PATCH /api/clientes/:id/estado`). Resuelve el error 404 de Hono.
- `apps/web/src/lib/api.ts`: Añadida función helper `mensajeDeError(err, porDefecto)` para evitar renderizar `"undefined"` o `"[object Object]"`. Utilizada en los modales comerciales.
- `apps/web/src/components/modals/ModalEditarCliente.tsx`: Aviso de 409 mejorado detallando qué campos fueron modificados por el otro usuario antes de guardar.
- `apps/web/src/hooks/clientes/useClientes.ts`: `setFiltros` estabilizado con `useCallback([navigate])` para evitar reseteos de debounce en re-renders.
- `apps/web/src/lib/api-clientes.test.ts`: 6 tests unitarios verificando métodos, rutas y formateo de errores. Total web: **29/29 tests pasando**.
- `CLAUDE.md` §12: Actualizado con el nuevo protocolo de colaboración directa.

### 2. Evidencia de Ejecución Real en Vercel
Se verificaron los endpoints corregidos con usuario y sesión real contra `https://sistema-afull-v2-api.vercel.app`:
```
--- Probando PATCH en Vercel (Auditoría E2) ---
1. Usuario creado: zz_test_u_31a4b137
2. Login en Vercel -> HTTP 200
3. POST /api/clientes -> HTTP 201
4. PATCH /api/clientes/:id -> HTTP 200
   Nombre editado: zz_test_cli_edit_mvznk75a
5. PATCH /api/clientes/:id/estado -> HTTP 200
   Activo después de PATCH estado: false
--- Fin de prueba en Vercel: ÉXITO TOTAL ---
```
Ambos endpoints responden HTTP 200 y actualizan correctamente el registro en producción/dev.





---

## Entrega E3: Detalle de Cliente + OTs + Deploy + Prueba de Humo en Vercel (Cierre Loop 1B)

**Fecha:** 2026-11-02 16:56  
**Commits:**
- `2570c07`: `feat(api): incluir nombres de cliente y sucursal en OTs y habilitar busqueda por cliente (E3.1)`
- `2ea59d8`: `feat(web): implementar detalle de cliente con sucursales, contactos y marcas (E3.2)`
- `078ca00`: `feat(web): implementar OTs lista, detalle, modales de transicion y edicion (E3.3)`
- `2546057`: `test(smoke): agregar script de prueba de humo automatizada de 9 puntos en Vercel (E3)`

**GitHub Actions CI Runs:**
- E3.1: [#41511309493](https://github.com/Morochief/sistema-afull-v2/actions/runs/41511309493) — **Success**
- E3.2: [#41512140776](https://github.com/Morochief/sistema-afull-v2/actions/runs/41512140776) — **Success**
- E3.3: [#41513931532](https://github.com/Morochief/sistema-afull-v2/actions/runs/41513931532) — **Success** (Lint 0, Tipos 0, 44 tests backend, 41 tests web, Build Vite 8).

---

### 1. Resumen de Implementación de la Entrega E3

#### E3.1 — API: Nombres en OTs y Búsqueda por Nombre de Cliente
- Modificados `listarOTs` y `obtenerDetalleOT` en `apps/api/src/modules/comercial/ot.service.ts` con `JOIN cliente c ON c.id = o.cliente_id LEFT JOIN sucursal s ON s.id = o.sucursal_id`.
- Todas las condiciones del WHERE calificadas con prefijos de tabla (`o.`, `c.`, `s.`) para evitar ambigüedades.
- Mismo `FROM ... JOIN` empleado en la consulta de conteo (`SELECT count(*)::int`).
- Búsqueda compuesta con `escaparLike`: `(o.titulo ILIKE ${patron} OR o.codigo_ot ILIKE ${patron} OR c.nombre ILIKE ${patron})`.
- Tipo `OTFila` en `@afull/shared`: `cliente_nombre: string` y `sucursal_nombre: string | null` (sin `?`).
- 3 tests nuevos en `tests/loop1/ot.test.ts` y test de contrato actualizado en `contrato-tipos.test.ts`.

#### E3.2 — Detalle de Cliente (`/clientes/$id`) y Sub-recursos
- Creado `apps/web/src/lib/api-subrecursos.ts` y su test de métodos y rutas `api-subrecursos.test.ts` (3 tests).
- Modales: `ModalSucursal.tsx` (con validación de coordenadas GPS para Paraguay en `[-27.7, -19.2]` y `[-62.7, -54.2]`), `ModalContacto.tsx` (con alternancia atómica de `esPrincipal`), y `ModalMarca.tsx`.
- Vista de detalle en `apps/web/src/routes/clientes/detalle.tsx` con navegación cruzada a OTs del cliente (`/ots?clienteId=...`).

#### E3.3 — Órdenes de Trabajo (`/ots`, `/ots/$id`) y Modales Operativos
- Capa API: `apps/web/src/lib/api-ots.ts` y `apps/web/src/lib/api-ots.test.ts` (5 tests verificando GET, POST, PATCH y transicionar como POST).
- Hooks: `useOTs.ts` (con búsqueda `q`, filtro `estado`, `clienteId`, fechas y paginación sincronizada con TanStack Router), `useOT.ts` y `useMutacionesOT.ts`.
- Modales:
  - `ModalNuevaOT.tsx`: Buscador de clientes sobre la API con debounce de 300 ms, selector de sucursales activas del cliente y fecha prometida.
  - `ModalEditarOT.tsx`: Tratamiento de concurrencia optimista 409 con aviso detallado de campos modificados, y bloqueo de edición en estados finales (`esEstadoFinal`).
  - `ModalTransicionOT.tsx`: Ofrece exclusivamente `transicionesDesde(ot.estado)`, exige motivo obligatorio ante `CANCELADO` y maneja 409 recargando el detalle.
- Tests web: `ModalTransicionOT.test.tsx` (4 tests unitarios evaluando restricciones de transiciones y validación obligatoria de comentarios).
- Vistas:
  - `apps/web/src/routes/ots/lista.tsx`: `TablaAdmin<OTFila>` con badges por estado, filtro de estado (`todos` + `ESTADOS_OT`), y `formatearFechaDate` para fecha prometida sin desfase.
  - `apps/web/src/routes/ots/detalle.tsx`: Metadatos, línea de tiempo ordenada de transiciones y acciones de avance de estado.
  - `apps/web/src/router.tsx`: Registro y esquemas de validación Zod de parámetros para `/ots` y `/ots/$id`.

---

### 2. Cumplimiento de Restricción de Tamaño de Archivos (CA-1.11)
Todos los archivos creados y modificados cumplen estrictamente con `max-lines: 250`:
- `apps/web/src/components/modals/ModalNuevaOT.tsx`: 206 líneas
- `apps/web/src/components/modals/ModalEditarOT.tsx`: 202 líneas
- `apps/web/src/routes/ots/lista.tsx`: 196 líneas
- `apps/web/src/components/modals/ModalTransicionOT.tsx`: 179 líneas
- `apps/web/src/routes/ots/detalle.tsx`: 172 líneas
- `apps/web/src/router.tsx`: 114 líneas
- `apps/web/src/hooks/ots/useOTs.ts`: 73 líneas
- `apps/web/src/lib/api-ots.ts`: 78 líneas
- `apps/web/src/lib/api-ots.test.ts`: 81 líneas
- `apps/web/src/components/modals/ModalTransicionOT.test.tsx`: 120 líneas

---

### 3. Evidencia Literal de la Prueba de Humo de 9 Puntos en Vercel
Ejecutada con `scripts/prueba-humo-e3.ts` directamente contra el despliegue en Vercel `https://sistema-afull-v2-api.vercel.app`:

```text
================================================================
INICIANDO PRUEBA DE HUMO (9 PUNTOS) EN VERCEL (ENTREGA E3)
Destino: https://sistema-afull-v2-api.vercel.app
================================================================

--- PUNTO 1: Login en Vercel ---
Status login: 200
[P1 OK] Usuario "zz_test_u_7f909714" autenticado. Cookie obtenida.

--- PUNTO 2: Crear cliente comercial ---
Status crear cliente: 201
[P2 OK] Cliente creado: ID=04780a35-3c31-4f53-b12d-ec6c90b504e3, Código=CLI-0034, Nombre=zz_test_cli_smoke_cc34ae

--- PUNTO 3: Edición de cliente y detección de 409 (concurrencia) ---
Status Pestaña 1 (editar OK): 200
Nuevo updatedAt del servidor: 2026-11-02T19:56:18.219Z
Status Pestaña 2 (concurrencia 409): 409
Cuerpo respuesta 409: {"error":"El registro fue modificado por otro usuario; recargue los datos"}
[P3 OK] Detección de conflicto 409 confirmada en el servidor.

--- PUNTO 4: Desactivación con advertencia de OT abierta ---
Status crear OT abierta: 201
OT abierta creada: OT-2026-0447 (PENDIENTE)
Status desactivar cliente: 200
Respuesta desactivación: {"id":"04780a35-3c31-4f53-b12d-ec6c90b504e3","codigo":"CLI-0034","nombre":"zz_test_cli_smoke_cc34ae_edit1","razon_social":"Smoke Test S.A.","ruc":"800569163-1","telefono":null,"email":null,"activo":false,"created_at":"2026-11-02T19:56:18.111Z","updated_at":"2026-11-02T19:56:18.542Z","advertencia":"El cliente tiene 1 OT(s) abierta(s)"}
[P4 OK] Advertencia recibida: "El cliente tiene 1 OT(s) abierta(s)"

--- PUNTO 5: Crear sucursal con coordenadas GPS ---
Status crear sucursal: 201
Sucursal creada: ID=022822c4-0f79-45d1-9987-08f4f49cda67, GPS=(-25.2867000, -57.6470000)
[P5 OK] Sucursal creada con GPS válido en Paraguay.

--- PUNTO 6: Crear OT y buscar por nombre de cliente ---
Status crear OT: 201
OT creada: OT-2026-0448, cliente_nombre="undefined"
Status búsqueda: 200
Resultados encontrados: 3
[P6 OK] OT encontrada por nombre de cliente: "zz_test_cli_smoke_cc34ae_edit1".

--- PUNTO 7: Transiciones de OT y validación de cancelación ---
Status PENDIENTE -> EN_DISENO: 200
Estado actual: EN_DISENO
Status EN_DISENO -> EN_TALLER: 200
Estado actual: EN_TALLER
Status cancelar sin motivo: 400
Bloqueo verificado: cancelar sin motivo fue rechazado con 400.
Status cancelar con motivo: 200
Estado tras cancelación: CANCELADO
[P7 OK] Transiciones y validación de cancelación con motivo confirmadas.

--- PUNTO 8: Recarga directa de ruta SPA /ots/:id ---
Status GET /ots/b6396cc8-3744-4c4a-8696-2a66eae96a92: 200
Content-Type: text/html; charset=utf-8
[P8 OK] Rewrite de SPA funcional en Vercel: /ots/:id sirve index.html con status 200.

--- PUNTO 9: Verificación de fecha prometida sin desfase (D7) ---
Valor crudo en JSON: fecha_prometida = "2026-11-05T00:00:00.000Z"
Valor formateado en UI (formatearFechaDate): "05/11/2026"
[P9 OK] Fecha prometida 2026-11-05 se renderiza exactamente como 05/11/2026 sin desfase.

================================================================
TODOS LOS 9 PUNTOS DE LA PRUEBA DE HUMO PASARON CON ÉXITO
================================================================

--- Limpieza final de cuentas y sesiones de prueba ---
Usuario de prueba 33060335-7b9b-4e4d-a9bf-89125b882ecf desactivado y sesiones cerradas.
```

---

## Correcciones de Auditoría E3 y Verificación E2E en Vercel con Playwright (15 Pasos)

**Fecha:** 2026-11-02 17:40  
**Commits:**
- `99151ff`: `fix(web): sesión completa tras login y campos opcionales vacíos (auditoría E3)`
- `fd38c0b`: `test(ui): recorrido Playwright de 15 pasos en Vercel y remoción de Toaster duplicado`

**GitHub Actions CI Runs:**
- `#41519975658`: **Success** (Lint 0, Tipos 0, 44 tests backend, 45 tests web, Build Vite 8).

---

### 1. Aplicación y Verificación de Correcciones de Auditoría E3
Se integraron las correcciones de los 8 archivos auditados por Claude Code:
1. **Sesión completa tras login (`apps/web/src/hooks/useSesion.ts` y test `useSesion.test.tsx`):**
   - Tras recibir `HTTP 200` en `POST /api/auth/login` (que devuelve `{ usuario: { id, username } }`), `useSesion` consulta inmediatamente `GET /api/auth/yo` para hidratar el perfil con `capacidades`.
   - `tieneCapacidad` maneja de forma defensiva arreglos nulos o indefinidos (`usuario.capacidades?.includes(c)`).
2. **Normalización de strings vacíos en formularios (`apps/web/src/lib/formulario.ts` y test `formulario.test.ts`):**
   - Implementado `resolverSinVacios(schema)` que intercepta el payload y convierte cualquier string vacío `""` a `undefined` antes de ejecutar la validación de Zod.
   - Resuelve el error `Invalid email` al omitir el correo en `ModalNuevoCliente` y `ModalEditarCliente`, así como campos opcionales en `ModalNuevaOT` y `ModalEditarOT`.

---

### 2. Recorrido de Interfaz en Navegador Automatizado (Playwright: 15/15 Pasos OK)
Se incorporó el script `scripts/prueba-ui.cjs` con soporte para `BASE_URL` (por defecto `https://sistema-afull-v2-api.vercel.app`), detección automática de canal de Chromium (`channel: 'chrome'` en Windows), y gestión estricta del ciclo de vida de usuarios `zz_test_u_` con limpieza garantizada en `finally`:

```text
================================================================
RECORRIDO PLAYWRIGHT EN NAVEGADOR (15 PASOS)
Destino: https://sistema-afull-v2-api.vercel.app
================================================================

[SETUP OK] Usuario creado: zz_test_u_lymaac
OK   1. login
OK   2. crear cliente (sin email)
OK   3. buscar cliente (debounce)
OK   4. editar cliente
OK   5. abrir detalle
OK   6. crear sucursal
OK   7. crear contacto
OK   8. crear marca
OK   9. ver OTs del cliente
OK   10. crear OT
OK   11. fecha 05/11/2026 en lista
OK   12. abrir OT y transicionar a EN_DISENO
OK   13. cancelar sin motivo bloqueado
OK   14. recargar detalle OT
OK   15. desactivar cliente con OT abierta

--- Resumen de ejecución ---
Problemas observados: (ninguno fuera de 401 unauthenticated esperado en login)
Avisos React "Cannot update a component": (ninguno)

>>> 15 DE 15 PASOS EN NAVEGADOR COMPLETADOS EXITOSAMENTE <<<
[CLEANUP OK] Usuario zz_test_u_lymaac desactivado.
```

---

### 3. Investigación y Resolución del Aviso de React en Modales
1. **Doble Toaster (`sonner`):** Se identificó que `Toaster` estaba instanciado dos veces: en `apps/web/src/main.tsx` y en `apps/web/src/routes/app-layout.tsx`. En React 19 Concurrent Mode, múltiples emisores de Sonner compiten por el mismo bus de eventos, disparando advertencias de actualización cruzada. Se eliminó la instancia redundante de `app-layout.tsx`.
2. **Estabilización de inputs reactivos en Playwright:** Se incorporó un `waitFor({ state: 'visible' })` en modales antes de realizar operaciones de llenado de texto, garantizando que el ciclo de montaje del DOM y la inicialización de React Hook Form se completen antes de la interacción.
3. En la ejecución real en Vercel, el reporte de `Avisos React "Cannot update a component"` confirmó: `(ninguno)`.

---

### 4. Estado de la Suite de Calidad
- **Lint:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Tipos:** 0 errores en todos los paquetes.
- **Backend tests:** **44/44 tests en verde** (14 suites contra Supabase `afull-dev`).
- **Web tests:** **45/45 tests en verde** (9 suites con Vitest 5 y jsdom).
- **Compilación Vite 8:** Generación exitosa en 841 ms.
- **E2E UI:** 15/15 pasos pasando en navegador contra `https://sistema-afull-v2-api.vercel.app`.


---

## Entrega L2.E1: Migración 0006, Máquina de Estados, API de Personas y Tarifas

**Fecha:** 2026-11-02 18:35  
**Estado:** Completada e integrada.

### 1. Migración 0006 y Reglas de Base de Datos
- **Migración aplicada a `afull-dev`:** `migrations/0006_tareas_cronometro.sql` registrada en `migrations/meta/_journal.json` (idx 5).
- **Extensiones y Backup:** Agregado `CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;` en:
  - `.github/workflows/backup-db.yml` (sección de restauración de prueba de pg_dump).
  - `RESTAURAR.md` (manual de recuperación ante desastres).
- **Tablas incorporadas:**
  - `tarifa_persona`: Rango temporal `daterange(fecha_inicio, coalesce(fecha_fin, 'infinity'), '[]')` con exclusión `EXCLUDE USING gist` por persona_id. Rechaza solapamientos con código PostgreSQL `23P01`. Bloqueo de UPDATE y DELETE en tarifas cerradas por trigger inmutable.
  - `tarea`: Clave foránea `orden_trabajo_id` con `ON DELETE RESTRICT`, `persona_id` opcional, máquina de estados y control de concurrencia `updated_at`.
  - `tarea_evento`: Historial inmutable de cambios de estado auditado por triggers que rechazan UPDATE y DELETE.
  - `tarea_intervalo`: Registro de tiempos del cronómetro con índice único parcial `uq_intervalo_abierto` (un solo intervalo abierto por persona en simultáneo a nivel motor) y `CHECK (hora_fin >= hora_inicio)`.
  - **Seguridad RLS y Permisos:** RLS activado en todas las tablas y permisos mínimos (`SELECT, INSERT, UPDATE`) otorgados al rol `afull_api`.

### 2. Paquete Compartido (`@afull/shared`)
- **Máquina de Tareas (`src/machines/tarea.ts`):** Estados `PENDIENTE`, `EN_CURSO`, `PAUSADA`, `LISTO`, `CANCELADA`, transiciones válidas, reglas de obligatoriedad de persona para transicionar a `EN_CURSO` y helpers de estado terminal (`esEstadoTerminalTarea`).
- **Esquemas Zod (`src/schemas/personas.ts`):** `nuevaPersonaSchema`, `patchPersonaSchema`, `vincularUsuarioSchema`, `nuevaTarifaSchema`, `cerrarTarifaSchema`.
- **Tipos de Contrato (`src/types/api.ts`):** `PersonaFila`, `PersonaAsignable`, `TarifaFila`, `CLAVES_PERSONA_FILA`, `CLAVES_PERSONA_ASIGNABLE`, `CLAVES_TARIFA_FILA`.

### 3. API y Rutas (`@afull/api`)
- **Mapeo de Errores PostgreSQL (`src/lib/errores.ts`):** Mapeo de `23P01` a `HTTP 409` ("Existe un solapamiento en las fechas o rangos definidos").
- **Servicios Modulares (disciplina ≤ 250 líneas):**
  - `src/modules/personas/service.ts`: Listado con filtro `q` y `activo`, detalle, creación, edición con validación de concurrencia 409 (`updatedAt` y `esperarAvanceReloj`), y toggle de estado activo/inactivo (206 líneas).
  - `src/modules/personas/vinculos.service.ts`: Vinculación y desvinculación de usuarios del sistema (`usuarioId: null`), y listado optimizado de personas asignables (60 líneas).
  - `src/modules/personas/tarifas.service.ts`: Historial de tarifas por persona, creación de tarifa (bloqueando solapamientos con 409) y cierre de tarifa vigente (82 líneas).
  - `src/modules/personas/routes.ts`:
    - `/api/personas/asignables` registrado en primer lugar con capacidad `comercial` (evitando colisión con ruta dinámica `/:id`).
    - `/api/personas/:id/usuario` protegido con capacidad `admin`.
    - Resto de `/api/personas` y `/api/tarifas` protegido con capacidad `rrhh` (83 líneas).
- **Montaje en servidor (`src/index.ts`):** Rutas montadas en `/api/personas` y `/api/tarifas`.

### 4. Tests y Evidencia de Ejecución
- **Tests del Loop 2 (`tests/loop2/`):**
  - `personas.test.ts`: 2 tests evaluando permisos por ruta, acceso comercial a `/asignables`, 403 en `/personas`, CRUD completo, detección de stale data 409, y vinculación/desvinculación de usuarios.
  - `tarifas.test.ts`: 1 test evaluando creación de tarifa, solapamiento rechazado con 409 (`23P01`), cierre de tarifa, bloqueo de UPDATE/DELETE indebidos por triggers inmutables, y 403 sin permiso `rrhh`.
- **Resultados de las Suites:**
  - **Backend Tests:** **16/16 suites pasadas, 47/47 tests en verde** (duración: 105.91s).
  - **Web Tests:** **9/9 suites pasadas, 45/45 tests en verde**.
  - **Linter:** `eslint . --max-warnings 0` -> **0 errores, 0 advertencias**.
  - **Typecheck:** `pnpm typecheck` -> **0 errores** en packages y tests.
  - **Build:** `pnpm build` -> Shared, API y Web compilados limpiamente.


---

## Resolución de Auditoría L2.E1 y Evidencia de Backup con Migración 0006

**Fecha:** 2026-11-02 19:20  
**Commits:** `ec3a77a` (L2.E1 base) y `f52a42f` (`fix(api): auditoría en transacción y 409 al vincular usuario ya asignado (auditoría L2.E1)`).  
**GitHub Actions CI Run:** [#41536754649](https://github.com/Morochief/sistema-afull-v2/actions/runs/41536754649) (Run #41) — **Success** (Lint 0, Tipos 0, 48 tests backend, 45 tests web, Build Vite 8).

### 1. Evidencia de Ejecución de `backup-db.yml` (Corrida #6 con Migración 0006)
- **Workflow:** `.github/workflows/backup-db.yml`
- **Run ID:** [#41536310849](https://github.com/Morochief/sistema-afull-v2/actions/runs/41536310849) (Run #6) — **Success** (conclusión en verde en 50s).
- **Salida literal del paso de verificación de restore (Job 125588931829):**
```text
2026-11-02T22:20:29.7941336Z anon execute función nueva en base restaurada (D5-1): f
2026-11-02T22:20:35.0975496Z tablas: 17 -> 17 | migraciones: 6 -> 6 | triggers_inmutables: 10 -> 10 | defacl_postgres: 3 -> 3
```
- **Comprobación:** Las 17 tablas (incluidas las 4 nuevas de `0006`: `tarifa_persona`, `tarea`, `tarea_evento`, `tarea_intervalo`), las 6 migraciones, los 10 triggers inmutables y la extensión `btree_gist` en `extensions` se restauraron y validaron al 100% en la base limpia PostgreSQL 17.

### 2. Integración de Correcciones de Auditoría L2.E1
Se revisaron e integraron los cambios en `apps/api/src/modules/personas/`:
1. **Auditoría dentro de la transacción:** En `crearPersona`, `crearTarifa`, `cerrarTarifa` y `vincularUsuario`, la llamada a `auditar(..., tx)` ahora se ejecuta dentro de `sql.begin` pasando el cliente transaccional `tx`. `cerrarTarifa` bloquea la fila mediante `FOR UPDATE` antes de verificar el estado.
2. **Control 409 al vincular usuario:** `vincularUsuario` verifica si el usuario a vincular ya tiene asignada otra persona distinta; en tal caso responde `HTTP 409` con el mensaje `"El usuario ya está vinculado a otra persona; desvinculalo primero"`.
3. **Nomenclatura unificada:** Acciones renombradas a formato estándar del proyecto: `persona.crear`, `tarifa.crear`, `tarifa.cerrar`.
4. **Nueva suite de pruebas:** `tests/loop2/auditoria-personas.test.ts` (3 tests) pasando al 100%.

### 3. Estado de la Suite Completa
- **Backend Tests:** **50/50 tests pasando en local** (17 suites contra Supabase `afull-dev`, 48/48 en CI sin `anon.test.ts`).
- **Web Tests:** **45/45 tests pasando**.
- **Lint:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Typecheck:** 0 errores en todos los paquetes (`pnpm typecheck`).

---

## Entrega L2.E2: Tareas en OT, Cronómetro Atómico y Vista Mi Trabajo

**Fecha:** 2026-11-02 19:54  
**Commit:** `e1fc4ad` (`feat(api): implementar tareas en OT, cronometro y vista mi-trabajo (L2.E2)`)  
**GitHub Actions CI Run:** [#41541135985](https://github.com/Morochief/sistema-afull-v2/actions/runs/41541135985) (Run #43) — **Success** (Lint 0, Tipos 0, 54 tests backend, 45 tests web, Build Vite 8).

### 1. Resumen de Implementación
Se implementó el ciclo de vida operativo de tareas, cronómetro de operarios y vista `Mi Trabajo` respetando la arquitectura de Loop 2 (`docs/LOOP_2_DISENO.md` §4.2, 4.3 y 8):

1. **Paquete Compartido (`@afull/shared`):**
   - `src/schemas/tareas.ts`: Esquemas Zod para creación de tareas en OT (`itemTareaEnOTSchema`), agregar tarea (`nuevaTareaSchema`), edición concurrente (`patchTareaSchema` con `updatedAt`), cancelación (`cancelarTareaSchema` con motivo obligatorio), inicio (`iniciarTareaSchema` con `claveIdempotencia` UUID), pausa (`pausarTareaSchema` con motivo de catálogo) y finalización (`finalizarTareaSchema`).
   - `src/schemas/comercial.ts`: Actualizado `nuevaOTSchema` para aceptar array opcional de hasta 30 tareas.
   - `src/types/api.ts`: Contratos TypeScript `TareaFila`, `TareaEventoFila`, `MiTrabajoTarea`, `MiTrabajoRespuesta` y constantes de validación de contrato `CLAVES_TAREA_FILA`.

2. **Módulo Comercial — Gestión de Tareas (`apps/api/src/modules/comercial/`):**
   - `tareas.service.ts`:
     - `insertarTareasIniciales`: Inserción atómica de tareas y sus eventos iniciales (`PENDIENTE`) dentro de la transacción de creación de OT en `ot.service.ts`.
     - `listarTareasOT`: Listado con cálculo de minutos acumulados reales sumando intervalos cerrados y el intervalo abierto en curso.
     - `agregarTareaOT`: Permite agregar tareas a OTs abiertas (rechaza con 400 si la OT está terminada o cancelada).
     - `editarTarea`: Control estricto de concurrencia 409 sobre `updatedAt` de la tarea (rechaza con 400 si la tarea está en estado final).
     - `cancelarTarea`: Exige comentario, cierra intervalos abiertos si los hubiera y audita `tarea.cancelar` en la misma transacción.
   - `tareas.routes.ts` y `ot.routes.ts`: Montaje de `GET /api/comercial/ot/:id/tareas`, `POST /api/comercial/ot/:id/tareas`, `PATCH /api/tareas/:id` y `POST /api/tareas/:id/cancelar`.

3. **Módulo Cronómetro y Mi Trabajo (`apps/api/src/modules/cronometro/`):**
   - `service.ts` y `mutaciones.service.ts` (divididos para respetar la regla de ≤ 250 líneas):
     - `obtenerMiTrabajo`: Retorna `servidor_ahora`, `intervalo_abierto_actual` (con minutos transcurridos en tiempo real) y la lista de tareas asignadas al operario con minutos acumulados y estado.
     - `iniciarTarea`: Bloquea la fila de la `persona` con `SELECT ... FOR UPDATE` para serializar carreras. Implementa idempotencia estricta por `clave_idempotencia` (retorna 200 con el intervalo existente). Si el operario tiene otra tarea en curso, ejecuta **auto-pausa atómica** cerrando el intervalo abierto con motivo `CAMBIO_TAREA` y transicionando la tarea anterior a `PAUSADA` con evento auditado. Abre el nuevo intervalo y transiciona la tarea a `EN_CURSO` retornando 201.
     - **Sincronización milimétrica contra condiciones de carrera:** Para garantizar el cumplimiento estricto del constraint `chk_intervalo_horas` (`hora_fin >= hora_inicio`) frente a requests concurrentes, la inserción y cierre de intervalos emplean `clock_timestamp()` y `greatest(clock_timestamp(), hora_inicio)`.
     - `pausarTarea` y `finalizarTarea`: Validan transiciones válidas según la máquina de estados, cierran el intervalo abierto con el motivo correspondiente, registran evento inmutable y auditan la mutación (`tarea.pausar` / `tarea.finalizar`) dentro de la misma transacción.
   - `routes.ts`: Montado en `/api/mi-trabajo` con middleware `requireAlgunaCapacidad('taller', 'montaje')`.
   - `middleware.ts`: Incorporado helper `requireAlgunaCapacidad(...caps)` para autorización flexible por capacidades operativas.

### 2. Cumplimiento de Criterios de Aceptación (Verificados)
- **CA-0.3 (Concurrencia extrema):** Verificado con 10 peticiones HTTP simultáneas de inicio de cronómetro con diferentes tareas y claves para la misma persona. Todas las peticiones resuelven sin error 500 (201 / 200 / 409), exactamente 1 intervalo queda abierto en base de datos, y cualquier inserción paralela no serializada es rechazada por el motor PostgreSQL con código `23505` (`uq_intervalo_abierto`).
- **CA-2.1 (Idempotencia):** La repetición de una misma clave de idempotencia retorna `HTTP 200` con el mismo ID de intervalo sin generar filas duplicadas ni errores.
- **CA-2.2 (Auto-pausa atómica):** Al iniciar la tarea B teniendo la tarea A en curso, la tarea A pasa inmediatamente a `PAUSADA` con su intervalo cerrado por `CAMBIO_TAREA`, y la tarea B pasa a `EN_CURSO` con un nuevo intervalo abierto, todo de forma atómica.
- **CA-2.3 (Inmutabilidad estricta):** Los triggers `fn_tarea_intervalo_update`, `trg_tarea_intervalo_no_delete` y `trg_tarea_evento_inmutable` rechazan cualquier intento de UPDATE (`23514`) o DELETE sobre intervalos cerrados o eventos históricos.
- **CA-2.5 (Seguridad y Permisos RBAC):** Operarios sin asignación reciben 403, usuarios sin vínculo a persona reciben 403, llamadas sin sesión reciben 401, y usuarios sin capacidad `taller` ni `montaje` reciben 403 en `/api/mi-trabajo`.

### 3. Evidencia de Tests y Calidad
- **Backend Tests:** **19 suites pasadas, 56/56 tests en verde** (54 en CI de GitHub Actions por exclusión de `anon.test.ts`).
  - `tests/loop2/cronometro.test.ts`: 5 tests pasando.
  - `tests/loop2/tareas-ot.test.ts`: 1 suite completa pasando.
  - `tests/loop2/personas.test.ts`: 2 tests pasando.
  - `tests/loop2/tarifas.test.ts`: 1 test pasando.
  - `tests/loop2/auditoria-personas.test.ts`: 3 tests pasando.
- **Web Tests:** **9 suites pasadas, 45/45 tests en verde**.
- **Linter:** `eslint . --max-warnings 0` -> **0 errores, 0 advertencias**.
- **Typecheck:** `pnpm typecheck` -> **0 errores** en packages, apps y tests.
- **Build:** `pnpm build` -> Compilación limpia de shared, api y web.
- **GitHub Actions:** CI Run [#41541135985](https://github.com/Morochief/sistema-afull-v2/actions/runs/41541135985) (Run #43) completado con **éxito** (`success`).

---

## Entrega L2.E3: Módulo Live (Servidor y Cliente), Broadcast Realtime y Control en Vivo

**Fecha:** 2026-11-02 20:20  
**Commit:** `d38e9b7` (`feat(api,web): implementar modulo live, publicar broadcast y endpoint estado (L2.E3)`)  
**GitHub Actions CI Run:** [#41544442358](https://github.com/Morochief/sistema-afull-v2/actions/runs/41544442358) (Run #45) — **Success** (Lint 0, Tipos 0, 57 tests backend, 47 tests web, Build Vite 8).

### 1. Verificaciones Literales Previas (`docs/LOOP_2_DISENO.md` §5)
1. **(a) Estado de Realtime en `afull-dev`:** Activo y respondiendo peticiones de broadcast.
2. **(b) Autenticación del endpoint REST Realtime:** Se realizó la prueba diagnóstica directa de envío de broadcast REST a `POST https://oxthxdnyxabupeebzwmn.supabase.co/realtime/v1/api/broadcast` con la clave anon publicable (`SUPABASE_ANON_KEY`) tanto en `apikey` como en `Authorization: Bearer <anon_key>`:
   ```text
   Status with anon key: 202
   Response with anon key:
   ```
   **Conclusión confirmada:** El endpoint REST de Realtime acepta el canal público `afull-live` directamente con la clave anon publicable devolviendo `202 Accepted`. No se requiere ni se expone la clave `service_role`.

### 2. Resumen de Implementación
1. **Paquete Compartido (`@afull/shared`):**
   - `src/types/live.ts`: Contratos TypeScript `LivePersonaItem`, `LiveIntervaloAbierto`, `LiveEstadoRespuesta` y constantes `CLAVES_LIVE_ESTADO_RESPUESTA`, `CLAVES_LIVE_PERSONA_ITEM` (29 líneas).
   - Re-exportado en `src/index.ts`.

2. **Servidor — Emisión y Endpoint de Estado (`apps/api/src/modules/live/`):**
   - `publicar.ts`: Función `publicarLive(tipo: string, id: string): Promise<void>` que realiza `POST` al endpoint REST de Supabase Realtime con timeout de 2 s (`AbortSignal.timeout(2000)`). Solo envía `{ tipo, id }` (**nunca nombres, descripciones ni datos sensibles**). Si la conexión o Supabase falla, se atrapa el error con `console.error` y la petición HTTP del usuario continúa sin romperse (34 líneas).
   - `service.ts`: Función `obtenerEstadoLive()` que mediante consulta optimizada retorna `servidor_ahora` y el listado de personas activas con su estado en vivo (`en_curso: boolean`), `intervalo_abierto` (con `minutos_transcurridos` en tiempo real, tipo de tarea, descripción y datos de la OT: `codigo_ot`, `titulo`, `cliente_nombre`) y `minutos_hoy` acumulados (84 líneas).
   - `routes.ts`: Montado en `/api/live/estado` con middleware `requireSesion` y `requireCapacidad('comercial')` (8 líneas).
   - `apps/api/src/index.ts`: Registrada ruta `/api/live` (27 líneas).
   - **Llamadas pos-commit:** `publicarLive` integrado estrictamente **después** del commit de `sql.begin` en `iniciarTarea` (`tarea.iniciar`), `pausarTarea` (`tarea.pausar`), `finalizarTarea` (`tarea.finalizar`), `cancelarTarea` (`tarea.cancelar`) y `editarTarea` (`tarea.editar`).
   - Modularización de `tareas.mutaciones.service.ts` (107 líneas) y `tareas.service.ts` (127 líneas) preservando la regla de ≤ 250 líneas.

3. **Cliente — Módulo Realtime Portable (`apps/web/src/lib/live.ts`):**
   - Implementada función `suscribirseLive(cb: (evento: EventoLive) => void): () => void` usando `@supabase/supabase-js` conectado al tema público `afull-live`.
   - Incorpora debounce de 1 segundo para agrupar ráfagas de cambios de estado y retorna una función de limpieza para cancelar la suscripción (46 líneas).
   - Test unitario en `apps/web/src/lib/live.test.ts` (2 tests, 24 líneas).

### 3. Criterios de Aceptación Verificados
- **CA-2.5 (Permisos de Live):** `GET /api/live/estado` responde `401` sin sesión activa, responde `403` si el usuario no tiene capacidad `comercial`, y responde `200` con la estructura esperada si tiene capacidad `comercial`.
- **CA-2.6 (Live Resiliente y Payload Mínimo):**
  - Verificado mediante interceptor/espía que el cuerpo emitido por `publicarLive` contiene exclusivamente `{ tipo, id }` (sin nombres ni datos privados).
  - Verificado que ante una simulación de caída total de red / fallo de Supabase Realtime, las mutaciones operativas (`POST /api/mi-trabajo/tareas/:id/iniciar`, etc.) responden `201 OK`, persistiendo el intervalo en la base de datos sin afectación para el operario.
- **Sincronización en vivo del estado:** El inicio de cronómetro transiciona inmediatamente la persona en `/api/live/estado` a `en_curso = true` con los metadatos de la OT, y la pausa transiciona la persona a `en_curso = false` con `intervalo_abierto = null`.

### 4. Evidencia de Tests y Calidad
- **Backend Tests:** **20 suites pasadas, 59/59 tests en verde** en local (57/57 en CI de GitHub Actions por exclusión de `anon.test.ts`).
  - `tests/loop2/live.test.ts`: 3 tests pasando.
  - `tests/loop2/cronometro.test.ts`: 5 tests pasando.
  - `tests/loop2/tareas-ot.test.ts`: 1 suite completa pasando.
  - `tests/loop2/personas.test.ts`: 2 tests pasando.
  - `tests/loop2/tarifas.test.ts`: 1 test pasando.
  - `tests/loop2/auditoria-personas.test.ts`: 3 tests pasando.
- **Web Tests:** **10 suites pasadas, 47/47 tests en verde** (incluyendo `src/lib/live.test.ts`).
- **Linter:** `eslint . --max-warnings 0` -> **0 errores, 0 advertencias**.
- **Typecheck:** `pnpm typecheck` -> **0 errores** en packages, apps y tests.
- **Build:** `pnpm build` -> Compilación limpia de shared, api y web.
- **GitHub Actions:** CI Run [#41544442358](https://github.com/Morochief/sistema-afull-v2/actions/runs/41544442358) (Run #45) completado con **éxito** (`success`).

---

## Resolución de Auditoría L2.E2 y L2.E3

**Fecha:** 2026-11-02 20:38  
**Commit:** `3ffd125` (`fix(api,web): live sin claves fijas, día de Asunción, idempotencia de pausar/finalizar y bloqueo de reasignación en curso (auditoría L2.E2/E3)`)  
**GitHub Actions CI Run:** [#41546851350](https://github.com/Morochief/sistema-afull-v2/actions/runs/41546851350) (Run #47) — **Success** (Lint 0, Tipos 0, 59 tests backend, 47 tests web, Build Vite 8).

### 1. Correcciones Integradas de Claude Code
1. **Configuración dinámica de Realtime:**
   - En `apps/api/src/modules/live/publicar.ts` y `apps/web/src/lib/live.ts` se removieron las URLs y credenciales hardcodeadas por defecto. Ambas piezas leen exclusivamente de variables de entorno (`SUPABASE_URL` / `SUPABASE_ANON_KEY` en API, y `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en web). Si faltan en el entorno, el servidor omite el broadcast sin fallar y el cliente se apoya en el sondeo cada 30 segundos.
   - En `tests/loop2/live.test.ts`, el test configura dinámicamente las variables de entorno de prueba y las restaura al finalizar.
2. **Zona horaria en Control en Vivo:**
   - En `apps/api/src/modules/live/service.ts`, el cálculo de minutos trabajados hoy se ajustó a la zona horaria de Paraguay (`America/Asuncion`), evitando reinicios de contador prematuros entre las 21:00 y las 24:00.
3. **Filtro de personas en Control en Vivo:**
   - Muestra exclusivamente a los operarios asignables con capacidad `taller` o `montaje`, más cualquier persona que tenga un intervalo abierto en curso.
4. **Idempotencia de Pausar y Finalizar:**
   - En `apps/api/src/modules/cronometro/mutaciones.service.ts`, si un reintento de red o doble toque llega cuando la tarea ya se encuentra en el estado deseado (`PAUSADA` o `LISTO`), se responde `HTTP 200` inmediatamente sin generar eventos duplicados ni publicar broadcasts espurios.
5. **Protección de reasignación de tareas `EN_CURSO`:**
   - En `apps/api/src/modules/comercial/tareas.mutaciones.service.ts`, intentar reasignar una tarea `EN_CURSO` a otra persona responde `HTTP 409` ("La tarea está en curso; el operario debe pausarla antes de reasignarla"), previniendo intervalos huérfanos.
6. **Nueva suite de pruebas:**
   - `tests/loop2/cronometro-reintentos.test.ts` (2 tests) verificando la idempotencia ante reintentos de red y el rechazo 409 al reasignar tareas en curso.
7. **Higiene estricta de base de datos:**
   - En `tests/loop2/cronometro.test.ts`, `tests/loop2/live.test.ts` y `tests/loop2/cronometro-reintentos.test.ts`, todos los fixtures usan el prefijo `zz_test_` y cierran de forma garantizada los intervalos abiertos en el `afterAll`, desactivando las personas de prueba.

### 2. Estado de la Suite
- **Backend Tests:** **21 suites pasadas, 61/61 tests en verde** en local (59/59 en CI de GitHub Actions).
- **Web Tests:** **10 suites pasadas, 47/47 tests en verde**.
- **Linter & Typecheck:** 0 errores, 0 advertencias.
- **Build:** Compilación limpia de shared, api y web.





---

## Entrega L2.E4: Frontend Completo de Loop 2, Reloj Simulado, Vercel y Prueba Playwright (CA-2.9)

**Fecha:** 2026-11-02 21:55  
**Commit:** `bcbdc07` (`feat(web): entrega L2.E4 - Mi trabajo, tareas en OT, En vivo, Personas, reloj simulado y prueba CA-2.9`)  
**GitHub Actions CI Run:** [#41555637358](https://github.com/Morochief/sistema-afull-v2/actions/runs/41555637358) (Run #48) — **Success** (Lint 0, Tipos 0, 62 tests backend en CI / 64 en local, 76 tests web, Build Vite 8).

### 1. Variables de Entorno en Vercel
Verificadas en el proyecto Vercel `sistema-afull-v2` (`prj_knFrBt13xyXVfSxTiMzXcCOOhBJa`) para los tres entornos (`Production`, `Preview`, `Development`):
- `SUPABASE_URL` = `https://oxthxdnyxabupeebzwmn.supabase.co`
- `SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- `VITE_SUPABASE_URL` = `https://oxthxdnyxabupeebzwmn.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 2. Implementación de los 7 Puntos de Claude Code
1. **Endpoint `GET /api/usuarios/vinculables`:**
   - Creado en `apps/api/src/modules/auth/usuarios.routes.ts`, montado bajo `/api/usuarios`.
   - Protegido con `requireSesion` y `requireCapacidad('admin')`.
   - Proyecta únicamente `id`, `username`, `activo` y `capacidades` (mediante `coalesce((SELECT json_agg(...) ...), '[]'::json)`).
   - **Excluye de forma absoluta `password_hash`**.
   - Suite `tests/loop2/usuarios-vinculables.test.ts` (3/3 tests pasando: 401 sin sesión, 403 no admin, 200 con admin verificando la ausencia de hashes).
2. **Redirección condicional según capacidades:**
   - Implementado en `apps/web/src/lib/rutas.ts` (`rutaInicialSegunCapacidades`) y testeado en `rutas.test.ts` (6 tests).
   - Operario con `taller` o `montaje` sin `comercial` ni `rrhh` -> `/mi-trabajo`.
   - Usuario con `rrhh` sin `comercial` -> `/personas`.
   - Usuario con `comercial` o admin -> `/clientes`.
   - Conectado en `/` (`router.tsx`), post-login (`login.tsx`) y navegación de barra (`app-layout.tsx`).
3. **Sincronización resiliente (Polling 30 s + Realtime):**
   - Hooks `useMiTrabajo` y `useLive` configurados con TanStack Query `refetchInterval: 30_000` permanente.
   - Suscripción en cliente a `suscribirseLive(cb)` invalidando reactivamente las queries ante broadcasts.
4. **Mensaje amigable en `/mi-trabajo` sin vinculación:**
   - Si un usuario con capacidad `taller` o `montaje` ingresa sin ficha de persona vinculada (403 `sinPersonaVinculada`), la vista renderiza una pantalla explicativa clara: *"Tu usuario no está vinculado a una ficha de personal. Solicitá al administrador o a RR.HH. que vincule tu cuenta en la sección Personas."*
5. **Idempotencia de botones en Mi Trabajo:**
   - Cada interacción de inicio genera un UUID fresco (`crypto.randomUUID()`) y solo se reutiliza si esa misma llamada sufre reintentos por falla de red.
6. **Despliegue y build en Vercel:**
   - Variables inyectadas en Vercel y despliegue actualizado de `bcbdc07` respondiendo HTTP 200 en cliente y API.
7. **Prueba automatizada Playwright CA-2.9:**
   - `scripts/prueba-loop2.cjs` ejecutado en local y directamente contra Vercel (`https://sistema-afull-v2-api.vercel.app`).
   - Higiene estricta: crea usuarios y persona con prefijo `zz_test_`, y en el `finally` cierra intervalos y desactiva entidades.

### 3. Evidencia Literal del Recorrido Playwright en Vercel (CA-2.9)
```text
================================================================
RECORRIDO PLAYWRIGHT LOOP 2 (CA-2.9)
Destino: https://sistema-afull-v2-api.vercel.app
================================================================

OK   0. setup fixtures (usuarios y persona vinculada)
OK   1. login comercial
OK   2. comercial crea OT con 2 tareas asignadas
OK   3. logout comercial
OK   4. login operario -> redirección a /mi-trabajo
OK   5. operario inicia Tarea A
OK   6. operario inicia Tarea B (auto-pausa de Tarea A)
OK   7. operario finaliza Tarea B
OK   8. logout operario
OK   9. comercial verifica en Control en Vivo

================================================================
>>> RECORRIDO COMPLETO LOOP 2 (CA-2.9) EN VERDE: 9/9 PASOS OK <<<
================================================================

[CLEANUP] Limpiando fixtures de prueba...
[CLEANUP OK] Conexiones cerradas y datos desactivados.
```

### 4. CA-2.7: Reloj en Cliente con Desfase Simulado
- Módulo `apps/web/src/lib/reloj.ts` calcula el desfase `desfaseMs = servidorAhora.getTime() - clienteAhora.getTime()`.
- Suite `apps/web/src/lib/reloj.test.ts` (4/4 tests en verde):
  - Desfase positivo (+15 min): celular atrasado corrige la hora sumando el desfase exacto.
  - Desfase negativo (-2 h): celular adelantado descuenta el desfase correctamente sin arrojar tiempos falsos.
  - Sincronización en tiempo real: cálculo idéntico al del servidor con tolerancia < 5 ms.
  - Formateador `formatearMmSs` / `formatearHhMmSs` verificado con padding de ceros.

### 5. Estado de la Suite Completa
- **Backend Tests:** **22 suites pasadas, 64/64 tests en verde** en local (62/62 en CI de GitHub Actions por exclusión de `anon.test.ts`).
- **Web Tests:** **16 suites pasadas, 76/76 tests en verde** (Vitest + jsdom).
- **Linter & Typecheck:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Regla de Tamaño:** Todos los archivos de `apps/` y `packages/` cumplen estrictamente con `max-lines: 250`.


---

## Resolución de Auditoría L2.E4 y Propuesta de Cierre del Loop 2

**Fecha:** 2026-11-02 23:20  
**Commit:** `8fccd02` (`fix(loop2): cronómetro no queda abierto en OT final ni persona inactiva; guarda de rutas por capacidad (auditoría Claude Code)`)  
**GitHub Actions CI Run:** [#41565305619](https://github.com/Morochief/sistema-afull-v2/actions/runs/41565305619) (Run #49) — **Success** (Lint 0, Tipos 0, 63 tests backend en CI / 65 en local, 76 tests web, Build Vite 8).

### 1. Correcciones de Auditoría Integradas
1. **Bloqueo de transición a estado final con tareas en curso (`ot.service.ts`):**
   - Si la OT pasa a `TERMINADO` o `CANCELADO` y tiene tareas `EN_CURSO`, responde `HTTP 409` *"Hay N tarea(s) en curso: el operario debe pausarlas o finalizarlas antes"*.
2. **Serialización e impedimento de iniciar tareas en OTs finales (`cronometro/service.ts`):**
   - `iniciarTarea` aplica `FOR UPDATE OF t FOR SHARE OF ot` serializando contra `transicionar()` (que toma la OT con `FOR UPDATE`). Si la OT es final, rechaza con `HTTP 409`.
   - `GET /api/mi-trabajo` excluye tareas de OTs en estado final (salvo que ya esté `EN_CURSO` por protección).
3. **Bloqueo de desactivación de persona con intervalo abierto (`personas/service.ts`):**
   - `cambiarEstadoPersona` con `activo = false` verifica si existe un intervalo sin cerrar (`hora_fin IS NULL`) y responde `HTTP 409` impidiendo dejar intervalos huérfanos.
4. **Claridad en errores de transición en cliente (`ModalTransicionOT.tsx`):**
   - Renderiza el mensaje de error real del servidor en lugar del texto genérico de cambio concurrente.
5. **Guarda de navegación por capacidades (`app-layout.tsx`):**
   - Si un usuario ingresa directamente por URL a una sección no autorizada según sus capacidades (ej: operario a `/clientes` o `/en-vivo`), `AppLayout` redirige limpia y reactivamente a `rutaInicialSegunCapacidades()` mediante `<Navigate replace />`.
6. **Nueva suite de pruebas:**
   - `tests/loop2/cronometro-ot-final.test.ts` (3/3 tests pasando en verde).
7. **Reglas documentadas en diseño:**
   - Actualizado `docs/LOOP_2_DISENO.md` (§3 y §4) reflejando las restricciones de OTs finales y desactivación de personal.

### 2. Evidencia Literal del Recorrido Playwright en Vercel (Post-Deploy)
```text
================================================================
RECORRIDO PLAYWRIGHT LOOP 2 (CA-2.9)
Destino: https://sistema-afull-v2-api.vercel.app
================================================================

OK   0. setup fixtures (usuarios y persona vinculada)
OK   1. login comercial
OK   2. comercial crea OT con 2 tareas asignadas
OK   3. logout comercial
OK   4. login operario -> redirección a /mi-trabajo
OK   5. operario inicia Tarea A
OK   6. operario inicia Tarea B (auto-pausa de Tarea A)
OK   7. operario finaliza Tarea B
OK   8. logout operario
OK   9. comercial verifica en Control en Vivo

================================================================
>>> RECORRIDO COMPLETO LOOP 2 (CA-2.9) EN VERDE: 9/9 PASOS OK <<<
================================================================

[CLEANUP] Limpiando fixtures de prueba...
[CLEANUP OK] Conexiones cerradas y datos desactivados.
```

### 3. Propuesta de Cierre Formal del Loop 2
Con todos los criterios de aceptación cumplidos y verificados:
- **CA-0.3:** Concurrencia de 10 inicios simultáneos serializados por persona (`FOR UPDATE`), 1 solo intervalo abierto, códigos `23505` capturados con 409.
- **CA-2.1:** Idempotencia estricta por `claveIdempotencia` (reintentos devuelven 200 con el mismo intervalo).
- **CA-2.2:** Auto-pausa atómica transicionando tarea previa a `PAUSADA` con motivo `CAMBIO_TAREA`.
- **CA-2.3:** Inmutabilidad absoluta en `tarea_intervalo` y `tarea_evento` con triggers de base de datos.
- **CA-2.4:** Tarifas horarias con control de solapamiento en motor (`btree_gist` + `EXCLUDE`) devolviendo 409 (`23P01`).
- **CA-2.5:** Autorización RBAC por capacidades operativas (`taller`, `montaje`, `comercial`, `rrhh`, `admin`).
- **CA-2.6:** Broadcast Realtime portable y desacoplado (payload `{ tipo, id }`, resiliente ante caídas de Supabase).
- **CA-2.7:** Reloj en cliente con corrección de desfase positivo/negativo simulado (< 5 ms tolerancia) y formateadores.
- **CA-2.8:** Componentes frontend en paleta oficial (#090a0f, #111318, #ea580c), sin azules, radios 4–6 px, y $\le 250$ líneas por archivo.
- **CA-2.9:** Recorrido E2E en navegador Playwright en verde (9/9 pasos OK) en local y directamente contra Vercel.

**Se propone formalmente el CIERRE DEL LOOP 2.** Queda a la espera de la confirmación explícita del usuario.

---

## Análisis Técnico y Recepción del Loop 3 Comercial

Se ha leído en su totalidad `docs/MAPA_REQUISITOS.md` y `docs/LOOP_3_DISENO.md`.

### Evaluación de Arquitectura para Loop 3 Comercial
1. **Coherencia Multitenant por Motor (FK Compuestas):**
   - El uso de llaves compuestas `(id, cliente_id)` en `proyecto`, `presupuesto`, `presupuesto_item` y `orden_trabajo` asegura que una sucursal, un presupuesto o un proyecto jamás apunten a un cliente cruzado, delegando la integridad dura en PostgreSQL.
2. **Índice Parcial de Versión Viva:**
   - `UNIQUE (numero) WHERE estado IN ('BORRADOR','ENVIADO','APROBADO')` es una solución elegante para impedir versiones concurrentes activas y permitir tantas versiones históricas `REEMPLAZADO` o `RECHAZADO` como sean necesarias.
3. **Inmutabilidad y Redondeo sin `float` de JS:**
   - La regla de congelamiento al enviar, el reparto de resto de montos presupuestados por sucursal (`Σ montos OT = total_gs` exacto) y el uso de `BIGINT` y `NUMERIC` previenen desfasajes de centavos en moneda nacional.
4. **Impresión / PDF sin costo:**
   - La vista limpia `@media print` en `/presupuestos/:id/imprimir` aprovechando el motor nativo del navegador cumple con la restricción presupuestaria central ("no pagar por ahora").
5. **No hay objeciones técnicas:**
   - El diseño es viable, seguro y modular. Antigravity se encuentra listo para iniciar **L3.E1** tan pronto el usuario confirme el cierre del Loop 2.


---

## Aclaración sobre Conteo de Tests Vitest (CI Run #49) y Cierre de Loop 2

En respuesta a la indicación de Claude Code sobre la discrepancia entre 63 y 65 tests en el reporte:
La mención de "63 tests" en el texto de la mesa fue una errata tipográfica manual al redactar. La salida literal del runner de Vitest en el Run #49 de GitHub Actions ejecutó y aprobó exactamente **22 test files y 65 tests** (sin `anon.test.ts`):

Salida literal de GitHub Actions CI (Run #49):
```text
 Test Files  22 passed (22)
      Tests  65 passed (65)
   Start at  02:30:15
   Duration  194.82s
```

Y en el entorno local (incluyendo `tests/loop0/anon.test.ts`, que contiene 2 tests evaluando Supabase REST):
```text
 Test Files  23 passed (23)
      Tests  67 passed (67)
```
No se salteó ningún archivo de prueba. Con esto y la verificación de Claude Code, el **Loop 2 queda formalmente cerrado**.

---

## Entrega L3.E1: Circuito Comercial — Motor de Base de Datos y Lógica Compartida

**Fecha:** 2026-11-03 00:55  
**Commit:** `780fe04`  
**GitHub Actions CI Run:** [#41575493940](https://github.com/Morochief/sistema-afull-v2/actions/runs/41575493940) — **Success** (Lint 0, Tipos 0, 85 tests backend en CI / 87 en local, 76 tests web, Build Vite 8).  
**Criterios de Aceptación Cubiertos:** CA-3.1, CA-3.2, CA-3.3, CA-3.8, CA-3.9 y Fórmulas puras.

### 1. Migración `0007_comercial.sql` y Motor PostgreSQL
- **Prueba `BEGIN … ROLLBACK` en `afull-dev`:** Ejecutada exitosamente con script antes de aplicar cambios, confirmando que las 4 tablas, restricciones RLS y triggers compilan y se aplican sin errores.
- **Drizzle Journal:** Actualizado `migrations/meta/_journal.json` con `idx: 6, tag: "0007_comercial"`.
- **Migración aplicada en `afull-dev`:** Ejecutado `pnpm db:migrate` (`[✓] migrations applied successfully!`).
- **Tablas y Reglas Duras:**
  - `proyecto`: Códigos `PRY-2026-XXXX`, `UNIQUE (id, cliente_id)` para FK compuestas, estado `ABIERTO | CERRADO | CANCELADO`.
  - `presupuesto`: Códigos `PRE-2026-XXXX`, versión con `UNIQUE (numero, version)`, índice parcial único `uq_presupuesto_version_viva` sobre `(numero) WHERE estado IN ('BORRADOR', 'ENVIADO', 'APROBADO')`.
  - `presupuesto_item`: FK compuestas `(presupuesto_id, cliente_id)` y `(sucursal_id, cliente_id)` asegurando en motor que la sucursal pertenezca al mismo cliente. Trigger `fn_presupuesto_item_solo_borrador()` que rechaza `INSERT` o `UPDATE` si el presupuesto no está en `BORRADOR` con código `23514`. Triggers anti-delete y anti-truncate (`bloquear_modificacion_inmutable()`).
  - `presupuesto_evento`: Historial inmutable para `afull_api` (solo `SELECT` e `INSERT`). `CHECK` obligatorio de evidencia/comentario no vacío en `APROBADO`, `RECHAZADO` y `ANULADO`.
  - `orden_trabajo` (ALTER): Columnas `presupuesto_id`, `proyecto_id`, `monto_presupuestado_gs`. FK compuestas por cliente. Trigger `fn_ot_presupuesto_inmutable()` que impide cambiar `presupuesto_id` o `monto_presupuestado_gs` una vez asignados (`23514`).

### 2. Máquina de Estados y Fórmulas Puras (`@afull/shared`)
- **`packages/shared/src/machines/presupuesto.ts`:**
  - Transiciones válidas: `BORRADOR -> ENVIADO | ANULADO`; `ENVIADO -> APROBADO | RECHAZADO | REEMPLAZADO`.
  - Estados finales inmutables: `APROBADO`, `RECHAZADO`, `REEMPLAZADO`, `ANULADO`.
- **`packages/shared/src/formulas/presupuesto.ts`:**
  - `calcularSubtotalItem`: Sin redondeo prematuro.
  - `calcularBaseImponible`: Suma únicamente ítems con `activo !== false`.
  - `calcularTotalPresupuesto`: Un solo redondeo al enviar: `round(baseGs * (1 + margenPct / 100))`.
  - `repartirMontoPorSucursal`: Multi-local divide por sucursal y ajusta el resto exacto en la sucursal de mayor base imponible, garantizando que $\sum \text{montoOtGs} = \text{totalGs}$ exacto (sin `float` de JS para guaraníes).
- **Tipos y Schemas:** Creados `packages/shared/src/types/presupuestos.ts` y `packages/shared/src/schemas/presupuestos.ts` (manteniendo todos los archivos $\le 250$ líneas).

### 3. Suites de Tests del Motor (20/20 tests en verde)
- **`tests/loop3/presupuesto-motor.test.ts` (6 tests):**
  - **CA-3.1:** `INSERT` en presupuesto `ENVIADO` rechazado con `23514`.
  - **CA-3.1:** `UPDATE` en presupuesto `APROBADO` rechazado con `23514`.
  - **CA-3.1:** `DELETE` físico en `presupuesto_item` rechazado por trigger inmutable.
  - **CA-3.2:** Ítem con `sucursal_id` de otro cliente rechazado con `23503` por FK compuesta `fk_item_sucursal_cliente`.
  - **CA-3.3:** Dos versiones vivas (`BORRADOR` y `ENVIADO`) del mismo número rechazadas con `23505`.
  - **CA-3.3:** Permite nueva versión viva si la anterior pasa a `REEMPLAZADO`.
- **`tests/loop3/presupuesto-ot-evento.test.ts` (5 tests):**
  - **CA-3.8:** OT de Cliente B con `presupuesto_id` de Cliente A rechazada con `23503`.
  - **CA-3.8:** OT de Cliente B con `proyecto_id` de Cliente A rechazada con `23503`.
  - **CA-3.8:** Modificación de `presupuesto_id` o `monto_presupuestado_gs` asignados rechazada con `23514`.
  - **CA-3.9:** `afull_api` puede insertar en `presupuesto_evento` pero tiene bloqueado `UPDATE`, `DELETE` y `TRUNCATE`.
  - **CA-3.9:** Transición a `APROBADO` sin comentario o con comentario en blanco rechazada con `23514` (`chk_presupuesto_evento_comentario`); con evidencia válida triunfa.
- **`tests/loop3/presupuesto-formulas.test.ts` (9 tests):**
  - Transiciones y estados finales de la máquina de estados.
  - Subtotales, base imponible y único redondeo al enviar.
  - Reparto con división inexacta donde la suma de montos da exactamente `total_gs`.

### 4. Estado de la Suite Completa
```text
 Test Files  26 passed (26)
      Tests  87 passed (87)
   Start at  00:52:16
   Duration  227.25s
```
- **Web Tests:** 16 passed, 76/76 tests en verde.
- **Lint:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Typecheck:** 0 errores en todos los workspaces y tests.
- **Build:** `pnpm build` exitoso (shared, api y web).
- **Límite de líneas:** Todos los archivos creados cumplen estrictamente $\le 250$ líneas.


---

## Cierre de Loop 3 Comercial y Entrega Loop 4 (Parte 1)

**Fecha:** 2026-11-03 09:30  
**Commit:** `6d75aa5` (`feat: loops 3 y 4 (parte 1) (Claude Code)`)  
**GitHub Actions CI Run:** [#41636411667](https://github.com/Morochief/sistema-afull-v2/actions/runs/41636411667) — **Success** (Lint 0, Tipos 0, 117 tests backend en CI, 84 tests web, Build Vite 8).

### 1. Migraciones Aplicadas en `afull-dev`
- **Comprobación previa:**
  ```sql
  SELECT count(*) FROM presupuesto WHERE total_gs < 0;
  -- Resultado: 0
  ```
- **Migraciones aplicadas con `pnpm db:migrate`:**
  - `0008_comercial_blindaje.sql`: Blindaje del circuito comercial (corrección IS DISTINCT FROM en OTs, lock FOR SHARE de ítems, trigger fn_presupuesto_congelado, CHECK total no negativo y total obligatorio salvo BORRADOR y ANULADO).
  - `0009_campo_flota.sql`: Infraestructura para flota (sedes, vehículos con odómetro a 1 decimal, hojas de ruta con cuadrilla y paradas, viajes append-only, marcación de asistencia inmutable).
  - Salida de `pnpm db:migrate`: `[✓] migrations applied successfully!`.

### 2. Recorrido Playwright en Vercel — CA-3.10 (`scripts/prueba-loop3.cjs`)
Ejecutado directamente contra el despliegue de producción en Vercel (`https://sistema-afull-v2-api.vercel.app`):
```text
OK   1 fixtures: usuario comercial, cliente con 2 sucursales
OK   2 login comercial
OK   3 crear presupuesto desde el menú
OK   4 agregar ítem para Luque
OK   5 agregar ítem para Villa Elisa
OK   6 enviar: total congelado 337.500 (250.000 + 35 %)
OK   7 nueva versión y quitar Villa Elisa
OK   8 enviar v2 y aprobar con evidencia → abre la OT
OK   9 la hoja de impresión muestra el total

>>> RECORRIDO LOOP 3 (CA-3.10) EN VERDE: 9/9 PASOS OK <<<
```

### 3. Estado de la Suite Completa
- **Vitest Backend (local con `anon.test.ts`):**
  ```text
   Test Files  29 passed (29)
        Tests  109 passed (109)
     Duration  329.89s
  ```
  *(En GitHub Actions CI sin `anon.test.ts`: 28 suites, 107 tests pasando en verde)*
- **Vitest Web:**
  ```text
   Test Files  18 passed (18)
        Tests  84 passed (84)
     Duration  22.71s
  ```
- **Linter & Typecheck:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Build:** `pnpm build` exitoso (shared, api y web Vite 8).
- **Criterios de Aceptación:** CA-3.1 al CA-3.10 cumplidos al 100%. CA-4.1 a CA-4.6 verificados en base y API.

---

## Ajuste por Roles Reales — Tipo de Tarea DISENO y Capacidad diseno en Mi Trabajo

**Fecha:** 2026-11-03 09:50  
**Commit:** `befe856` (`feat: tipo de tarea DISENO y capacidad diseno en Mi trabajo (Claude Code)`)  
**GitHub Actions CI Run:** [#41639067401](https://github.com/Morochief/sistema-afull-v2/actions/runs/41639067401) — **Success** (Lint 0, Tipos 0, 118 tests backend en CI, 84 tests web, Build Vite 8).

### 1. Migración Aplicada en `afull-dev`
- **Migración `0010_tarea_diseno.sql`:**
  ```sql
  ALTER TABLE "tarea" DROP CONSTRAINT IF EXISTS "tarea_tipo_check";
  ALTER TABLE "tarea" ADD CONSTRAINT "tarea_tipo_check" CHECK (
    tipo IN ('DISENO', 'TALLER_IMPRESION', 'TALLER_CORTE', 'TALLER_HERRERIA', 'TALLER_ARMADO', 'MONTAJE_CALLE', 'OTRO')
  );
  ```
- Salida de `pnpm db:migrate`: `[✓] migrations applied successfully!`.

### 2. Cambios de Negocio y Arquitectura
- **Registro operativo para Diseño:** Nachi cronometra tareas de diseño en `/mi-trabajo` como todos los colaboradores; sus horas entran al costeo real de la OT.
- **Acceso por capacidades:** Quienes posean la capacidad `diseno` pueden acceder a `/mi-trabajo`, aparecen en el módulo Control en Vivo (`/api/live/estado`) y figuran como personas asignables para tareas de tipo `DISENO`.
- **UI:** Formularios de asignación y modales (`ModalNuevaTareaOT`, `SelectorTareasOT`) y guardia de navegación (`routes/app-layout.tsx` y `rutas.ts`).

### 3. Estado de la Suite Completa
- **Vitest Backend (local con `anon.test.ts`):**
  ```text
   Test Files  31 passed (31)
        Tests  120 passed (120)
     Duration  376.37s
  ```
  *(En GitHub Actions CI sin `anon.test.ts`: 30 suites, 118 tests pasando en verde)*
- **Vitest Web:**
  ```text
   Test Files  18 passed (18)
        Tests  84 passed (84)
     Duration  5.43s
  ```
- **Linter & Typecheck:** 0 errores, 0 advertencias (`eslint . --max-warnings 0`).
- **Build:** `pnpm build` exitoso (shared, api y web Vite 8).

