import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from './helpers.js';

/**
 * Loop 0 (cierre, docs/LOOP_0_RESPALDOS_DISENO.md, CA-R.1): rol de solo lectura para pg_dump.
 * Nunca se le pone clave acá (este test también corre contra afull-dev): la lectura real se prueba con SET ROLE
 * dentro de una transacción que se deshace.
 */
afterAll(cerrarConexiones);
const ROL = 'afull_respaldo';

describe('Loop 0 — rol afull_respaldo', () => {
  it('existe, sin login por defecto, y salta RLS (si no, pg_dump no puede leer las tablas)', async () => {
    const [r] = await admin`SELECT rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = ${ROL}`;
    expect(r).toBeTruthy();
    expect([r.rolbypassrls, r.rolsuper, r.rolcreaterole, r.rolcreatedb]).toEqual([true, false, false, false]);
  });

  it('lee todas las tablas y secuencias de public y drizzle, y no puede escribir, borrar ni ejecutar funciones', async () => {
    const tablas = await admin<{ t: string }[]>`
      SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS t FROM pg_tables WHERE schemaname IN ('public', 'drizzle') AND tablename LIKE ${'%'}`;
    expect(tablas.length).toBeGreaterThan(20);
    for (const { t } of tablas) {
      const [p] = await admin`SELECT has_table_privilege(${ROL}, ${t}, 'SELECT') AS sel,
        has_table_privilege(${ROL}, ${t}, 'INSERT') OR has_table_privilege(${ROL}, ${t}, 'UPDATE')
        OR has_table_privilege(${ROL}, ${t}, 'DELETE') OR has_table_privilege(${ROL}, ${t}, 'TRUNCATE') AS escribe`;
      expect([t, p.sel, p.escribe]).toEqual([t, true, false]);
    }
    const seqs = await admin<{ s: string }[]>`SELECT quote_ident(sequence_schema) || '.' || quote_ident(sequence_name) AS s
      FROM information_schema.sequences WHERE sequence_schema IN ('public', 'drizzle') AND sequence_name LIKE ${'%'}`;
    for (const { s } of seqs) {
      const [p] = await admin`SELECT has_sequence_privilege(${ROL}, ${s}, 'SELECT') AS sel, has_sequence_privilege(${ROL}, ${s}, 'UPDATE') AS upd`;
      expect([s, p.sel, p.upd]).toEqual([s, true, false]);
    }
    const [f] = await admin`SELECT has_function_privilege(${ROL}, 'siguiente_valor(varchar)', 'EXECUTE') AS ex`;
    expect(f.ex).toBe(false);
  });

  it('las tablas que se creen después también se pueden leer (default privileges)', async () => {
    await admin.begin(async (tx) => {
      await tx`CREATE TABLE public.zz_respaldo_futura (id int)`;
      const [p] = await tx`SELECT has_table_privilege(${ROL}, 'public.zz_respaldo_futura', 'SELECT') AS sel,
                                  has_table_privilege(${ROL}, 'public.zz_respaldo_futura', 'INSERT') AS ins`;
      expect([p.sel, p.ins]).toEqual([true, false]);
      throw new Error('deshacer');
    }).catch((e: Error) => { if (e.message !== 'deshacer') throw e; });
  });

  it('con SET ROLE ve todas las filas de una tabla con RLS (sin BYPASSRLS vería 0)', async () => {
    const [{ n: total }] = await admin`SELECT count(*)::int AS n FROM usuario WHERE ${true}`;
    let vistas = -1;
    await admin.begin(async (tx) => {
      // 0025 le da a postgres permiso de SET sobre el rol (sin heredarlo) justamente para poder probar esto.
      await tx.unsafe(`SET LOCAL ROLE ${ROL}`);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM usuario WHERE ${true}`;
      vistas = n;
      throw new Error('deshacer');
    }).catch((e: Error) => { if (e.message !== 'deshacer') throw e; });
    expect(vistas).toBe(total);
  });
});
