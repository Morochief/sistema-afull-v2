# Loop 3 — Comercial: presupuestos y proyectos (diseño de Claude Code)

> **Estado:** IMPLEMENTADO por Claude Code (2026-11-03), pendiente de commit y de confirmación de cierre del usuario. Diseño original 2026-11-02. La implementa Antigravity por entregas; Claude Code audita cada una y corrige directo (protocolo de `MESA_CLAUDE.md`).
> **Fuentes:** `docs/MAPA_REQUISITOS.md` (decisiones del usuario), `ARQUITECTURA_V3.md` §5 (`presupuesto`, `presupuesto_item`), migraciones `0001`–`0006`.
> **Requisito previo:** Loop 2 cerrado (commit de las correcciones de la auditoría L2.E4 + confirmación del usuario).

## 0. Decisiones del usuario (2026-11-02)
1. Tres caminos: **OT directa** (sigue igual), **presupuesto → 1 OT**, **presupuesto multi-local → proyecto + 1 OT por sucursal**.
2. **Aprobación todo o nada con versiones.** Nada de aprobar líneas sueltas.
3. Sin registro del diseño previo a la venta. Sin tabla `pedido` (llega con el portal, Loop 9).
4. **Pendiente de confirmar:** los precios se cotizan **con IVA incluido** (el PDF muestra el IVA 10 % como dato informativo). Se implementa así salvo que el usuario diga lo contrario.

## 1. Alcance
**Entra:** presupuestos (borrador, ítems, envío, versiones, aprobación, rechazo, anulación), impresión/PDF, generación de OTs y proyecto al aprobar, proyectos (lista, detalle, cierre), vínculo OT ↔ presupuesto/proyecto, monto presupuestado por OT.
**No entra:** costo real (Loop 6), catálogo de insumos (Loop 5: por ahora los ítems son texto libre), portal (Loop 9), envío por mail/WhatsApp desde el sistema.

## 2. Modelo de datos — migración `0007_comercial.sql`

| Tabla | Columnas clave | Reglas duras (en PostgreSQL) |
| :--- | :--- | :--- |
| `proyecto` | `codigo` (`PRY-2026-0001`), `cliente_id`, `nombre`, `descripcion`, `estado`, `creado_por`, timestamps | `estado` ∈ `ABIERTO`, `CERRADO`, `CANCELADO` (`CHECK`). `UNIQUE (id, cliente_id)` para FK compuestas |
| `presupuesto` | `numero` (`PRE-2026-0001`), `version INT`, `cliente_id`, `titulo`, `notas`, `margen_pct NUMERIC(5,2)` (default 35), `validez_dias INT`, `estado`, `total_gs BIGINT NULL`, `enviado_at`, `creado_por`, timestamps | `UNIQUE (numero, version)`. `UNIQUE (id, cliente_id)`. **Una sola versión viva por número:** índice único parcial `(numero) WHERE estado IN ('BORRADOR','ENVIADO','APROBADO')`. `total_gs` es `NULL` en borrador y obligatorio desde `ENVIADO` (`CHECK`) |
| `presupuesto_item` | `presupuesto_id`, `cliente_id`, `sucursal_id NULL`, `orden`, `concepto`, `descripcion`, `cantidad NUMERIC(12,4) > 0`, `unidad`, `precio_unitario_gs NUMERIC(15,4) >= 0` | FK `(presupuesto_id, cliente_id)` → `presupuesto (id, cliente_id)` y `(sucursal_id, cliente_id)` → `sucursal (id, cliente_id)`: **la sucursal del ítem es del mismo cliente** (motor, no código). `concepto` ∈ `MATERIAL`, `MANO_DE_OBRA`, `TERCERIZADO`, `MOVILIDAD`, `OTRO`. FK `ON DELETE RESTRICT` (el maestro decía `CASCADE`) |
| `presupuesto_evento` | `presupuesto_id`, `estado_anterior`, `estado_nuevo`, `autor_id`, `comentario`, `created_at` | **Inmutable** (triggers contra `UPDATE`/`DELETE`/`TRUNCATE`, como `ot_evento`). `CHECK`: aprobar, rechazar y anular exigen `comentario` (en aprobar: la evidencia, p. ej. "OC 4512" o "WhatsApp de Juan Pérez 02/11") |
| `orden_trabajo` (ALTER) | `presupuesto_id NULL`, `proyecto_id NULL`, `monto_presupuestado_gs BIGINT NULL` | FK `(presupuesto_id, cliente_id)` y `(proyecto_id, cliente_id)`: **el presupuesto y el proyecto son del cliente de la OT**. Trigger: `presupuesto_id` y `monto_presupuestado_gs` no cambian una vez puestos |

**Ítems congelados:** trigger en `presupuesto_item` que rechaza `INSERT`/`UPDATE` si el presupuesto no está en `BORRADOR`. En borrador, el ítem que se quita se **marca inactivo** (`activo = false`), no se borra (principio 3).

Al final de la migración, la regla de tres pasos (RLS, `GRANT` mínimo sin `DELETE`, política `api_acceso`) para cada tabla nueva; `presupuesto_evento` con políticas separadas de `SELECT` e `INSERT`. Códigos con `siguiente_valor('PRE-2026')` / `siguiente_valor('PRY-2026')` dentro de la misma transacción.

## 3. Máquina de estados — `packages/shared/machines/presupuesto.ts`
`BORRADOR → ENVIADO | ANULADO` · `ENVIADO → APROBADO | RECHAZADO | REEMPLAZADO` · finales: `APROBADO`, `RECHAZADO`, `REEMPLAZADO`, `ANULADO`.

- **Enviar:** valida que haya ≥ 1 ítem activo y que **o todos los ítems tienen sucursal o ninguno**; calcula y congela `total_gs` (§4).
- **Nueva versión** (desde `ENVIADO` o `RECHAZADO`): en una transacción, el original pasa a `REEMPLAZADO` (si estaba `ENVIADO`) y se crea `version + 1` en `BORRADOR` copiando cabecera e ítems activos. El índice parcial garantiza una sola versión viva.
- **Aprobar:** ver §5. Cada transición: `SELECT … FOR UPDATE` y campo `desde` → `409` si cambió. Evento + auditoría en la misma transacción.

## 4. Cálculo — `packages/shared/formulas/presupuesto.ts` (funciones puras, con tests)
- `subtotal = cantidad × precio_unitario` sin redondear. `base = Σ subtotales`. `total_gs = round(base × (1 + margen_pct/100))` → **un solo redondeo**, al enviar.
- **Monto por OT** (multi-local): `round` por sucursal y el **resto** se ajusta en la sucursal de mayor monto, de modo que **Σ montos por OT = `total_gs` exacto**. Test obligatorio con montos que no dividen exacto.
- Cálculos en el servidor con `NUMERIC` (SQL) o con enteros escalados; nunca `float` de JS para guaraníes.

## 5. Aprobación → OTs (una transacción)
1. `FOR UPDATE` del presupuesto; `desde = 'ENVIADO'`; comentario (evidencia) obligatorio.
2. Agrupar ítems activos por `sucursal_id`.
   - **Ninguna o una sucursal** → **1 OT** (`titulo` = título del presupuesto), sin proyecto.
   - **Dos o más** → **1 proyecto** (`nombre` = título) + **1 OT por sucursal** (`titulo` = título · nombre de la sucursal), todas con `proyecto_id`.
3. Cada OT: `presupuesto_id`, `monto_presupuestado_gs` (§4), estado `PENDIENTE`, `ot_evento` inicial, código con `siguiente_valor`. Sin tareas: Comercial las agrega después en el detalle de OT (Loop 2).
4. Estado `APROBADO` + evento + auditoría + `publicarLive` después del commit.

Reintento de aprobación → `409` por `desde`: imposible crear OTs duplicadas.

## 6. Proyectos
- Se crean **solo** al aprobar (no hay alta manual en este loop). Una OT directa puede **asociarse** a un proyecto abierto del mismo cliente desde "Editar OT" (camino de urgencias dentro de una campaña).
- Cerrar o cancelar el proyecto exige que **todas sus OTs estén en estado final** → si no, `409` con la lista. Cancelar exige motivo.
- El detalle muestra sus OTs, con estado y monto presupuestado, y la suma. El costo real llega en el Loop 6.

## 7. API (capacidad `comercial`; todas las rutas entran al recorrido de CA-1.10)
`GET/POST /api/presupuestos` · `GET/PATCH /api/presupuestos/:id` (solo borrador, `updatedAt` → 409) · `POST /api/presupuestos/:id/items` · `PATCH /api/presupuestos/:id/items/:itemId` · `POST /api/presupuestos/:id/{enviar|aprobar|rechazar|anular|nueva-version}` · `GET /api/proyectos` · `GET /api/proyectos/:id` · `POST /api/proyectos/:id/{cerrar|cancelar}` · `POST /api/comercial/ot/:id/proyecto` `{ proyectoId | null, updatedAt }` (endpoint propio en vez de sumar `proyectoId` al PATCH: `ot.service.ts` estaba al límite de 250 líneas y así el control de 409 queda en una sola transacción).
Listados: 25 filas por servidor, búsqueda por número/título/**nombre de cliente** (trigram, como OTs), filtro de estado y rango de fechas.

## 8. Frontend
- `/presupuestos`: `TablaAdmin` con número + versión, cliente, título, total, estado.
- `/presupuestos/$id`: cabecera, editor de ítems (solo en borrador; sucursal opcional por ítem, del cliente), totales en vivo con la fórmula de `shared`, barra de acciones según estado, historial de versiones y de eventos. Un modal por acción (`ModalAprobarPresupuesto` con evidencia, `ModalRechazarPresupuesto`, `ModalAnularPresupuesto`).
- `/presupuestos/$id/imprimir`: página limpia para **imprimir o guardar como PDF desde el navegador** (sin librerías de PDF, sin costo): logo, cliente, ítems agrupados por sucursal, total, IVA informativo, validez.
- `/proyectos` y `/proyectos/$id`. En el detalle de OT: enlaces a su presupuesto y proyecto, y monto presupuestado.
- Menú: "Presupuestos" y "Proyectos" con `comercial`; la guarda de rutas de `AppLayout` los cubre.

## 9. Criterios de aceptación
- **CA-3.1** Ítems de un presupuesto no-borrador: `INSERT`/`UPDATE` rechazado **por el motor** (test con conexión `afull_api` directa).
- **CA-3.2** Ítem con sucursal de otro cliente: rechazado por FK compuesta.
- **CA-3.3** Dos versiones vivas del mismo número: imposible (índice parcial), también con dos "nueva versión" concurrentes.
- **CA-3.4** Aprobar dos veces en paralelo: exactamente una aprobación y un juego de OTs.
- **CA-3.5** Multi-local: N OTs + 1 proyecto, y Σ `monto_presupuestado_gs` = `total_gs` exacto (con montos que no dividen exacto).
- **CA-3.6** `total_gs` congelado al enviar: cambiar el margen o un ítem después → rechazado.
- **CA-3.7** Proyecto con OTs abiertas no se cierra (409).
- **CA-3.8** OT de un presupuesto no puede apuntar a presupuesto o proyecto de otro cliente (FK compuesta).
- **CA-3.9** Eventos de presupuesto inmutables para `afull_api`.
- **CA-3.10** Recorrido Playwright: crear presupuesto con 2 sucursales → enviar → v2 con 1 sucursal → aprobar con evidencia → aparece 1 OT con monto → imprimir muestra el total. Datos `zz_test_`, desactivados al final.

## 10. Entregas
- **L3.E1:** `0007` + máquina de estados + fórmulas con tests + CA-3.1, 3.2, 3.3, 3.8, 3.9. Verificar con `BEGIN … ROLLBACK` en `afull-dev` antes de aplicar.
- **L3.E2:** API de presupuestos (borrador, ítems, enviar, versiones, rechazar, anular) + CA-3.6.
- **L3.E3:** aprobación → OTs/proyecto, API de proyectos, `proyectoId` en OT + CA-3.4, 3.5, 3.7.
- **L3.E4:** frontend completo + impresión + CA-3.10.

## 11. Implementación (Claude Code, 2026-11-03)
- Migraciones `0007` (Antigravity) + `0008_comercial_blindaje` (Claude Code: cabecera congelada, ítems con lock `FOR SHARE`, `IS DISTINCT FROM`, total ≥ 0, total obligatorio salvo `BORRADOR`/`ANULADO`).
- API: `apps/api/src/modules/presupuestos/` (`consultas`, `borrador`, `transiciones`, `aprobacion`) y `apps/api/src/modules/proyectos/`.
- Web: `/presupuestos`, `/presupuestos/$id`, `/presupuestos/$id/imprimir` (fuera del layout), `/proyectos`, `/proyectos/$id`; enlaces y monto en el detalle de OT; "Creada por" con el nombre de usuario.
- Pruebas: `tests/loop3/*` (CA-3.1 a 3.9) y `scripts/prueba-loop3.cjs` (CA-3.10, 9/9 en local).
- **IVA aparte** (usuario, 2026-11-03): `total_gs` = precio sin IVA, que se reparte a las OTs; `iva_gs` = 10 % congelado al enviar (`0011`).
- **Margen SOBRE LA VENTA** (`0012`, confirmado por el usuario tras ver las planillas: en ~1.500 proyectos el precio es costo ÷ 0,70): precio = costo ÷ (1 − margen), 30 % por defecto, menor a 100 %. Botones 25/30/35/40 % o valor libre en el borrador.
- **Precio final redondeado** (`precio_final_gs`, opcional, como la "Vta redondeo" de las planillas): si está, manda sobre el calculado. El reparto a las OTs es **proporcional al costo** de cada sucursal, con ajuste de resto (Σ = total exacto).
