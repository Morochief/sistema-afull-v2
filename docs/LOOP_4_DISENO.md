# Loop 4 — Campo y flota (diseño de Claude Code)

> **Estado (2026-11-03):** L4.E1 y L4.E2 (base y API) en `main`. **L4.E4 pantallas** IMPLEMENTADAS por Claude Code, sin commit: "En la calle" (marcación con GPS, odómetro con motivo cuando el servidor lo pide, paradas con "Ir" a Google Maps, Hecha u Omitida), "Hojas de ruta" (coordinación) y "Flota y sedes" (admin). Recorrido `scripts/prueba-loop4.cjs` 7/7 en local. **Cola sin señal (L4.E4) IMPLEMENTADA** por Claude Code el 2026-11-03 (§6), sin commit. **Pendiente:** L4.E3 (fotos en Storage: necesita crear el bucket privado y la clave de servicio en Vercel). Supuesto §0.1 (geocerca que registra y avisa) **confirmado por el usuario**.
> **Fuentes:** `ARQUITECTURA_V3.md` §5–7 (`vehiculo`, `hoja_ruta*`, `viaje`, `marcacion_asistencia`), `TRASPASO.md` §3 (auditoría de flota informativa, geocerca disuasiva) y §8, `docs/MAPA_REQUISITOS.md`.

## 0. Supuestos (el usuario no estaba disponible: confirmar o corregir)
1. **Geocerca por sede**, no una coordenada fija en el código: tabla `sede` con su GPS y radio (100 m por defecto). La marcación **fuera** de la geocerca **se registra igual** con `dentro_geocerca = false` (disuasiva, nunca bloqueante: el GPS del navegador es falsificable y bloquear dejaría gente sin marcar).
2. **Odómetro en km enteros con 1 decimal** (`NUMERIC(9,1)`). Un viaje no puede empezar con menos km que el último cierre del vehículo (400: casi siempre es un error de tipeo); si de verdad el tablero se cambió, se registra con `motivo` obligatorio.
3. **Alerta de desvío informativa** cuando el odómetro supera en más de **30 %** la distancia estimada (paradas planificadas, Haversine × 1,35). Nunca bloquea; pide motivo en la pantalla.
4. **Coordinación de hojas de ruta = capacidad `comercial`**; **vehículos y sedes = `admin`**; la cuadrilla usa `montaje` (o `taller` si sale a la calle).
5. Fotos de odómetro: columnas `foto_*_path` **opcionales** hasta L4.E3. Cuando exista el bucket, pasan a obligatorias en el servicio.

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
