import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nuevoProcesoSchema, patchProcesoSchema } from '@afull/shared';
import { sql } from '../../db/client.js';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { auditar } from '../auditoria/service.js';
import { ErrorApp, traducirErrorPg } from '../../lib/errores.js';
import { ipDe } from '../../lib/ip.js';

/** "Pintura de fachada" → "PINTURA_DE_FACHADA" (sin tildes ni símbolos). */
export const codigoDesdeNombre = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

const COLS = sql`codigo, nombre, area, orden, activo`;

/** Catálogo de procesos (tipos de tarea): lo lee cualquiera con sesión; lo administra admin (Juan). Nada se borra. */
export const procesosRoutes = new Hono()
  .use('*', requireSesion)
  .get('/', async (c) => c.json([...(await sql`SELECT ${COLS} FROM tipo_tarea ORDER BY activo DESC, orden, nombre`)]))
  .post('/', requireCapacidad('admin'), async (c: Context) => {
    const d = nuevoProcesoSchema.parse(await c.req.json().catch(() => null));
    const codigo = codigoDesdeNombre(d.nombre);
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(codigo)) throw new ErrorApp(400, 'El nombre tiene que empezar con una letra');
    try {
      const r = await sql.begin(async (tx) => {
        const [p] = await tx`
          INSERT INTO tipo_tarea (codigo, nombre, area) VALUES (${codigo}, ${d.nombre}, ${d.area}) RETURNING ${COLS}
        `;
        await auditar({ usuarioId: c.get('usuario').id, accion: 'proceso.crear', recurso: 'tipo_tarea', ip: ipDe(c), metadata: { codigo } }, tx);
        return p;
      });
      return c.json(r, 201);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ErrorApp(409, 'Ya existe un proceso con ese nombre');
      traducirErrorPg(e);
    }
  })
  .patch('/:codigo', requireCapacidad('admin'), async (c: Context) => {
    const codigo = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/).parse(c.req.param('codigo'));
    const d = patchProcesoSchema.parse(await c.req.json().catch(() => null));
    try {
      const r = await sql.begin(async (tx) => {
        const [a] = await tx`SELECT * FROM tipo_tarea WHERE codigo = ${codigo} FOR UPDATE`;
        if (!a) throw new ErrorApp(404, 'Proceso no encontrado');
        const [p] = await tx`
          UPDATE tipo_tarea SET nombre = ${d.nombre ?? a.nombre}, area = ${d.area ?? a.area},
                 orden = ${d.orden ?? a.orden}, activo = ${d.activo ?? a.activo}
          WHERE codigo = ${codigo} RETURNING ${COLS}
        `;
        await auditar({ usuarioId: c.get('usuario').id, accion: 'proceso.editar', recurso: 'tipo_tarea', ip: ipDe(c), metadata: { codigo, ...d } }, tx);
        return p;
      });
      return c.json(r);
    } catch (e) {
      if (e instanceof ErrorApp) throw e;
      if ((e as { code?: string }).code === '23505') throw new ErrorApp(409, 'Ya existe un proceso con ese nombre');
      traducirErrorPg(e);
    }
  });
