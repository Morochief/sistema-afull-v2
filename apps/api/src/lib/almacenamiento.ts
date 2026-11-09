import { ErrorApp } from './errores.js';

/**
 * Almacenamiento de archivos (L4.E3), aislado tras una interfaz como `publicarLive`:
 * - Real: Supabase Storage por REST (sin SDK), bucket privado, con la clave SECRETA solo en el servidor.
 * - Memoria: para tests y para probar en local sin Supabase (`ALMACENAMIENTO=memoria`, nunca en producción).
 * Sin configuración, falla cerrado con 503 (no hay "default" a un proyecto: lo mismo que en live/publicar).
 */
export type InfoObjeto = { bytes: number; mime: string | null };
export interface Almacenamiento {
  /** URL (absoluta o relativa al sitio) para subir con `PUT` el archivo crudo. Vale 2 h. */
  firmarSubida(ruta: string): Promise<string>;
  /** Tamaño y tipo reales del objeto subido, o `null` si todavía no está. */
  info(ruta: string): Promise<InfoObjeto | null>;
  /** URL de descarga temporal. */
  firmarDescarga(ruta: string, segundos: number): Promise<string>;
  /** Solo para descartar lo que no cumple (p. ej. más grande que el tope): nunca algo ya confirmado. */
  borrar(ruta: string): Promise<void>;
}

export const BUCKET = () => process.env.STORAGE_BUCKET || 'afull-archivos';

export function supabaseStorage(base: string, clave: string, bucket = BUCKET()): Almacenamiento {
  const raiz = `${base.replace(/\/+$/, '')}/storage/v1`;
  // Claves nuevas (sb_secret_…): solo en `apikey`. La service_role vieja (un JWT) va también como Bearer.
  const auth: Record<string, string> = clave.startsWith('sb_secret_') ? { apikey: clave } : { apikey: clave, Authorization: `Bearer ${clave}` };
  const ruta = (r: string) => `${bucket}/${r.split('/').map(encodeURIComponent).join('/')}`;
  const pedir = async (metodo: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${raiz}${url}`, {
      method: metodo,
      headers: { ...auth, ...extra, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    return res;
  };
  const fallo = async (res: Response, que: string) => {
    // Nunca se loguea la clave: solo el estado y el cuerpo de error de Storage.
    console.error(`[almacenamiento] ${que}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
    return new ErrorApp(503, 'El almacenamiento de archivos no respondió: probá de nuevo en un rato');
  };
  return {
    async firmarSubida(r) {
      const res = await pedir('POST', `/object/upload/sign/${ruta(r)}`, {}, { 'x-upsert': 'true' });
      if (!res.ok) throw await fallo(res, 'firmar subida');
      const { url } = (await res.json()) as { url: string };
      return `${raiz}${url}`;
    },
    async info(r) {
      const res = await pedir('GET', `/object/info/${ruta(r)}`);
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw await fallo(res, 'info');
      const d = (await res.json()) as { size?: number; content_type?: string; metadata?: { size?: number; mimetype?: string } };
      const bytes = d.size ?? d.metadata?.size;
      return typeof bytes === 'number' ? { bytes, mime: d.content_type ?? d.metadata?.mimetype ?? null } : null;
    },
    async firmarDescarga(r, segundos) {
      const res = await pedir('POST', `/object/sign/${ruta(r)}`, { expiresIn: segundos });
      if (!res.ok) throw await fallo(res, 'firmar descarga');
      const { signedURL } = (await res.json()) as { signedURL: string };
      return `${raiz}${signedURL}`;
    },
    async borrar(r) {
      const res = await pedir('DELETE', `/object/${ruta(r)}`);
      if (!res.ok && res.status !== 404 && res.status !== 400) throw await fallo(res, 'borrar');
    },
  };
}

/** En memoria: guarda los bytes para poder verlos en el navegador durante una prueba local. */
export class AlmacenamientoMemoria implements Almacenamiento {
  readonly objetos = new Map<string, { datos: Uint8Array; mime: string | null }>();
  async firmarSubida(r: string) {
    return `/api/archivos-falso/subir/${r}`;
  }
  async info(r: string) {
    const o = this.objetos.get(r);
    return o ? { bytes: o.datos.byteLength, mime: o.mime } : null;
  }
  async firmarDescarga(r: string) {
    return `/api/archivos-falso/ver/${r}`;
  }
  async borrar(r: string) {
    this.objetos.delete(r);
  }
}

let fijado: Almacenamiento | null = null;
let memoria: AlmacenamientoMemoria | null = null;

/** Para tests: reemplaza el almacenamiento (null vuelve al de las variables de entorno). */
export function usarAlmacenamiento(a: Almacenamiento | null) {
  fijado = a;
}

export const memoriaHabilitada = () => process.env.ALMACENAMIENTO === 'memoria' && process.env.NODE_ENV !== 'production';
export function almacenamientoMemoria() {
  memoria ??= new AlmacenamientoMemoria();
  return memoria;
}

export function almacenamiento(): Almacenamiento {
  if (fijado) return fijado;
  if (memoriaHabilitada()) return almacenamientoMemoria();
  const base = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!base || !clave) throw new ErrorApp(503, 'El almacenamiento de archivos no está configurado');
  return supabaseStorage(base, clave);
}
