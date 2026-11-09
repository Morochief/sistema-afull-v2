import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { filtroArchivosSchema, solicitarArchivoSchema } from '@afull/shared';
import { requireSesion, requireCapacidad } from '../auth/middleware.js';
import { ipDe } from '../../lib/ip.js';
import { almacenamientoMemoria } from '../../lib/almacenamiento.js';
import { ErrorApp } from '../../lib/errores.js';
import type { Actor } from './referencias.js';
import { solicitarSubida, confirmarSubida, listarArchivos, usoAlmacenamiento } from './service.js';

const actorDe = (c: Context): Actor => {
  const u = c.get('usuario');
  return { tipo: 'usuario', usuarioId: u.id, capacidades: u.capacidades, ip: ipDe(c) };
};
const idDe = (c: Context) => z.string().uuid().parse(c.req.param('id'));

/**
 * Fotos y archivos con sesión. Cada tipo valida en el servicio quién puede subir y ver (ver referencias.ts):
 * no hay una capacidad única porque el odómetro es del conductor, la muestra de taller, el comprobante del empleado…
 */
export const archivosRoutes = new Hono()
  .use('*', requireSesion)
  .get('/', async (c) => c.json(await listarArchivos(actorDe(c), filtroArchivosSchema.parse(c.req.query()))))
  .get('/uso', requireCapacidad('admin'), async (c) => c.json(await usoAlmacenamiento()))
  .post('/solicitar', async (c) => {
    const r = await solicitarSubida(actorDe(c), solicitarArchivoSchema.parse(await c.req.json().catch(() => null)));
    return c.json(r, 201);
  })
  .post('/:id/confirmar', async (c) => c.json(await confirmarSubida(actorDe(c), idDe(c))));

/**
 * Solo con ALMACENAMIENTO=memoria y fuera de producción (lo decide index.ts al montarlo): imita a Storage
 * para recorrer la app en local sin Supabase. Mismo tope que el bucket (10 MB).
 */
export const archivosFalsoRoutes = new Hono()
  .put('/subir/*', async (c) => {
    const ruta = c.req.path.replace(/^.*\/subir\//, '');
    const datos = new Uint8Array(await c.req.arrayBuffer());
    if (datos.byteLength > 10 * 1024 * 1024) return c.json({ error: 'Payload too large' }, 413);
    almacenamientoMemoria().objetos.set(ruta, { datos, mime: c.req.header('content-type') ?? null });
    return c.json({ Key: ruta });
  })
  .get('/ver/*', (c) => {
    const o = almacenamientoMemoria().objetos.get(c.req.path.replace(/^.*\/ver\//, ''));
    if (!o) throw new ErrorApp(404, 'No encontrado');
    return c.body(o.datos as unknown as ArrayBuffer, 200, { 'content-type': o.mime ?? 'application/octet-stream' });
  });
