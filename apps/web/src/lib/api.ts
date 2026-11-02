export type ZodDetalleIssue = {
  path: (string | number)[];
  message: string;
};

export class ErrorApi extends Error {
  status: number;
  mensaje: string;
  detalle?: ZodDetalleIssue[];

  constructor(status: number, mensaje: string, detalle?: ZodDetalleIssue[]) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.mensaje = mensaje;
    this.detalle = detalle;
  }
}

let limpiadorCacheSesion: (() => void) | null = null;
let redireccionadorLogin: ((volver: string) => void) | null = null;

export function setLimpiadorCache(fn: (() => void) | null) {
  limpiadorCacheSesion = fn;
}

export function setRedireccionadorLogin(fn: ((volver: string) => void) | null) {
  redireccionadorLogin = fn;
}

type OpcionesFetch = RequestInit & {
  params?: Record<string, string | number | boolean | undefined | null>;
};

export async function apiFetch<T>(ruta: string, opciones: OpcionesFetch = {}): Promise<T> {
  const { params, headers, ...resto } = opciones;

  let url = ruta;
  if (params) {
    const q = new URLSearchParams();
    for (const [clave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        q.append(clave, String(valor));
      }
    }
    const qs = q.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const cabeceras = new Headers(headers);
  if (!cabeceras.has('Accept')) {
    cabeceras.set('Accept', 'application/json');
  }
  if (resto.body && typeof resto.body === 'string' && !cabeceras.has('Content-Type')) {
    cabeceras.set('Content-Type', 'application/json');
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      ...resto,
      headers: cabeceras,
      credentials: 'same-origin',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de conexión';
    throw new ErrorApi(0, `No se pudo conectar con el servidor: ${msg}`);
  }

  if (respuesta.status === 204) {
    return undefined as unknown as T;
  }

  const tipoContenido = respuesta.headers.get('content-type') || '';
  const esJson = tipoContenido.includes('application/json');
  const cuerpo = esJson ? await respuesta.json().catch(() => null) : null;

  if (!respuesta.ok) {
    const status = respuesta.status;
    let mensaje = cuerpo?.error || respuesta.statusText || 'Error en la solicitud';

    if (status === 401) {
      mensaje = cuerpo?.error || 'Sesión expirada o no autenticado';
      if (limpiadorCacheSesion) {
        try {
          limpiadorCacheSesion();
        } catch {
          // Ignorar error al limpiar cache
        }
      }
      if (redireccionadorLogin) {
        const rutaActual = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
        redireccionadorLogin(rutaActual);
      } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const rutaActual = window.location.pathname + window.location.search;
        const volver = encodeURIComponent(rutaActual);
        try {
          window.location.href = `/login?volver=${volver}`;
        } catch {
          // Entorno de test (jsdom no permite navegación completa)
        }
      }
    } else if (status === 403) {
      mensaje = cuerpo?.error || 'No tenés permisos para realizar esta acción';
    } else if (status === 409) {
      mensaje = cuerpo?.error || 'Conflicto: el registro fue modificado por otro usuario';
    }

    throw new ErrorApi(status, mensaje, cuerpo?.detalle);
  }

  return cuerpo as T;
}
