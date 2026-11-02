import { describe, it, expect, afterEach } from 'vitest';
import { app } from '../../apps/api/src/index.js';

// verificarOrigen lee NODE_ENV y APP_ORIGIN en cada request, así que se pueden variar por test.
// Se usa POST /api/auth/login con body vacío: si el CSRF deja pasar, el handler responde 400
// (body inválido) sin tocar la base; si el CSRF bloquea, responde 403.
const envOriginal = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN };

function restaurar(clave: 'NODE_ENV' | 'APP_ORIGIN') {
  const valor = envOriginal[clave];
  if (valor === undefined) delete process.env[clave];
  else process.env[clave] = valor;
}

afterEach(() => {
  restaurar('NODE_ENV');
  restaurar('APP_ORIGIN');
});

function intentar(origin?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return app.request('/api/auth/login', { method: 'POST', headers, body: '{}' });
}

describe('CSRF: verificarOrigen (lista de orígenes y excepción de desarrollo)', () => {
  it('en producción, http://localhost:5173 se rechaza aunque en desarrollo esté permitido', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://afull.example';
    expect((await intentar('http://localhost:5173')).status).toBe(403);
    expect((await intentar('https://afull.example')).status).toBe(400);
  });

  it('en producción, una petición de escritura sin Origin se rechaza', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://afull.example';
    expect((await intentar()).status).toBe(403);
  });

  it('en desarrollo, http://localhost:5173 se acepta además de APP_ORIGIN', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    expect((await intentar('http://localhost:5173')).status).toBe(400);
    expect((await intentar('http://localhost:3000')).status).toBe(400);
    expect((await intentar('https://evil.example')).status).toBe(403);
  });

  it('APP_ORIGIN con lista separada por comas acepta cada origen y rechaza otro', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGIN = 'https://a.example, https://b.example';
    expect((await intentar('https://a.example')).status).toBe(400);
    expect((await intentar('https://b.example')).status).toBe(400);
    expect((await intentar('https://c.example')).status).toBe(403);
  });
});
