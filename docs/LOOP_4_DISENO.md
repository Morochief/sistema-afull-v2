# Loop 4 — Campo y flota (diseño de Claude Code)

> **Estado (2026-11-09):** **L4.E3 (fotos y archivos) IMPLEMENTADA por Claude Code, sin commit** (§7). Estado anterior (2026-11-03): L4.E1 y L4.E2 (base y API) en `main`. **L4.E4 pantallas** IMPLEMENTADAS por Claude Code, sin commit: "En la calle" (marcación con GPS, odómetro con motivo cuando el servidor lo pide, paradas con "Ir" a Google Maps, Hecha u Omitida), "Hojas de ruta" (coordinación) y "Flota y sedes" (admin). Recorrido `scripts/prueba-loop4.cjs` 7/7 en local. **Cola sin señal (L4.E4) IMPLEMENTADA** por Claude Code el 2026-11-03 (§6), sin commit. **Pendiente:** L4.E3 (fotos en Storage: necesita crear el bucket privado y la clave de servicio en Vercel). Supuesto §0.1 (geocerca que registra y avisa) **confirmado por el usuario**.
> **Fuentes:** `ARQUITECTURA_V3.md` §5–7 (`vehiculo`, `hoja_ruta*`, `viaje`, `marcacion_asistencia`), `TRASPASO.md` §3 (auditoría de flota informativa, geocerca disuasiva) y §8, `docs/MAPA_REQUISITOS.md`.

## 0. Supuestos (el usuario no estaba disponible: confirmar o corregir)
1. **Geocerca por sede**, no una coordenada fija en el código: tabla `sede` con su GPS y radio (100 m por defecto). La marcación **fuera** de la geocerca **se registra igual** con `dentro_geocerca = false` (disuasiva, nunca bloqueante: el GPS del navegador es falsificable y bloquear dejaría gente sin marcar).
2. **Odómetro en km enteros con 1 decimal** (`NUMERIC(9,1)`). Un viaje no puede empezar con menos km que el último cierre del vehículo (400: casi siempre es un error de tipeo); si de verdad el tablero se cambió, se registra con `motivo` obligatorio.
3. **Alerta de desvío informativa** cuando el odómetro supera en más de **30 %** la distancia estimada (paradas planificadas, Haversine × 1,35). Nunca bloquea; pide motivo en la pantalla.
4. **Coordinación de hojas de ruta = capacidad `comercial`**; **vehículos y sedes = `admin`**; la cuadrilla usa `montaje` (o `taller` si sale a la calle).
5. Fotos de odómetro: columnas `foto_*_path` **opcionales** hasta L4.E3. **Resuelto en L4.E3 (§7):** la foto es obligatoria **en la app**; las columnas `foto_*_path` de `viaje` quedan sin uso (las fotos van en `archivo`).

## 1. Modelo — migración `0009_campo_flota.sql`
| Tabla | Reglas duras |
| :--- | :--- |
| `sede` | GPS en Paraguay (`CHECK` como `sucursal`), `radio_m` 20–1000 |
| `vehiculo` | `chapa` única (mayúsculas), `costo_km_gs NUMERIC(15,4) >= 0` |
| `hoja_ruta` | `fecha`, `vehiculo_id NULL`, `estado` `PLANIFICADA → EN_CURSO → FINALIZADA` (`CHECK`), `creado_por` |
| `hoja_ruta_persona` | `UNIQUE (hoja_ruta_id, persona_id)`, `rol` `CONDUCTOR`/`MONTADOR`/`AYUDANTE`, `activo` (se quita desactivando) |
| `hoja_ruta_parada` | OT obligatoria (la sucursal sale de la OT); `tipo` `PLANIFICADA`/`EXTRA` con `motivo` obligatorio en `EXTRA`; `estado` `PENDIENTE`/`COMPLETADA`/`OMITIDA` con `motivo` en `OMITIDA`; `UNIQUE (hoja_ruta_id, orden_secuencia)` |
| `viaje` | **Un viaje abierto por vehículo y uno por conductor** (índices únicos parciales), `km_fin >= km_inicio`, `clave_idempotencia UUID UNIQUE`; trigger: **un solo cierre**, sin `DELETE`/`TRUNCATE` |
| `marcacion_asistencia` | **Inmutable** (append-only), `clave_idempotencia UUID UNIQUE`, `distancia_m`, `dentro_geocerca`, `precision_m`, `dispositivo_hash` |

Sin `DELETE` para `afull_api`; RLS + `GRANT` mínimo + política `api_acceso` (append-only con políticas separadas).

## 2. API
- `GET/POST/PATCH /api/flota/vehiculos`, `GET/POST/PATCH /api/flota/sedes` (`admin`).
- `GET/POST /api/hojas-ruta`, `GET /api/hojas-ruta/:id`, `POST /:id/personas`, `POST /:id/paradas` (`comercial`).
- Campo (`montaje` o `taller`, persona vinculada): `GET /api/campo/hoy` (mi hoja de hoy, viaje abierto, última marcación), `POST /api/campo/viajes/iniciar`, `POST /api/campo/viajes/:id/cerrar`, `POST /api/campo/paradas/:id/{completar|omitir}`.
- Asistencia (cualquier usuario con persona vinculada): `POST /api/asistencia/marcar`; `GET /api/asistencia` (`rrhh`).
- Todo mutante con `claveIdempotencia` (la cola offline de L4.E4 reintenta sin duplicar). **Un `401` no descarta eventos** en el cliente.

## 3. Fórmulas — `packages/shared/src/formulas/geo.ts`
`haversineM(a, b)`; `distanciaRutaKm(puntos, factor = 1.35)`; `alertaDesvio(kmOdometro, kmEstimado, umbral = 0.30)`. Puras, con tests.

## 4. Criterios
- **CA-4.1** Dos viajes abiertos del mismo vehículo o del mismo conductor: imposible (motor), también en paralelo.
- **CA-4.2** Reintento de iniciar/cerrar viaje o de marcar con la misma clave: una sola fila.
- **CA-4.3** Cierre con km menor al de inicio: rechazado por el motor; un viaje cerrado no se reabre ni se edita.
- **CA-4.4** Marcación fuera de geocerca: se guarda con `dentro_geocerca = false` y distancia; `marcacion_asistencia` inmutable para `afull_api`.
- **CA-4.5** Alerta de desvío informativa: viaje con +50 % sobre lo estimado se cierra igual, con `alerta_desvio = true` y motivo exigido.
- **CA-4.6** Parada `EXTRA` u `OMITIDA` sin motivo: rechazada por `CHECK`.
- **CA-4.7** (L4.E3) Fotos por URL firmada, bucket privado, tamaño máximo validado en servidor.
- **CA-4.8** (L4.E4) Cola offline: 20 eventos encolados sin red se envían al volver, sin duplicados; un 401 los conserva.

## 5. Entregas
- **L4.E1** `0009` + fórmulas geo + CA-4.1, 4.3, 4.4 (motor), 4.6.
- **L4.E2** API de flota, hojas de ruta, campo y asistencia + CA-4.2, 4.5.
- **L4.E3** Storage (URLs firmadas) + CA-4.7. **Requiere el proyecto Supabase.**
- **L4.E4** Pantallas: coordinación de hojas de ruta, "Hoy en la calle" para la cuadrilla, marcación; cola offline Dexie + CA-4.8.

## 6. Sin señal (L4.E4, Claude Code 2026-11-03) — migración `0017_sin_senal.sql`
- **Cola en el celular** (`apps/web/src/lib/cola-offline.ts`, en `localStorage`, sin dependencias nuevas): marcar entrada/salida, iniciar y cerrar viaje, completar u omitir parada y cargar material. Solo acciones **idempotentes**, así reenviar nunca duplica.
  - Sin señal (el pedido no llega) → se guarda y se avisa. Un **rechazo real** del servidor (4xx) no se encola: se muestra. Lo encolado que después el servidor rechaza queda en "no se pudo registrar" para que la persona lo vea.
  - Se manda **sola y en orden** al volver la señal (y cada 30 s), o con "Enviar ahora". Con algo pendiente, lo nuevo va detrás (iniciar viaje antes que cerrarlo).
  - **Celular compartido:** cada acción guarda quién la cargó y solo se manda con esa persona en sesión.
  - Un `401` frena la cola sin perder nada.
- **Hora real:** la acción encolada lleva `ocurridaAt` (la hora del celular). La API la acepta solo si no es futura (+2 min) ni de hace más de 72 h, y la **marca "sin señal"** (`marcacion_asistencia.sin_senal` + `recibida_at`, `viaje.inicio_sin_senal`/`cierre_sin_senal`, `hoja_ruta_parada.cierre_sin_senal`). RR.HH. lo ve en Asistencia ("sin señal · llegó …"). Como el GPS, el reloj del celular es falsificable: **disuasivo**.
- **Abrir la app sin señal:** service worker mínimo (`apps/web/public/sw.js`): páginas primero de la red y si no, la copia guardada; `/assets/*` de la caché; `/api/*` **nunca** se cachea. "En la calle" muestra lo último que se bajó ("Sin señal: mostrando lo bajado el …") y la sesión usa el último usuario conocido (la API igual valida la cookie al mandar).
- Pruebas: `tests/loop4/sin-senal.test.ts` (CA-4.7: hora real y marca; límites), `apps/web/src/lib/cola-offline.test.ts` (orden, rechazos, 401, celular compartido, regresión de la cola trabada), `scripts/prueba-sin-senal.cjs` 4/4 (sin señal → vuelve → llega todo con la hora real) y `scripts/prueba-sin-senal-recarga.cjs` (sitio compilado: recargar sin señal abre la app).
- **Probar en un celular real** (Android/Chrome e iPhone/Safari): modo avión, marcar, volver a encender.

## 7. Fotos y archivos (L4.E3, Claude Code 2026-11-09) — migración `0018_archivos.sql`
**Decisiones del usuario (2026-11-09):** las fotos sin señal se guardan en el celular y suben solas; la foto del odómetro es **obligatoria** al iniciar y al cerrar el viaje; entran los cuatro usos (odómetro y montaje, muestras de impresión, comprobante de permiso, foto del pedido del portal).

- **Dónde:** Supabase Storage, bucket **privado** `afull-archivos` (tope 10 MB, solo JPEG/PNG/WebP/PDF). Lo crea la migración por SQL (`storage.buckets`); en una base sin Storage se saltea, y si el rol no tiene permiso avisa sin fallar → crearlo desde el panel con esos mismos datos.
- **Flujo (la foto no pasa por Vercel):** `POST /api/archivos/solicitar` registra el archivo `PENDIENTE` (idempotente por clave) y devuelve una URL firmada de subida (2 h) → el celular sube con `PUT` directo a Storage → `POST /api/archivos/:id/confirmar`: la API mira el **tamaño y tipo reales** en Storage; si se pasa del tope (5 MB foto, 10 MB PDF) o el tipo no coincide, lo **borra** y responde 400 (CA-4.7). Ver: `GET /api/archivos?{viajeId|paradaId|tareaId|solicitudId|pedidoId}` con enlaces temporales de 10 min.
- **Clave:** `SUPABASE_SECRET_KEY` (la `sb_secret_…` nueva va solo en el header `apikey`; la `service_role` vieja, también como Bearer). Solo en el servidor (Vercel); nunca en el navegador ni en el chat. Sin clave, la API responde **503** antes de registrar nada. `ALMACENAMIENTO=memoria` (nunca en producción) imita Storage para probar en local.
- **`archivo`:** cada tipo cuelga de una sola cosa (`CHECK`): `ODOMETRO_INICIO`/`ODOMETRO_FIN` → viaje; `EVIDENCIA_PARADA` → parada; `MUESTRA_TAREA` → tarea; `COMPROBANTE_PERMISO` → solicitud (único que admite PDF); `FOTO_PEDIDO` → pedido (único que sube el portal). Solo cambia una vez (`PENDIENTE → SUBIDO`); sin `DELETE`/`TRUNCATE`. Una sola foto de odómetro por viaje y momento. Ruta sin datos personales: `tipo/AAAA-MM/uuid.ext`. Hora en que se sacó (`tomada_at`, acotada como en §6) y marca `sin_senal`.
- **Quién sube / ve** (`modules/archivos/referencias.ts`; lo que no se puede ver responde 404):
  | Tipo | Sube | Ve |
  | :--- | :--- | :--- |
  | Odómetro | el conductor del viaje | el conductor, comercial, admin |
  | Montaje | la cuadrilla de la hoja | la cuadrilla, comercial, admin |
  | Muestra | quien tiene asignada la tarea, taller, comercial | ídem |
  | Comprobante | el solicitante (o quien la cargó), RR.HH. | ídem |
  | Pedido | el cliente por su enlace, solo pedidos `NUEVO` | el cliente, comercial |
  Topes por cosa: 1 por momento de odómetro, 10 por parada y por tarea, 3 por comprobante y por pedido.
- **En el celular:** las fotos se achican a 1600 px en JPEG (~200-400 KB). Cola propia en IndexedDB (`lib/fotos-pendientes.ts`): sube sola y en orden, **después** de la cola de acciones; la del odómetro va atada a la **clave** con que se inició el viaje, así espera (404) si el inicio sigue sin enviarse. Un rechazo queda a la vista con "reintentar/descartar"; celular compartido como §6.
- **Pantallas:** "En la calle" (foto del odómetro obligatoria; "Foto del montaje" por parada; aviso de fotos por subir), hoja de ruta (viajes con km y fotos; aviso si falta la del odómetro), OT y "Mi trabajo" (muestras por tarea), detalle del permiso (adjuntar foto o PDF), portal (hasta 3 fotos al pedir, y agregar después) y modal del pedido en Comercial.
- **Supuestos a confirmar:** (1) la foto del odómetro es obligatoria **en la app**, no en el servidor (sin señal la foto llega después del viaje); la hoja de ruta avisa si falta; (2) una foto sacada sin señal hace más de 72 h se rechaza como las acciones de §6; (3) los comprobantes por enlace siguen valiendo para lo ya cargado.
- **Espacio:** el plan gratis trae **1 GB** (≈ 3000-5000 fotos achicadas). `GET /api/archivos/uso` (admin) da lo usado. Respaldo de Storage: `backup-storage.mjs` sigue **sin probar** (TRASPASO §7).
- Pruebas: `tests/loop4/archivos-api.test.ts`, `archivos-usos.test.ts`, `almacenamiento.test.ts` (cliente REST con fetch simulado); web: `lib/api-archivos.test.ts`, `lib/fotos-pendientes.test.ts`, `lib/imagen.test.ts`, `components/campo/ViajeCard.test.tsx`; recorrido `scripts/prueba-fotos.cjs` 8/8 (verifica que las imágenes **cargan**).

## 8. L4.E5 — Agregar un proyecto entero a la hoja de ruta (2026-11-10)
**Pedido del usuario:** cuando el trabajo es un proyecto (una OT por local), Gerardo arma la salida agregando local por local. Se pide agregar **todas las OTs del proyecto de una vez**. (Mismo día: Gerardo pasa a ser `admin` en la demo, porque es quien asigna las tareas y arma las hojas.)

**Regla** — `POST /api/hojas-ruta/:id/paradas-proyecto` `{ proyectoId, motivoExtra? }` (capacidad `comercial`, admin pasa), en **una sola transacción**:
- Entran las OTs del proyecto que estén **abiertas** (no `TERMINADO` ni `CANCELADO`) y que **no estén ya** en esa hoja, como paradas al final, en orden de código de OT (el orden de los locales del presupuesto). Después se reordenan o se omiten como cualquier parada.
- Con la hoja **en curso**, son paradas `EXTRA` y el motivo es obligatorio (la misma regla que una parada suelta). Hoja **finalizada** → 409.
- Proyecto inexistente → 400. Proyecto sin OTs para agregar (todas cerradas o ya están) → 400 con un mensaje claro; no se agrega nada.
- Respuesta: `{ agregadas: [{ id, codigo_ot }], salteadas: [{ codigo_ot, motivo: 'cerrada' | 'ya_esta' }] }` y una fila de auditoría.

**Pantalla** (`/hojas-ruta/:id`): debajo del buscador de OTs, un selector **"Agregar proyecto completo…"** con los proyectos abiertos y el botón **Agregar proyecto**; avisa cuántas paradas agregó y cuáles salteó.

**Criterios:** CA-4.20 agrega las abiertas en orden y saltea cerradas y repetidas · CA-4.21 hoja en curso exige motivo y las marca EXTRA · CA-4.22 hoja finalizada 409, proyecto sin nada para agregar 400 sin cambios · CA-4.23 taller 403.
**Pruebas:** `tests/loop4/hoja-proyecto.test.ts`, `apps/web/src/components/hojas-ruta/AgregarProyecto.test.tsx`, `scripts/prueba-hoja-proyecto.cjs`.
