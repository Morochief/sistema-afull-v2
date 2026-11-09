import type { TipoArchivo } from '@afull/shared';
import { ErrorApi } from './api.js';
import { BASE_SESION, llamadorSesion, subirArchivo, type RefArchivo } from './api-archivos.js';

/**
 * Fotos guardadas en el celular hasta poder subirlas (L4.E3). Como la cola de acciones, pero en IndexedDB:
 * localStorage no aguanta fotos. Se suben solas y en orden; reintentar no duplica (la clave es el id de la foto).
 * - Sin señal / Storage caído / 401 → se frena y se reintenta después.
 * - 404 "todavía no llegó" (p. ej. el inicio del viaje sigue en la cola de acciones) → esa espera y siguen las demás.
 * - Otro rechazo del servidor → queda marcada con el error para que la persona la vea (no se pierde sola).
 */
export type FotoPendiente = {
  id: string; usuario: string | null; etiqueta: string; tipo: TipoArchivo; ref: RefArchivo; mime: string; blob: Blob; tomada_at: string; error?: string;
};
export interface AlmacenFotos {
  todas(): Promise<FotoPendiente[]>;
  poner(f: FotoPendiente): Promise<void>;
  quitar(id: string): Promise<void>;
}

function almacenIndexedDB(): AlmacenFotos {
  const abrir = () =>
    new Promise<IDBDatabase>((ok, mal) => {
      const r = indexedDB.open('afull_fotos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  const op = async <T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) => {
    const db = await abrir();
    return new Promise<T>((ok, mal) => {
      const req = fn(db.transaction('fotos', modo).objectStore('fotos'));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => mal(req.error);
    }).finally(() => db.close());
  };
  return {
    todas: () => op<FotoPendiente[]>('readonly', (s) => s.getAll()),
    poner: (f) => op('readwrite', (s) => s.put(f)),
    quitar: (id) => op('readwrite', (s) => s.delete(id)),
  };
}

export function almacenMemoria(): AlmacenFotos {
  const m = new Map<string, FotoPendiente>();
  return { todas: async () => [...m.values()], poner: async (f) => void m.set(f.id, f), quitar: async (id) => void m.delete(id) };
}

let almacen: AlmacenFotos = typeof indexedDB !== 'undefined' ? almacenIndexedDB() : almacenMemoria();
let usuarioActual: string | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

/** Para tests. */
export function usarAlmacenFotos(a: AlmacenFotos) {
  almacen = a;
}
export function suscribirFotos(f: () => void) {
  oyentes.add(f);
  return () => void oyentes.delete(f);
}
/** Mismo criterio que la cola de acciones: en un celular compartido, cada uno sube lo suyo. */
export function fijarUsuarioFotos(u: string | null) {
  usuarioActual = u;
  avisar();
  if (u) void sincronizarFotos();
}

const ordenadas = (fs: FotoPendiente[]) => fs.sort((a, b) => a.tomada_at.localeCompare(b.tomada_at));
export const fotosDelUsuario = async () => ordenadas((await almacen.todas()).filter((f) => f.usuario === usuarioActual));

/** Guarda la foto en el celular y prueba subirla enseguida (si hay señal, sube al toque). */
export async function guardarFoto(d: { etiqueta: string; tipo: TipoArchivo; ref: RefArchivo; mime: string; blob: Blob }) {
  await almacen.poner({ ...d, id: crypto.randomUUID(), usuario: usuarioActual, tomada_at: new Date().toISOString() });
  avisar();
  void sincronizarFotos();
}
export async function descartarFoto(id: string) {
  await almacen.quitar(id);
  avisar();
}
export async function reintentarFoto(id: string) {
  const f = (await almacen.todas()).find((x) => x.id === id);
  if (f) await almacen.poner({ ...f, error: undefined });
  avisar();
  void sincronizarFotos();
}

let enCurso: Promise<number> | null = null;
let otraVez = false;
/**
 * Sube lo pendiente en orden. Una sola corrida a la vez; si la piden mientras corre (p. ej. se sacó otra foto),
 * al terminar corre de nuevo para no dejar la nueva esperando al próximo intento. Devuelve cuántas subió.
 */
export function sincronizarFotos(): Promise<number> {
  if (enCurso) {
    otraVez = true;
    return enCurso;
  }
  enCurso = (async () => {
    let total = 0;
    do {
      otraVez = false;
      total += await correr();
      // Solo se repite si alguien la pidió mientras corría (no insiste sola si no hay señal).
    } while (otraVez);
    return total;
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function correr(): Promise<number> {
  if (!usuarioActual) return 0;
  let subidas = 0;
  for (const f of await fotosDelUsuario()) {
    if (f.error) continue;
    // Si pasó un rato entre sacarla y subirla, va la hora real (la API la marca "sin señal").
    const tarde = Date.now() - Date.parse(f.tomada_at) > 2 * 60_000;
    try {
      await subirArchivo(llamadorSesion, BASE_SESION, {
        ...f.ref, tipo: f.tipo, mime: f.mime, blob: f.blob, claveIdempotencia: f.id, tomadaAt: tarde ? f.tomada_at : undefined,
      });
      await almacen.quitar(f.id);
      subidas++;
    } catch (e) {
      const status = e instanceof ErrorApi ? e.status : 0;
      if (status === 0 || status === 401 || status === 503) break;
      if (status === 409 && /todavía no se subió/.test((e as Error).message)) break;
      if (status === 404 && /todavía no llegó/.test((e as Error).message)) continue;
      await almacen.poner({ ...f, error: (e as Error).message || 'Rechazada' });
    }
    avisar();
  }
  avisar();
  return subidas;
}
