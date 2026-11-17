import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error script en JS plano (sin tipos), se usa igual desde el workflow
import { bajarTodo, verificar, subirTodo } from '../../scripts/respaldo-archivos.mjs';

/** Loop 0 (cierre), CA-R.3: respaldo de Storage con un Storage en memoria que imita la API de Supabase (carpetas sin id). */
type Obj = { datos: Uint8Array; mime: string };
function storageFalso(inicial: Record<string, Obj> = {}) {
  const objetos = new Map(Object.entries(inicial));
  return {
    objetos,
    async listar(prefijo: string, desde: number, limite: number) {
      const hijos = new Map<string, { name: string; id: string | null; metadata: { size: number; mimetype: string } | null }>();
      for (const [ruta, o] of objetos) {
        if (prefijo && !ruta.startsWith(prefijo + '/')) continue;
        const resto = prefijo ? ruta.slice(prefijo.length + 1) : ruta;
        const [primero, ...mas] = resto.split('/');
        if (mas.length) hijos.set(primero, { name: primero, id: null, metadata: null });
        else hijos.set(primero, { name: primero, id: 'id-' + ruta, metadata: { size: o.datos.byteLength, mimetype: o.mime } });
      }
      return [...hijos.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(desde, desde + limite);
    },
    async bajar(ruta: string) {
      const o = objetos.get(ruta);
      if (!o) throw new Error('404 ' + ruta);
      return o.datos;
    },
    async subir(ruta: string, datos: Uint8Array, mime: string) {
      objetos.set(ruta, { datos: new Uint8Array(datos), mime });
    },
  };
}
const bytes = (n: number, semilla: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + semilla) % 251);

describe('Loop 0 — respaldo de Storage', () => {
  const inicial = {
    'remision_parada/2026-11/a.jpg': { datos: bytes(900, 1), mime: 'image/jpeg' },
    'muestra_tarea/2026-11/b.jpg': { datos: bytes(1200, 2), mime: 'image/jpeg' },
    'comprobante_permiso/2026-10/c.pdf': { datos: bytes(3000, 3), mime: 'application/pdf' },
  } as Record<string, Obj>;

  it('baja todo por carpetas (con paginado), escribe el índice con sha256 y verifica contra lo que dice la base', async () => {
    const s = storageFalso(inicial);
    const dir = await mkdtemp(join(tmpdir(), 'resp-'));
    const indice = await bajarTodo(s, dir, { limite: 1 }); // limite 1: obliga a paginar
    expect(indice.map((x: { ruta: string }) => x.ruta).sort()).toEqual(Object.keys(inicial).sort());
    expect(indice.find((x: { ruta: string }) => x.ruta.endsWith('c.pdf'))).toMatchObject({ bytes: 3000, mime: 'application/pdf' });
    expect(await readFile(join(dir, 'muestra_tarea/2026-11/b.jpg'))).toEqual(Buffer.from(inicial['muestra_tarea/2026-11/b.jpg'].datos));
    const esperadas = join(dir, '..', `esperadas-${Date.now()}.txt`);
    await writeFile(esperadas, Object.keys(inicial).join('\n') + '\n');
    expect(await verificar(dir, esperadas)).toEqual({ ok: true, faltan: [], corruptos: [], total: 3 });
  });

  it('avisa si en la base hay un archivo SUBIDO que no se bajó, o si un archivo bajado no coincide con su sha256', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resp-'));
    await bajarTodo(storageFalso(inicial), dir, {});
    const esperadas = join(dir, '..', `esperadas-${Date.now()}-b.txt`);
    await writeFile(esperadas, [...Object.keys(inicial), 'remision_parada/2026-11/falta.jpg'].join('\n'));
    await writeFile(join(dir, 'remision_parada/2026-11/a.jpg'), 'roto');
    const r = await verificar(dir, esperadas);
    expect(r).toMatchObject({ ok: false, faltan: ['remision_parada/2026-11/falta.jpg'], corruptos: ['remision_parada/2026-11/a.jpg'] });
  });

  it('restaurar: sube todo a un Storage vacío y queda igual (bytes y tipo)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resp-'));
    await bajarTodo(storageFalso(inicial), dir, {});
    const vacio = storageFalso();
    expect(await subirTodo(vacio, dir)).toBe(3);
    for (const [ruta, o] of Object.entries(inicial)) {
      expect(vacio.objetos.get(ruta)?.mime).toBe(o.mime);
      expect(Buffer.from(vacio.objetos.get(ruta)!.datos)).toEqual(Buffer.from(o.datos));
    }
  });

  it('bucket vacío: índice vacío y verificación OK sin esperadas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resp-'));
    expect(await bajarTodo(storageFalso(), dir, {})).toEqual([]);
    const esperadas = join(dir, '..', `esperadas-${Date.now()}-c.txt`);
    await writeFile(esperadas, '');
    expect((await verificar(dir, esperadas)).ok).toBe(true);
  });
});
