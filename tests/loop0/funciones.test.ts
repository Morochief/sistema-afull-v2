import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';

afterAll(cerrarConexiones);

describe('CA-0.7: Funciones y privilegios por defecto cerrados en public', () => {
  it('ninguna función actual en el esquema public es ejecutable por anon ni authenticated', async () => {
    const rutinas = await admin`
      SELECT
        p.proname,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS "anonExec",
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS "authExec"
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    `;
    expect(rutinas.length).toBeGreaterThan(0);

    for (const r of rutinas) {
      expect(r.anonExec).toBe(false);
      expect(r.authExec).toBe(false);
    }
  });

  it('funciones nuevas creadas por postgres nacen con EXECUTE cerrado para PUBLIC, anon, authenticated y afull_api', async () => {
    const errorCentinela = new Error('ROLLBACK_INTENCIONAL');

    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(`CREATE FUNCTION public.zz_test_fn_default_acl() RETURNS int LANGUAGE sql AS 'SELECT 1'`);

        const [permisos] = await tx<[{ anonExec: boolean; authExec: boolean; apiExec: boolean }]>`
          SELECT
            has_function_privilege('anon', 'public.zz_test_fn_default_acl()', 'EXECUTE') AS "anonExec",
            has_function_privilege('authenticated', 'public.zz_test_fn_default_acl()', 'EXECUTE') AS "authExec",
            has_function_privilege('afull_api', 'public.zz_test_fn_default_acl()', 'EXECUTE') AS "apiExec"
        `;

        expect(permisos.anonExec).toBe(false);
        expect(permisos.authExec).toBe(false);
        expect(permisos.apiExec).toBe(false);

        throw errorCentinela;
      }),
    ).rejects.toThrow(errorCentinela);

    const [fnExiste] = await admin`
      SELECT count(*)::int AS total FROM pg_proc WHERE proname = 'zz_test_fn_default_acl'
    `;
    expect(fnExiste.total).toBe(0);
  });
});
