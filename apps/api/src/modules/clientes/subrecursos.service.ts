import { sql } from '../../db/client.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { Ctx } from './service.js';

export type NuevoContacto = { nombre: string; cargo?: string; telefono?: string; email?: string; esPrincipal?: boolean };
export type PatchContacto = {
  nombre?: string;
  cargo?: string | null;
  telefono?: string | null;
  email?: string | null;
  esPrincipal?: boolean;
};

export async function crearContacto(ctx: Ctx, clienteId: string, d: NuevoContacto) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT id FROM cliente WHERE id = ${clienteId} FOR UPDATE`;
      if (!c) throw new ErrorApp(404, 'Cliente no encontrado');
      const esPrincipal = d.esPrincipal ?? false;
      if (esPrincipal) {
        await tx`UPDATE cliente_contacto SET es_principal = false WHERE cliente_id = ${clienteId} AND es_principal = true`;
      }
      const [ct] = await tx`
        INSERT INTO cliente_contacto (cliente_id, nombre, cargo, telefono, email, es_principal)
        VALUES (${clienteId}, ${d.nombre}, ${d.cargo ?? null}, ${d.telefono ?? null}, ${d.email ?? null}, ${esPrincipal})
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'contacto.crear', recurso: 'cliente_contacto', recursoId: ct.id, ip: ctx.ip, metadata: { clienteId, nombre: d.nombre, esPrincipal } },
        tx,
      );
      return ct;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function editarContacto(ctx: Ctx, clienteId: string, contactoId: string, d: PatchContacto) {
  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT id FROM cliente WHERE id = ${clienteId} FOR UPDATE`;
      const [actual] = await tx`SELECT * FROM cliente_contacto WHERE id = ${contactoId} AND cliente_id = ${clienteId} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Contacto no encontrado');

      const esPrincipal = d.esPrincipal ?? (actual.es_principal as boolean);
      if (esPrincipal && actual.activo) {
        await tx`
          UPDATE cliente_contacto SET es_principal = false
          WHERE cliente_id = ${clienteId} AND es_principal = true AND id <> ${contactoId}
        `;
      }
      const nombre = d.nombre ?? actual.nombre;
      const cargo = d.cargo === undefined ? actual.cargo : d.cargo;
      const telefono = d.telefono === undefined ? actual.telefono : d.telefono;
      const email = d.email === undefined ? actual.email : d.email;

      const [ct] = await tx`
        UPDATE cliente_contacto
        SET nombre = ${nombre}, cargo = ${cargo}, telefono = ${telefono}, email = ${email}, es_principal = ${esPrincipal}
        WHERE id = ${contactoId} AND cliente_id = ${clienteId}
        RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'contacto.editar', recurso: 'cliente_contacto', recursoId: contactoId, ip: ctx.ip, metadata: { clienteId, nombre, esPrincipal } },
        tx,
      );
      return ct;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cambiarEstadoContacto(ctx: Ctx, clienteId: string, contactoId: string, activo: boolean) {
  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT id FROM cliente WHERE id = ${clienteId} FOR UPDATE`;
      const [actual] = await tx`SELECT * FROM cliente_contacto WHERE id = ${contactoId} AND cliente_id = ${clienteId} FOR UPDATE`;
      if (!actual) throw new ErrorApp(404, 'Contacto no encontrado');

      if (activo && actual.es_principal) {
        await tx`
          UPDATE cliente_contacto SET es_principal = false
          WHERE cliente_id = ${clienteId} AND es_principal = true AND id <> ${contactoId}
        `;
      }
      const [ct] = await tx`
        UPDATE cliente_contacto SET activo = ${activo} WHERE id = ${contactoId} AND cliente_id = ${clienteId} RETURNING *
      `;
      const accion = activo ? 'contacto.reactivar' : 'contacto.desactivar';
      await auditar(
        { usuarioId: ctx.usuarioId, accion, recurso: 'cliente_contacto', recursoId: contactoId, ip: ctx.ip, metadata: { clienteId, activo } },
        tx,
      );
      return ct;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function crearMarca(ctx: Ctx, clienteId: string, d: { nombre: string }) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT id FROM cliente WHERE id = ${clienteId}`;
      if (!c) throw new ErrorApp(404, 'Cliente no encontrado');
      const [m] = await tx`
        INSERT INTO cliente_marca (cliente_id, nombre) VALUES (${clienteId}, ${d.nombre}) RETURNING *
      `;
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'marca.crear', recurso: 'cliente_marca', recursoId: m.id, ip: ctx.ip, metadata: { clienteId, nombre: d.nombre } },
        tx,
      );
      return m;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function editarMarca(ctx: Ctx, clienteId: string, marcaId: string, d: { nombre: string }) {
  try {
    return await sql.begin(async (tx) => {
      const [m] = await tx`
        UPDATE cliente_marca SET nombre = ${d.nombre} WHERE id = ${marcaId} AND cliente_id = ${clienteId} RETURNING *
      `;
      if (!m) throw new ErrorApp(404, 'Marca no encontrada');
      await auditar(
        { usuarioId: ctx.usuarioId, accion: 'marca.editar', recurso: 'cliente_marca', recursoId: marcaId, ip: ctx.ip, metadata: { clienteId, nombre: d.nombre } },
        tx,
      );
      return m;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cambiarEstadoMarca(ctx: Ctx, clienteId: string, marcaId: string, activo: boolean) {
  try {
    return await sql.begin(async (tx) => {
      const [m] = await tx`
        UPDATE cliente_marca SET activo = ${activo} WHERE id = ${marcaId} AND cliente_id = ${clienteId} RETURNING *
      `;
      if (!m) throw new ErrorApp(404, 'Marca no encontrada');
      const accion = activo ? 'marca.reactivar' : 'marca.desactivar';
      await auditar(
        { usuarioId: ctx.usuarioId, accion, recurso: 'cliente_marca', recursoId: marcaId, ip: ctx.ip, metadata: { clienteId, activo } },
        tx,
      );
      return m;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
