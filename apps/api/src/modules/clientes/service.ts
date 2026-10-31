import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { traducirErrorPg } from '../../lib/errores.js';

export type Ctx = { usuarioId: string; ip?: string };

export async function listarClientes(f: { pagina: number; q?: string; activo?: boolean }) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const donde = sql`WHERE true
    ${f.activo === undefined ? sql`` : sql`AND activo = ${f.activo}`}
    ${patron ? sql`AND (nombre ILIKE ${patron} OR razon_social ILIKE ${patron} OR ruc ILIKE ${patron} OR codigo ILIKE ${patron})` : sql``}`;

  const [{ total }] = await sql`SELECT count(*)::int AS total FROM cliente ${donde}`;
  const items = await sql`
    SELECT id, codigo, nombre, razon_social, ruc, telefono, email, activo FROM cliente ${donde}
    ORDER BY nombre, id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
  `;
  return armarPagina([...items], total, f.pagina);
}

export type NuevoCliente = { nombre: string; razonSocial?: string; ruc?: string; telefono?: string; email?: string };

export async function crearCliente(ctx: Ctx, d: NuevoCliente) {
  try {
    return await sql.begin(async (tx) => {
      const [{ v }] = await tx`SELECT siguiente_valor('CLI') AS v`;
      const codigo = `CLI-${String(v).padStart(4, '0')}`;
      const [c] = await tx`
        INSERT INTO cliente (codigo, nombre, razon_social, ruc, telefono, email)
        VALUES (${codigo}, ${d.nombre}, ${d.razonSocial ?? null}, ${d.ruc?.trim() || null}, ${d.telefono ?? null}, ${d.email ?? null})
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'cliente.crear', recurso: 'cliente', recursoId: c.id, ip: ctx.ip, metadata: { codigo, nombre: d.nombre } },
        tx,
      );
      return c;
    });
  } catch (e) {
    traducirErrorPg(e);
  }
}
