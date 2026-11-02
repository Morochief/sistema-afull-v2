import { sql } from '../../db/client.js';
import type { Sql } from 'postgres';
import { auditar } from '../auditoria/service.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';

export type Ctx = { usuarioId: string; ip?: string };

export type FiltroClientes = {
  pagina: number;
  q?: string;
  activo?: boolean;
  desde?: string;
  hasta?: string;
};

export async function esperarAvanceReloj(updatedAtIso: string): Promise<void> {
  const t = Date.parse(updatedAtIso);
  if (!Number.isNaN(t) && Date.now() <= t) {
    await new Promise((r) => setTimeout(r, 2));
  }
}

export function verificarUpdatedAt(actual: Date | string, enviado: string): void {
  const tActual = new Date(actual).getTime();
  const tEnviado = Date.parse(enviado);
  if (Number.isNaN(tEnviado) || tActual !== tEnviado) {
    throw new ErrorApp(409, 'El registro fue modificado por otro usuario; recargue los datos');
  }
}

export function dondeClientes(f: Omit<FiltroClientes, 'pagina'>, runner: Sql = sql) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return runner`WHERE true
    ${f.activo === undefined ? runner`` : runner`AND activo = ${f.activo}`}
    ${patron ? runner`AND (nombre ILIKE ${patron} OR razon_social ILIKE ${patron} OR ruc ILIKE ${patron} OR codigo ILIKE ${patron})` : runner``}
    ${f.desde ? runner`AND created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : runner``}
    ${f.hasta ? runner`AND created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : runner``}`;
}

export function queryListarClientes(f: FiltroClientes, runner: Sql = sql) {
  const donde = dondeClientes(f, runner);
  return runner`
    SELECT id, codigo, nombre, razon_social, ruc, telefono, email, activo, created_at, updated_at
    FROM cliente ${donde}
    ORDER BY nombre, id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
  `;
}

export async function listarClientes(f: FiltroClientes) {
  try {
    const donde = dondeClientes(f);
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM cliente ${donde}`;
    const items = await queryListarClientes(f);
    return armarPagina([...items], total, f.pagina);
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function obtenerDetalleCliente(id: string) {
  try {
    const [cliente] = await sql`
      SELECT id, codigo, nombre, razon_social, ruc, telefono, email, activo, created_at, updated_at
      FROM cliente WHERE id = ${id}
    `;
    if (!cliente) throw new ErrorApp(404, 'Cliente no encontrado');

    const [sucursales, contactos, marcas] = await Promise.all([
      sql`SELECT id, cliente_id, nombre, ciudad, direccion, gps_lat, gps_lng, activo, created_at, updated_at FROM sucursal WHERE cliente_id = ${id} ORDER BY nombre, id`,
      sql`SELECT id, cliente_id, nombre, cargo, telefono, email, es_principal, activo, created_at FROM cliente_contacto WHERE cliente_id = ${id} ORDER BY es_principal DESC, nombre, id`,
      sql`SELECT id, cliente_id, nombre, activo, created_at FROM cliente_marca WHERE cliente_id = ${id} ORDER BY nombre, id`,
    ]);

    return { ...cliente, sucursales: [...sucursales], contactos: [...contactos], marcas: [...marcas] };
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
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

export type PatchCliente = {
  nombre?: string;
  razonSocial?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  email?: string | null;
  updatedAt: string;
};

export async function editarCliente(ctx: Ctx, id: string, d: PatchCliente) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx`SELECT * FROM cliente WHERE id = ${id} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Cliente no encontrado');
      verificarUpdatedAt(actual.updated_at, d.updatedAt);

      const nombre = d.nombre ?? actual.nombre;
      const razonSocial = d.razonSocial === undefined ? actual.razon_social : d.razonSocial;
      const ruc = d.ruc === undefined ? actual.ruc : (d.ruc?.trim() || null);
      const telefono = d.telefono === undefined ? actual.telefono : d.telefono;
      const email = d.email === undefined ? actual.email : d.email;

      const [c] = await tx`
        UPDATE cliente
        SET nombre = ${nombre}, razon_social = ${razonSocial}, ruc = ${ruc}, telefono = ${telefono}, email = ${email}
        WHERE id = ${id}
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'cliente.editar', recurso: 'cliente', recursoId: id, ip: ctx.ip, metadata: { nombre } },
        tx,
      );
      return c;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cambiarEstadoCliente(ctx: Ctx, id: string, d: { activo: boolean; updatedAt: string }) {
  await esperarAvanceReloj(d.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx`SELECT id, activo, updated_at FROM cliente WHERE id = ${id} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Cliente no encontrado');
      verificarUpdatedAt(actual.updated_at, d.updatedAt);

      const [{ abiertas }] = await tx`
        SELECT count(*)::int AS abiertas FROM orden_trabajo
        WHERE cliente_id = ${id} AND estado NOT IN ('TERMINADO', 'CANCELADO')
      `;

      const [c] = await tx`
        UPDATE cliente SET activo = ${d.activo} WHERE id = ${id} RETURNING *
      `;
      const accion = d.activo ? 'cliente.reactivar' : 'cliente.desactivar';
      await auditar(
        { usuarioId: ctx.usuarioId, accion, recurso: 'cliente', recursoId: id, ip: ctx.ip, metadata: { activo: d.activo, otsAbiertas: abiertas } },
        tx,
      );
      const advertencia = !d.activo && abiertas > 0 ? `El cliente tiene ${abiertas} OT(s) abierta(s)` : null;
      return { ...c, advertencia };
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
