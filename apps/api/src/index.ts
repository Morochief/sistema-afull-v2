import { Hono } from 'hono';
import { ZodError } from 'zod';
import { authRoutes } from './modules/auth/routes.js';
import { clientesRoutes } from './modules/clientes/routes.js';
import { otRoutes } from './modules/comercial/ot.routes.js';
import { verificarOrigen } from './modules/auth/middleware.js';
import { ErrorApp } from './lib/errores.js';

export const app = new Hono();

app.use('*', verificarOrigen);
app.route('/api/auth', authRoutes);
app.route('/api/clientes', clientesRoutes);
app.route('/api/comercial/ot', otRoutes);

app.onError((e, c) => {
  if (e instanceof ErrorApp) return c.json({ error: e.message }, e.status);
  if (e instanceof ZodError) return c.json({ error: 'Datos inválidos', detalle: e.issues }, 400);
  console.error(e);
  return c.json({ error: 'Error interno del servidor' }, 500);
});
