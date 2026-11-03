import { Hono } from 'hono';
import { ZodError } from 'zod';
import { authRoutes } from './modules/auth/routes.js';
import { usuariosRoutes } from './modules/auth/usuarios.routes.js';
import { clientesRoutes } from './modules/clientes/routes.js';
import { otRoutes } from './modules/comercial/ot.routes.js';
import { tareasRoutes } from './modules/comercial/tareas.routes.js';
import { personasRoutes, tarifasRoutes } from './modules/personas/routes.js';
import { cronometroRoutes } from './modules/cronometro/routes.js';
import { liveRoutes } from './modules/live/routes.js';
import { presupuestosRoutes } from './modules/presupuestos/routes.js';
import { proyectosRoutes } from './modules/proyectos/routes.js';
import { flotaRoutes } from './modules/flota/routes.js';
import { hojasRutaRoutes } from './modules/hojas-ruta/routes.js';
import { campoRoutes } from './modules/campo/routes.js';
import { asistenciaRoutes } from './modules/asistencia/routes.js';
import { verificarOrigen } from './modules/auth/middleware.js';
import { ErrorApp } from './lib/errores.js';

export const app = new Hono();

app.use('*', verificarOrigen);
app.route('/api/auth', authRoutes);
app.route('/api/usuarios', usuariosRoutes);
app.route('/api/clientes', clientesRoutes);
app.route('/api/comercial/ot', otRoutes);
app.route('/api/tareas', tareasRoutes);
app.route('/api/personas', personasRoutes);
app.route('/api/tarifas', tarifasRoutes);
app.route('/api/mi-trabajo', cronometroRoutes);
app.route('/api/live', liveRoutes);
app.route('/api/presupuestos', presupuestosRoutes);
app.route('/api/proyectos', proyectosRoutes);
app.route('/api/flota', flotaRoutes);
app.route('/api/hojas-ruta', hojasRutaRoutes);
app.route('/api/campo', campoRoutes);
app.route('/api/asistencia', asistenciaRoutes);

app.onError((e, c) => {
  if (e instanceof ErrorApp) return c.json({ error: e.message }, e.status);
  if (e instanceof ZodError) return c.json({ error: 'Datos inválidos', detalle: e.issues }, 400);
  console.error(e);
  return c.json({ error: 'Error interno del servidor' }, 500);
});
