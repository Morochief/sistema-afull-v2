import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { nuevoPedidoPortalSchema } from '@afull/shared';
import { sql } from '../../db/client.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { TAM_PAGINA, desplazamiento, armarPagina } from '../../lib/paginacion.js';

export const hashTokenPortal = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const PEDIDOS_POR_DIA = 30;

type Portal = { accesoId: string; clienteId: string };
type Variables = { portal: Portal };

/**
 * Autenticación del portal: `Authorization: Portal <token>` (sin cookies → sin CSRF; el token viaja en el
 * fragmento del enlace, que el navegador no manda al servidor ni a otros sitios). Mismo 401 para token
 * inexistente, revocado, vencido o de un cliente inactivo.
 */
const requirePortal: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const m = /^Portal ([A-Za-z0-9_-]{20,100})$/.exec(c.req.header('authorization') ?? '');
  if (!m) throw new ErrorApp(401, 'Enlace inválido o vencido');
  const [a] = await sql`
    SELECT a.id, a.cliente_id, a.ultimo_uso_at FROM portal_acceso a JOIN cliente c ON c.id = a.cliente_id
    WHERE a.token_hash = ${hashTokenPortal(m[1])} AND a.activo AND a.expira_at > now() AND c.activo
  `;
  if (!a) throw new ErrorApp(401, 'Enlace inválido o vencido');
  // Último uso: a lo sumo cada 5 minutos (no escribir en cada consulta).
  if (!a.ultimo_uso_at || Date.now() - new Date(a.ultimo_uso_at).getTime() > 5 * 60_000) {
    await sql`UPDATE portal_acceso SET ultimo_uso_at = now() WHERE id = ${a.id}`;
  }
  c.set('portal', { accesoId: a.id, clienteId: a.cliente_id });
  await next();
};

const pagina = (q: string | undefined) => z.coerce.number().int().min(1).max(100_000).catch(1).parse(q);

/** Lo que ve el cliente: sus locales, sus trabajos (sin montos) y sus pedidos. Nunca datos de otro cliente. */
export const portalClienteRoutes = new Hono<{ Variables: Variables }>()
  .use('*', requirePortal)
  .get('/yo', async (c) => {
    const { clienteId, accesoId } = c.get('portal');
    const [cli] = await sql`SELECT nombre FROM cliente WHERE id = ${clienteId}`;
    const [a] = await sql`SELECT descripcion, expira_at FROM portal_acceso WHERE id = ${accesoId}`;
    const sucursales = await sql`SELECT id, nombre FROM sucursal WHERE cliente_id = ${clienteId} AND activo ORDER BY nombre`;
    return c.json({ cliente: cli.nombre, para: a.descripcion, expira_at: a.expira_at, sucursales: [...sucursales] });
  })
  .get('/ots', async (c) => {
    const { clienteId } = c.get('portal');
    const p = pagina(c.req.query('pagina'));
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM orden_trabajo WHERE cliente_id = ${clienteId}`;
    const items = await sql`
      SELECT o.id, o.codigo_ot, o.titulo, s.nombre AS sucursal, o.estado, o.fecha_prometida::text AS fecha_prometida, o.created_at, o.updated_at
      FROM orden_trabajo o LEFT JOIN sucursal s ON s.id = o.sucursal_id
      WHERE o.cliente_id = ${clienteId} ORDER BY o.created_at DESC, o.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(p)}
    `;
    return c.json(armarPagina([...items], total, p));
  })
  .get('/pedidos', async (c) => {
    const { clienteId } = c.get('portal');
    const p = pagina(c.req.query('pagina'));
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM pedido WHERE cliente_id = ${clienteId}`;
    const items = await sql`
      SELECT pe.id, pe.numero, s.nombre AS sucursal, pe.descripcion, pe.foto_url, pe.estado, pe.motivo_descarte, pe.created_at,
             o.codigo_ot, o.estado AS estado_ot, pr.numero AS presupuesto_numero
      FROM pedido pe LEFT JOIN sucursal s ON s.id = pe.sucursal_id
      LEFT JOIN orden_trabajo o ON o.id = pe.orden_trabajo_id LEFT JOIN presupuesto pr ON pr.id = pe.presupuesto_id
      WHERE pe.cliente_id = ${clienteId} ORDER BY pe.created_at DESC, pe.id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(p)}
    `;
    return c.json(armarPagina([...items], total, p));
  })
  .post('/pedidos', async (c) => {
    const { clienteId, accesoId } = c.get('portal');
    const d = nuevoPedidoPortalSchema.parse(await c.req.json().catch(() => null));
    try {
      const r = await sql.begin(async (tx) => {
        const [previo] = await tx`SELECT id, numero FROM pedido WHERE clave_idempotencia = ${d.claveIdempotencia} AND cliente_id = ${clienteId}`;
        if (previo) return { id: previo.id as string, numero: previo.numero as string, repetido: true };
        // Un enlace filtrado no puede inundar la bandeja de Comercial.
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM pedido WHERE portal_acceso_id = ${accesoId} AND created_at > now() - interval '1 day'`;
        if (n >= PEDIDOS_POR_DIA) throw new ErrorApp(429, 'Llegaste al límite de pedidos por hoy: comunicate con aFull');
        if (d.sucursalId) {
          const [s] = await tx`SELECT activo FROM sucursal WHERE id = ${d.sucursalId} AND cliente_id = ${clienteId}`;
          if (!s?.activo) throw new ErrorApp(400, 'Local inexistente');
        }
        const anio = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());
        const [{ v }] = await tx`SELECT siguiente_valor(${'PED-' + anio}) AS v`;
        const numero = `PED-${anio}-${String(v).padStart(4, '0')}`;
        const [pe] = await tx`
          INSERT INTO pedido (numero, cliente_id, sucursal_id, descripcion, foto_url, portal_acceso_id, clave_idempotencia)
          VALUES (${numero}, ${clienteId}, ${d.sucursalId ?? null}, ${d.descripcion}, ${d.fotoUrl ?? null}, ${accesoId}, ${d.claveIdempotencia})
          RETURNING id, numero
        `;
        // Sin usuario: la auditoría del sistema la hace Comercial al resolver; acá queda el acceso en el propio pedido.
        return { id: pe.id as string, numero: pe.numero as string, repetido: false };
      });
      return c.json(r, r.repetido ? 200 : 201);
    } catch (e) {
      if (e instanceof ErrorApp) throw e;
      traducirErrorPg(e);
    }
  });
