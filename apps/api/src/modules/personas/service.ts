import { sql } from '../../db/client.js';
import type { Sql } from 'postgres';
import { auditar } from '../auditoria/service.js';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import type { PersonaFila } from '@afull/shared';

export type Ctx = { usuarioId: string; ip?: string };

export type FiltroPersonas = {
  pagina: number;
  q?: string;
  activo?: boolean;
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

export function dondePersonas(f: Omit<FiltroPersonas, 'pagina'>, runner: Sql = sql) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  return runner`WHERE ${true}
    ${f.activo === undefined ? runner`` : runner`AND p.activo = ${f.activo}`}
    ${patron ? runner`AND (p.nombre ILIKE ${patron} OR p.ci ILIKE ${patron} OR p.cargo ILIKE ${patron} OR p.departamento ILIKE ${patron})` : runner``}`;
}

export async function listarPersonas(f: FiltroPersonas) {
  try {
    const donde = dondePersonas(f);
    const [{ total }] = await sql`
      SELECT count(*)::int AS total
      FROM persona p
      ${donde}
    `;

    const items = await sql<PersonaFila[]>`
      SELECT p.id, p.nombre, p.ci, p.cargo, p.departamento, p.jefe_id, p.activo,
             p.created_at, p.updated_at,
             u.id AS usuario_id, u.username
      FROM persona p
      LEFT JOIN usuario u ON u.persona_id = p.id
      ${donde}
      ORDER BY p.nombre, p.id
      LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}
    `;

    return armarPagina([...items], total, f.pagina);
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function obtenerPersona(id: string): Promise<PersonaFila> {
  try {
    const [p] = await sql<PersonaFila[]>`
      SELECT p.id, p.nombre, p.ci, p.cargo, p.departamento, p.jefe_id, p.activo,
             p.created_at, p.updated_at,
             u.id AS usuario_id, u.username
      FROM persona p
      LEFT JOIN usuario u ON u.persona_id = p.id
      WHERE p.id = ${id}
    `;
    if (!p) throw new ErrorApp(404, 'Persona no encontrada');
    return p;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function crearPersona(ctx: Ctx, datos: { nombre: string; ci: string; cargo?: string; departamento?: string }) {
  try {
    const [p] = await sql<PersonaFila[]>`
      INSERT INTO persona (nombre, ci, cargo, departamento)
      VALUES (${datos.nombre}, ${datos.ci}, ${datos.cargo ?? null}, ${datos.departamento ?? null})
      RETURNING id, nombre, ci, cargo, departamento, jefe_id, activo, created_at, updated_at,
                NULL::uuid AS usuario_id, NULL::varchar AS username
    `;
    await auditar({
      usuarioId: ctx.usuarioId,
      accion: 'PERSONA_CREAR',
      recurso: 'persona',
      recursoId: p.id,
      ip: ctx.ip,
      metadata: { nombre: p.nombre, ci: p.ci },
    });
    return p;
  } catch (e) {
    traducirErrorPg(e);
  }
}

export async function editarPersona(
  ctx: Ctx,
  id: string,
  datos: { nombre?: string; ci?: string; cargo?: string | null; departamento?: string | null; updatedAt: string }
) {
  await esperarAvanceReloj(datos.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx<{ id: string; nombre: string; ci: string; cargo: string | null; departamento: string | null; updated_at: string }[]>`
        SELECT id, nombre, ci, cargo, departamento, updated_at FROM persona WHERE id = ${id} FOR UPDATE
      `;
      if (!actual) throw new ErrorApp(404, 'Persona no encontrada');
      verificarUpdatedAt(actual.updated_at, datos.updatedAt);

      const nombre = datos.nombre ?? actual.nombre;
      const ci = datos.ci ?? actual.ci;
      const cargo = datos.cargo === undefined ? actual.cargo : datos.cargo;
      const departamento = datos.departamento === undefined ? actual.departamento : datos.departamento;

      const [p] = await tx<PersonaFila[]>`
        UPDATE persona SET
          nombre = ${nombre},
          ci = ${ci},
          cargo = ${cargo},
          departamento = ${departamento}
        WHERE id = ${id}
        RETURNING id, nombre, ci, cargo, departamento, jefe_id, activo, created_at, updated_at,
                  NULL::uuid AS usuario_id, NULL::varchar AS username
      `;

      const [u] = await tx<{ id: string; username: string }[]>`
        SELECT id, username FROM usuario WHERE persona_id = ${id}
      `;
      if (u) {
        p.usuario_id = u.id;
        p.username = u.username;
      }

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: 'persona.editar',
          recurso: 'persona',
          recursoId: p.id,
          ip: ctx.ip,
          metadata: { nombre, ci },
        },
        tx
      );
      return p;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}

export async function cambiarEstadoPersona(
  ctx: Ctx,
  id: string,
  datos: { activo: boolean; updatedAt: string }
) {
  await esperarAvanceReloj(datos.updatedAt);
  try {
    return await sql.begin(async (tx) => {
      const [actual] = await tx<{ id: string; updated_at: string }[]>`
        SELECT id, updated_at FROM persona WHERE id = ${id} FOR UPDATE
      `;
      if (!actual) throw new ErrorApp(404, 'Persona no encontrada');
      verificarUpdatedAt(actual.updated_at, datos.updatedAt);

      const [p] = await tx<PersonaFila[]>`
        UPDATE persona SET activo = ${datos.activo}
        WHERE id = ${id}
        RETURNING id, nombre, ci, cargo, departamento, jefe_id, activo, created_at, updated_at,
                  NULL::uuid AS usuario_id, NULL::varchar AS username
      `;

      const [u] = await tx<{ id: string; username: string }[]>`
        SELECT id, username FROM usuario WHERE persona_id = ${id}
      `;
      if (u) {
        p.usuario_id = u.id;
        p.username = u.username;
      }

      await auditar(
        {
          usuarioId: ctx.usuarioId,
          accion: datos.activo ? 'persona.activar' : 'persona.desactivar',
          recurso: 'persona',
          recursoId: p.id,
          ip: ctx.ip,
          metadata: { activo: datos.activo },
        },
        tx
      );
      return p;
    });
  } catch (e) {
    if (e instanceof ErrorApp) throw e;
    traducirErrorPg(e);
  }
}
