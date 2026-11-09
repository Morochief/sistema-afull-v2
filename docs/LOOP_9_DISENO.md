# Loop 9 — Portal del cliente y pedidos (diseño de Claude Code)

> **Estado:** IMPLEMENTADO por Claude Code el 2026-11-03, sin commit. Migración `0016_portal.sql`.

## 0. Qué resuelve
El cliente (por ejemplo, el encargado de una cadena) entra con **un enlace, sin usuario ni contraseña**, ve en qué estado están sus trabajos y **pide trabajos nuevos por local**. Comercial recibe los pedidos en una bandeja y los convierte en OT o presupuesto, o los descarta con motivo.

## 1. Seguridad del enlace
- Token de **32 bytes aleatorios**; en la base solo su **SHA-256** (`portal_acceso.token_hash`). Se muestra **una sola vez** al generarlo; no va a la auditoría ni a los listados.
- Va en el **fragmento** (`/portal#t=…`): el navegador no lo manda al servidor ni a otros sitios (no queda en logs ni en *referrer*). La página lo guarda en la pestaña (`sessionStorage`) y lo borra de la barra.
- La API lo recibe en `Authorization: Portal <token>`: **sin cookies** (sin CSRF) y separado de la sesión interna (una sesión de empleado no sirve en el portal, ni al revés).
- **Mismo 401** para token inexistente, revocado, vencido o de cliente inactivo. Vence a los **180 días** por defecto; se **revoca** y no se reactiva (se genera otro).
- Límite de **30 pedidos por día por enlace** (un enlace filtrado no inunda la bandeja). Pedidos idempotentes.
- El portal **no muestra dinero** (ni montos de OT ni de presupuesto) y **nunca** datos de otro cliente: todo se filtra por el `cliente_id` del enlace; el local de un pedido tiene que ser del cliente (FK compuesta).

## 2. Pedidos
- `pedido` (`PED-AAAA-NNNN`): local opcional, descripción, foto **por enlace** (hasta tener almacenamiento), acceso que lo cargó.
- Se resuelve **una vez** (trigger): `NUEVO → CONVERTIDO` (en OT o en presupuesto borrador, **en la misma transacción**, con FK compuesta al mismo cliente) o `→ DESCARTADO` con motivo (lo ve el cliente). Lo que cargó el cliente no se modifica.

## 3. API
- Portal: `GET /api/portal/yo`, `GET /api/portal/ots`, `GET|POST /api/portal/pedidos`.
- Comercial: `GET /api/portal-accesos/cliente/:id`, `POST /api/portal-accesos`, `POST /api/portal-accesos/:id/revocar`; `GET /api/pedidos` (25 por página, búsqueda, estado, fechas), `GET /api/pedidos/:id`, `POST /api/pedidos/:id/convertir` (`a: OT | PRESUPUESTO`), `POST /api/pedidos/:id/descartar`.

## 4. Pantallas
- **/portal** (pública, celular primero): "Mis pedidos" (formulario + lista con el estado en palabras de cliente: Recibido, Presupuestando, En producción, En instalación, Terminado, No se realizará) y "Trabajos".
- **Cliente → Portal del cliente** (Comercial): generar enlace (se copia una vez), ver uso y vencimiento, revocar.
- **Pedidos** (menú, Comercial): bandeja con "Crear OT", "Crear presupuesto" o "Descartar".

## 5. Pruebas
`tests/loop9/portal-api.test.ts` (CA-9.1 a CA-9.4: token solo hasheado, aislamiento entre clientes, 401 uniforme, revocado y vencido, conversión única) · `apps/web/src/lib/api-portal.test.ts` · `scripts/prueba-loop9.cjs` 7/7.

## 6. Supuestos a confirmar
1. Vigencia de **180 días** y **30 pedidos por día** por enlace.
2. El cliente ve **todas** sus OTs (también las que no nacieron de un pedido), sin montos.
3. Antes de dar enlaces a clientes reales: **producción** (bloqueo de TRASPASO §12) y revisar el plan de Vercel (uso comercial).

## 6. L9.E2 — Seguimiento del pedido hasta el final (2026-11-09)
**Problema encontrado:** un pedido convertido en **presupuesto** quedaba atado al presupuesto: aunque se aprobara y naciera la OT, el cliente seguía viendo "Presupuestando" (y también si se rechazaba o se reemplazaba por otra versión). El camino **pedido → OT directa** (sin presupuesto, como pasa con muchos trabajos) ya funcionaba y no cambia.

**Regla: qué OT sigue un pedido**
1. Convertido en **OT directa** → esa OT.
2. Convertido en **presupuesto** → se mira la **versión vigente** de ese presupuesto (la última con el mismo número; así una v2 reemplaza a la v1). Si está **aprobada**, el pedido sigue la OT que generó: la del **mismo local** del pedido; si no hay local o no coincide, la **menos avanzada** de esas OTs (el cliente ve "Terminado" recién cuando terminó todo). Las canceladas solo cuentan si no queda otra.

**Qué ve el cliente** (`estadoPedidoCliente` en `@afull/shared`, una sola regla para la API, la web y los tests):
| Situación | Texto |
| :--- | :--- |
| Sin resolver | Recibido |
| Descartado | No se realizará (con el motivo que escribió Sofi) |
| Presupuesto vigente en borrador o enviado | Presupuestando |
| Presupuesto vigente **rechazado o anulado** | No se realizará (sin el comentario interno) |
| Sigue una OT | El estado de la OT en palabras de cliente (Recibido, En diseño, En producción, En instalación, Terminado, Cancelado) |

La bandeja interna de Pedidos muestra lo mismo: la OT que sigue el pedido (aunque haya nacido de un presupuesto) o el presupuesto vigente.

**Criterios:** CA-9.5 OT directa sigue los cambios de estado · CA-9.6 presupuesto aprobado → sigue la OT generada · CA-9.7 versión nueva → sigue la vigente · CA-9.8 rechazado → "No se realizará" · CA-9.9 multi-local → la OT del local del pedido · CA-9.10 la bandeja interna muestra la OT.
**Pruebas:** `tests/loop9/seguimiento-pedido.test.ts` (11), `apps/web/src/components/portal/ListasPortal.test.tsx` (4), `scripts/prueba-seguimiento-pedido.cjs` (6/6). **Estado:** CERRADO el 2026-11-09.
