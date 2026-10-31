import { describe, it, expect, afterAll } from 'vitest';
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY, cerrarConexiones } from './helpers.js';

afterAll(cerrarConexiones);

describe('CA-0.7: Clave anónima bloqueada', () => {
  it('el rol anon no tiene privilegios sobre ninguna tabla pública', async () => {
    const tablas = await admin`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    expect(tablas.length).toBeGreaterThan(0);
    for (const { table_name } of tablas) {
      const [{ lee }] = await admin`
        SELECT has_table_privilege('anon', ${'public.' + table_name}, 'SELECT') AS lee
      `;
      expect(lee).toBe(false);
    }
  });

  it('PostgREST REST API rechaza consultas con anon key', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/usuario?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    expect([401, 403, 404]).toContain(res.status);
  });
});
