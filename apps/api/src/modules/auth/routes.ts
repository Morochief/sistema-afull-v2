import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { cambiarMiPasswordSchema } from '@afull/shared';
import { login, logout } from './service.js';
import { cambiarMiPassword } from './usuarios.service.js';
import { requireSesion } from './middleware.js';
import { COOKIE_SESION, DURACION_SESION_DIAS } from './session.js';
import { ErrorApp } from '../../lib/errores.js';
import { ipDe } from '../../lib/ip.js';

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const authRoutes = new Hono()
  .post('/login', async (c) => {
    const body = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ErrorApp(400, 'Usuario y contraseña requeridos');

    const { token, usuario } = await login(body.data.username, body.data.password, ipDe(c), c.req.header('user-agent'));
    setCookie(c, COOKIE_SESION, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: DURACION_SESION_DIAS * 24 * 60 * 60,
      path: '/',
    });
    return c.json({ ok: true, usuario });
  })
  .post('/logout', requireSesion, async (c) => {
    await logout(c.get('sesionId'), c.get('usuario').id, ipDe(c));
    deleteCookie(c, COOKIE_SESION, { path: '/' });
    return c.json({ ok: true });
  })
  .get('/yo', requireSesion, (c) => c.json(c.get('usuario')))
  .post('/cambiar-password', requireSesion, async (c) => {
    const d = cambiarMiPasswordSchema.parse(await c.req.json().catch(() => null));
    return c.json(await cambiarMiPassword({ usuarioId: c.get('usuario').id, ip: ipDe(c) }, c.get('sesionId'), d.actual, d.nueva));
  });
