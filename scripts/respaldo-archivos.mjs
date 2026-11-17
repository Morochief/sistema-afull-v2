/* global process, console, fetch, AbortSignal, Buffer */
/**
 * Respaldo de Storage (Loop 0, cierre; docs/LOOP_0_RESPALDOS_DISENO.md, R3). Sin dependencias: Node 22.
 *
 *   node scripts/respaldo-archivos.mjs bajar     --dir <carpeta>                     (lista el bucket y baja todo + indice.json)
 *   node scripts/respaldo-archivos.mjs verificar --dir <carpeta> --esperadas <txt>   (cada archivo SUBIDO de la base está y su sha256 coincide)
 *   node scripts/respaldo-archivos.mjs subir     --dir <carpeta>                     (restaurar: vuelve a subir todo, con su tipo)
 *
 * Variables: SUPABASE_URL, SUPABASE_SECRET_KEY (nunca se imprime) y STORAGE_BUCKET (por defecto afull-archivos).
 * La lógica recibe un "cliente" (listar/bajar/subir) para poder probarla con un Storage en memoria.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const INDICE = 'indice.json';
const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');

/** Recorre el bucket por carpetas (en Supabase las carpetas vienen con id null) y devuelve [{ ruta, bytes, mime }]. */
async function listarTodo(cliente, prefijo, limite) {
  const salida = [];
  for (let desde = 0; ; desde += limite) {
    const pagina = await cliente.listar(prefijo, desde, limite);
    for (const e of pagina) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id === null) salida.push(...(await listarTodo(cliente, ruta, limite)));
      else salida.push({ ruta, bytes: e.metadata?.size ?? null, mime: e.metadata?.mimetype ?? 'application/octet-stream' });
    }
    if (pagina.length < limite) return salida;
  }
}

export async function bajarTodo(cliente, dir, { limite = 1000 } = {}) {
  const objetos = await listarTodo(cliente, '', limite);
  const indice = [];
  for (const o of objetos) {
    const datos = Buffer.from(await cliente.bajar(o.ruta));
    const destino = join(dir, o.ruta);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, datos);
    indice.push({ ruta: o.ruta, bytes: datos.byteLength, mime: o.mime, sha256: sha256(datos) });
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, INDICE), JSON.stringify(indice, null, 1));
  return indice;
}

/** `esperadas`: un archivo con una ruta por renglón (las de `archivo` en estado SUBIDO, sacadas de la base). */
export async function verificar(dir, esperadas) {
  const indice = JSON.parse(await readFile(join(dir, INDICE), 'utf8'));
  const porRuta = new Map(indice.map((x) => [x.ruta, x]));
  const rutas = (await readFile(esperadas, 'utf8')).split('\n').map((r) => r.trim()).filter(Boolean);
  const faltan = rutas.filter((r) => !porRuta.has(r));
  const corruptos = [];
  for (const x of indice) {
    const datos = await readFile(join(dir, x.ruta)).catch(() => null);
    if (!datos || sha256(datos) !== x.sha256) corruptos.push(x.ruta);
  }
  return { ok: faltan.length === 0 && corruptos.length === 0, faltan, corruptos, total: indice.length };
}

export async function subirTodo(cliente, dir) {
  const indice = JSON.parse(await readFile(join(dir, INDICE), 'utf8'));
  for (const x of indice) await cliente.subir(x.ruta, await readFile(join(dir, x.ruta)), x.mime);
  return indice.length;
}

/** Cliente real: la misma API REST que usa la app (apps/api/src/lib/almacenamiento.ts). */
export function clienteSupabase(base, clave, bucket) {
  const raiz = `${base.replace(/\/+$/, '')}/storage/v1`;
  const auth = clave.startsWith('sb_secret_') ? { apikey: clave } : { apikey: clave, Authorization: `Bearer ${clave}` };
  const enc = (r) => r.split('/').map(encodeURIComponent).join('/');
  const ok = async (res, que) => {
    if (res.ok) return res;
    throw new Error(`Storage ${que}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  };
  return {
    async listar(prefijo, desde, limite) {
      const res = await fetch(`${raiz}/object/list/${bucket}`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ prefix: prefijo, limit: limite, offset: desde, sortBy: { column: 'name', order: 'asc' } }),
      });
      return (await ok(res, 'listar')).json();
    },
    async bajar(ruta) {
      const res = await fetch(`${raiz}/object/${bucket}/${enc(ruta)}`, { headers: auth, signal: AbortSignal.timeout(60000) });
      return new Uint8Array(await (await ok(res, `bajar ${ruta}`)).arrayBuffer());
    },
    async subir(ruta, datos, mime) {
      const res = await fetch(`${raiz}/object/${bucket}/${enc(ruta)}`, {
        method: 'POST', headers: { ...auth, 'content-type': mime, 'x-upsert': 'true' }, body: datos, signal: AbortSignal.timeout(60000),
      });
      await ok(res, `subir ${ruta}`);
    },
  };
}

async function principal() {
  const [modo, ...resto] = process.argv.slice(2);
  const arg = (n) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined; };
  const dir = arg('dir');
  if (!dir || !['bajar', 'verificar', 'subir'].includes(modo)) {
    console.error('Uso: respaldo-archivos.mjs bajar|verificar|subir --dir <carpeta> [--esperadas <txt>]');
    process.exit(2);
  }
  if (modo === 'verificar') {
    const r = await verificar(dir, arg('esperadas'));
    console.log(`Archivos en el respaldo: ${r.total}. Faltan: ${r.faltan.length}. Con sha256 distinto: ${r.corruptos.length}.`);
    for (const f of r.faltan) console.log(`  falta: ${f}`);
    for (const f of r.corruptos) console.log(`  distinto: ${f}`);
    process.exit(r.ok ? 0 : 1);
  }
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, STORAGE_BUCKET = 'afull-archivos' } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.');
    process.exit(2);
  }
  const cliente = clienteSupabase(SUPABASE_URL, SUPABASE_SECRET_KEY, STORAGE_BUCKET);
  if (modo === 'bajar') {
    const indice = await bajarTodo(cliente, dir);
    const total = indice.reduce((a, x) => a + x.bytes, 0);
    console.log(`Bajados ${indice.length} archivos (${(total / 1048576).toFixed(1)} MB) del bucket ${STORAGE_BUCKET}.`);
  } else {
    console.log(`Subidos ${await subirTodo(cliente, dir)} archivos al bucket ${STORAGE_BUCKET}.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
