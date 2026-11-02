# Loop 1B — Diseño del frontend (propuesta de Claude Code, Ronda 2)

> **Estado:** PROPUESTA, pendiente de aprobación del usuario y de las objeciones de Antigravity (en `MESA_DE_TRABAJO.md`).
> **Fecha:** 2026-11-02 · Basado en el código real de `apps/api`, `packages/shared`, `ARQUITECTURA_V3.md` §15.4–16 y `TRASPASO.md`.
> **Reparto:** Antigravity implementa por entregas; Claude Code audita cada entrega antes del commit.
> **Restricción vigente:** excepción al principio 7. No hay datos reales ni `afull-prod` hasta cerrar CA-0.9 y `tests-dev.yml`.

---

## 1. Entregas (cada una se audita y cierra con lint, tipos y tests en verde)

| # | Entrega | Contenido | Cierra |
| :--- | :--- | :--- | :--- |
| E1 | Shell | `apps/web` (Vite + React 19 + TS), Tailwind v4 + shadcn/ui con la paleta aFull, TanStack Router, `apiFetch`, login, guardia de sesión, layout con navegación por capacidades, build en Vercel | CA-1.12, CA-1.15 |
| E2 | `TablaAdmin` + Clientes | `TablaAdmin` genérica, `useClientes`, listado, alta, edición y desactivación de clientes | CA-1.11, CA-1.13 (clientes) |
| E3 | Detalle + OTs | Detalle de cliente (sucursales, contactos, marcas), listado, alta, edición y transición de OT, deploy a `dev` con prueba de humo | CA-1.13 (OT), CA-1.14, CA-1.16 |

No se empieza una entrega sin cerrar la anterior.

---

## 2. Decisiones de diseño (se proponen; se pueden objetar)

**D1. Las respuestas de la API quedan en `snake_case`; no se tocan en 1B.** La API devuelve las filas tal cual (`razon_social`, `updated_at`, `codigo_ot`), y los cuerpos de entrada son `camelCase` (`razonSocial`, `updatedAt`). Cambiarlo ahora rompería los 16 tests de 1A. El frontend tipa la forma **real** en `packages/shared/src/types/api.ts` (por ejemplo `ClienteFila`, `ClienteDetalle`, `OTFila`, `OTDetalle`, `Pagina<T>`, `UsuarioSesion`). `Pagina<T>` se mueve de `apps/api/src/lib/paginacion.ts` a `shared` para que ambos lados usen el mismo tipo.

**D2. Enrutado por código, no por archivos.** Son 6 rutas (`/login`, `/clientes`, `/clientes/$id`, `/ots`, `/ots/$id` y el layout). El modo por archivos genera `routeTree.gen.ts`, un archivo que no escribimos, que crece solo y que habría que excluir de `max-lines`. Con código, todo archivo es nuestro y cumple las 250 líneas. Se puede revisar si en algún loop pasamos de ~20 rutas.

**D3. Los filtros viven en la URL** (`?q=&estado=&desde=&hasta=&pagina=`), validados con `validateSearch` + zod. Así "atrás", recargar y compartir el link mantienen la vista. El texto de búsqueda se escribe en la URL **después** del debounce de 300 ms. Cualquier cambio de filtro vuelve a `pagina=1`.

**D4. El servidor manda; sin actualizaciones optimistas.** Las mutaciones esperan la respuesta e invalidan las consultas. Es coherente con la semántica de `409` (dato viejo) y con el principio de eventos inmutables. Para paginar se usa `placeholderData: keepPreviousData`, así la tabla no parpadea.

**D5. Un solo punto de acceso HTTP: `lib/api.ts`.** `apiFetch` usa `credentials: 'same-origin'`, JSON, y lanza `ErrorApi { status, mensaje, detalle? }` a partir de `{ error, detalle }`, que es el formato de `app.onError`. Manejo central:
- `401` → limpia la caché de React Query y redirige a `/login?volver=<ruta>`.
- `403` → mensaje "No tenés permiso para…" en pantalla, nunca una pantalla en blanco.
- `409` → aviso "Otro usuario modificó este registro" + recarga de los datos. **Nunca reintenta solo.**
- `400` con `detalle` de Zod → errores por campo en el formulario.
- Red caída → mensaje y botón "Reintentar".

**D6. Formularios con react-hook-form + `zodResolver`, usando los esquemas de `@afull/shared`** (`nuevoClienteSchema`, `sucursalSchema`, `nuevaOTSchema`…). La misma validación en el navegador y en la API. La caja GPS de Paraguay se valida antes de enviar.

**D7. Fechas sin corrimiento de zona horaria (riesgo probable, verificar en E1).** `postgres-js` convierte una columna `DATE` (`fecha_prometida`) en un `Date` de JS a medianoche UTC. Si el frontend hace `new Date(...)` y la muestra en Paraguay (UTC-3), **el 5 de noviembre aparece como 4 de noviembre**. Regla: `lib/fechas.ts` trata las columnas `DATE` como texto `YYYY-MM-DD` (los primeros 10 caracteres) y nunca las pasa por `Date`. Los `timestamptz` (`created_at`) sí se formatean con `Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion' })`. **En E1, pegar en la mesa el JSON real de un `GET /api/comercial/ot/:id` con `fecha_prometida`** para confirmarlo.

**D8. Guaraníes:** desde ya, `lib/formato.ts` con `Intl.NumberFormat('es-PY')` sin decimales. En 1B no hay montos, pero la función queda lista para Costeo.

**D9. Rango de fechas con dos `<input type="date">`** nativos. Sin librería de calendario: menos peso y menos líneas. Se puede mejorar después sin cambiar la interfaz de `TablaAdmin`.

**D10. Avisos con `sonner`** (el toast de shadcn). Las advertencias de la API (por ejemplo `advertencia: "El cliente tiene 2 OT(s) abierta(s)"` al desactivar) se muestran como aviso, no como error.

**D11. Versiones:** a hoy (consultado 2026-11-02) están vigentes Vite 8.x, `@tanstack/react-router` 1.170.x, Tailwind v4 con `@tailwindcss/vite`, y shadcn/ui con soporte de Tailwind v4 y React 19. **Antigravity confirma las versiones exactas al instalar**, las pega en la mesa y quedan fijadas por `pnpm-lock.yaml`.

---

## 3. `TablaAdmin` — interfaz

Es **presentacional pura**: no hace fetch, no conoce la API ni el router. Recibe datos y avisa cambios. Así sirve igual para Clientes, OTs, Hojas de Ruta e Insumos.

```ts
export type FiltrosTabla = { q?: string; estado?: string; desde?: string; hasta?: string; pagina: number };

export type Columna<T> = {
  id: string;
  encabezado: string;
  celda: (fila: T) => React.ReactNode;
  ancho?: string;                 // clase Tailwind, ej. 'w-32'
  alinear?: 'izq' | 'der';
};

export type TablaAdminProps<T> = {
  columnas: Columna<T>[];
  datos: Pagina<T> | undefined;                     // forma real de la API (D1)
  estado: { cargando: boolean; refrescando: boolean; error: ErrorApi | null };
  filtros: FiltrosTabla;
  onFiltros: (cambio: Partial<FiltrosTabla>) => void; // la tabla manda pagina=1 salvo al paginar
  opcionesEstado: { valor: string; etiqueta: string }[]; // 'Activos/Inactivos' o los estados de OT
  claveFila: (fila: T) => string;
  onFilaClick?: (fila: T) => void;
  acciones?: React.ReactNode;                       // ej. botón "Nuevo cliente"
  textoBusqueda: string;                            // placeholder: "Buscar por nombre, RUC o código"
  vacio: { titulo: string; descripcion?: string };
  onReintentar: () => void;
};
```

**Comportamiento obligatorio (lo que se testea):**
1. **Debounce de 300 ms:** el input tiene estado local; `onFiltros({ q, pagina: 1 })` se llama una sola vez, 300 ms después de la última tecla. Borrar el texto también espera 300 ms. Escribir el mismo valor no dispara nada.
2. **Cuatro estados distintos:**
   - **cargando**: primera carga, 8 filas esqueleto con `aria-busy`.
   - **refrescando**: se mantienen las filas atenuadas con un indicador, sin borrar la tabla.
   - **error**: mensaje de `ErrorApi` + "Reintentar".
   - **vacío**: dos casos. "Sin registros" si no hay filtros, y "Sin resultados para estos filtros" + "Limpiar filtros" si los hay.
3. **Paginación de 25:** "Anterior" y "Siguiente" se desactivan en los bordes. Contador `"{total} resultados · página {p} de {totalPaginas}"` en una región `aria-live`. Si `items` viene vacío con `total > 0` (página fuera de rango, comportamiento de CA-1.1), se muestra "Página fuera de rango" + "Ir a la última".
4. **Accesible:** `<table>` real con `<th scope="col">`; si una fila es clicable, también se activa con Enter.

**Archivos (`components/tabla/`, todos ≤ 250 líneas):** `TablaAdmin.tsx` (estructura y filas), `BarraFiltros.tsx` (búsqueda, estado y fechas), `Paginador.tsx`, `EstadoTabla.tsx` (esqueleto, error y vacío), `tipos.ts`. Más `hooks/useDebounce.ts`.

---

## 4. `useClientes` y familia — interfaz

Un hook de **lectura** por vista y hooks de **mutación** separados, para que cada modal importe solo lo suyo.

```ts
// hooks/clientes/useClientes.ts — la vista /clientes
export function useClientes(): {
  datos: Pagina<ClienteFila> | undefined;
  estado: { cargando: boolean; refrescando: boolean; error: ErrorApi | null };
  filtros: FiltrosTabla;                          // leídos de la URL (D3)
  setFiltros: (c: Partial<FiltrosTabla>) => void; // escriben en la URL
  reintentar: () => void;
};
// queryKey: ['clientes', filtros]. El filtro de estado de la tabla ('activos'|'inactivos'|'todos')
// se traduce a ?activo=true|false (lo que espera filtroClienteSchema).

// hooks/clientes/useCliente.ts — detalle: queryKey ['cliente', id]
// hooks/clientes/useMutacionesCliente.ts
export function useCrearCliente(): UseMutationResult<ClienteFila, ErrorApi, NuevoCliente>;
export function useEditarCliente(id: string): UseMutationResult<ClienteFila, ErrorApi, PatchCliente>;
export function useCambiarEstadoCliente(id: string): UseMutationResult<ClienteFila & { advertencia: string | null }, ErrorApi, { activo: boolean; updatedAt: string }>;
// Todas invalidan ['clientes'] y ['cliente', id]. updatedAt se reenvía tal cual llegó de la API.
```

Lo mismo para OT en E3: `useOTs`, `useOT`, `useCrearOT`, `useEditarOT`, `useTransicionarOT`. `ModalTransicionOT` ofrece **solo** `transicionesDesde(estado)` de `@afull/shared`, manda `desde` = el estado que el usuario ve, y exige comentario si `a === 'CANCELADO'`.

---

## 5. Mapa de archivos (`apps/web/src`)

```
main.tsx · router.tsx · index.css (Tailwind v4 + tokens aFull)
lib/      api.ts · api-clientes.ts · api-ots.ts · queryClient.ts · fechas.ts · formato.ts · utils.ts (cn)
hooks/    useSesion.ts · useDebounce.ts · clientes/{useClientes,useCliente,useMutacionesCliente}.ts · ots/{…}.ts
routes/   login.tsx · app-layout.tsx (guardia + navegación) · clientes/{lista,detalle}.tsx · ots/{lista,detalle}.tsx
components/
  ui/      solo los componentes shadcn necesarios (button, input, dialog, select, badge, label, sonner, skeleton)
  tabla/   TablaAdmin · BarraFiltros · Paginador · EstadoTabla · tipos
  forms/   FormCliente · FormSucursal · FormContacto · FormOT
  modals/  ModalNuevoCliente · ModalEditarCliente · ModalEstadoCliente · ModalSucursal · ModalContacto
           ModalMarca · ModalNuevaOT · ModalEditarOT · ModalTransicionOT
```

**Configuración:**
- `apps/web/package.json` con scripts `dev`, `build`, `typecheck` (así el `typecheck` raíz lo incluye) y `test`.
- `apps/web/tsconfig.json` propio: `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, `lib: ["DOM", "ES2022"]`. La base usa `NodeNext`, que no sirve para Vite.
- ESLint: agregar `eslint-plugin-react-hooks`. **`max-lines: 250` aplica también a `components/ui/`**: no se agregan componentes shadcn que lo superen (por ejemplo `sidebar`).
- **Desarrollo local:** Vite redirige `/api` → API local. Si no existe, agregar `apps/api/src/dev.ts` con `@hono/node-server`, que ya es dependencia. En local, `APP_ORIGIN=http://localhost:5173`, porque el navegador manda ese `Origin` y la verificación CSRF lo compara.

**Vercel (E1):** `outputDirectory: "apps/web/dist"`; `build` raíz agrega `pnpm --filter @afull/web build`; se elimina `public/index.html`. Reescrituras en este orden: `/api/(.*)` → `/api`, y luego todo lo demás → `/index.html`, para que recargar `/clientes/abc` no dé 404. Frontend y API siguen en el mismo origen, así que la cookie `SameSite=Lax` viaja sola.

---

## 6. Cambios mínimos en la API (E3, con sus tests)

- `listarOTs` y `obtenerDetalleOT` agregan `cliente_nombre` y `sucursal_nombre` (con un `JOIN`). Sin eso, la tabla de OTs muestra UUIDs. Test en `tests/loop1/ot.test.ts`. Se respeta la regla de `sinPipelining`: toda consulta con ≥ 1 parámetro.
- Nada más. Si aparece otra necesidad, se propone en la mesa antes de tocar `apps/api`.

---

## 7. Tests del frontend

- **Vitest + jsdom + Testing Library dentro de `apps/web`**, con configuración propia. No usa la de la raíz, que exige `TEST_ENV=dev` y base de datos. Se agrega un paso en `ci.yml`: `pnpm --filter @afull/web test`.
- **Obligatorios:**
  - `TablaAdmin`: debounce con temporizadores falsos (nada a los 299 ms; una sola llamada a los 300 ms tras una ráfaga de teclas); cambio de filtro → `pagina: 1`; los 4 estados; bordes del paginador; caso "página fuera de rango".
  - `apiFetch`: mapeo de 401, 403, 409, 400 con `detalle` y error de red.
  - `fechas`: `fecha_prometida` "2026-11-05" se muestra "05/11/2026" con zona `America/Asuncion` (D7).
  - `ModalTransicionOT`: solo ofrece las transiciones válidas y exige motivo al cancelar.
- **Prueba de humo en `dev` (E3):** manual, con checklist en la mesa (login, crear cliente, editar con dos pestañas para provocar el `409`, crear OT, transicionar, recargar en una ruta profunda). Playwright queda como mejora posterior, fuera de 1B.

---

## 8. Criterios de aceptación de 1B (propuesta para `TRASPASO.md` §6)

- **CA-1.11** (ya existente, con forma medible): debounce de 300 ms probado; filtros de estado y fechas y paginación de 25 reflejados en la URL; los 4 estados; ningún archivo de `apps/web` supera 250 líneas (lo verifica el CI).
- **CA-1.12 Sesión:** sin sesión, toda ruta lleva a `/login`; después del login vuelve a la ruta pedida; el logout vacía la caché; un usuario desactivado es expulsado en la siguiente petición (`401`).
- **CA-1.13 Concurrencia visible:** editar con `updatedAt` viejo muestra el aviso de `409` y recarga, sin perder lo que el usuario escribió en el formulario.
- **CA-1.14 Capacidades:** la navegación oculta lo que el usuario no puede usar; un `403` muestra un mensaje.
- **CA-1.15 Deploy:** la SPA y la API en el mismo proyecto Vercel; recargar en una ruta profunda funciona; login real con cookie `HttpOnly; Secure; SameSite=Lax`; CSRF acepta el `Origin` del navegador.
- **CA-1.16 Fechas:** ninguna fecha `DATE` se corre un día en Paraguay (D7).

---

## 9. Preguntas abiertas

1. **Usuario:** ¿hace falta en 1B que la búsqueda de OTs encuentre también por nombre de cliente? Hoy solo busca por título y código. Si sí, se suma en el mismo `JOIN` de §6.
2. **Antigravity:** confirmar si ya existe un servidor local de la API para desarrollo (§5) y pegar el JSON real de D7.
3. **Pendiente previo, sin cambios:** los términos de Vercel Hobby para uso comercial (`TRASPASO.md` §7) se verifican antes de operar con personal real, no antes de 1B.
