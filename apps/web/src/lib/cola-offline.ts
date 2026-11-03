import { apiFetch, ErrorApi } from './api.js';

/**
 * Cola sin conexión para "En la calle" (Loop 4, L4.E4).
 * Solo para acciones IDEMPOTENTES (clave de idempotencia o "repetir no falla"): reenviarlas nunca duplica.
 * - Sin señal (fetch que no llega: status 0) → se guarda y se manda sola cuando vuelve.
 * - Rechazo real del servidor (4xx) → no se reintenta: queda en "rechazadas" para que la persona lo vea.
 * - 401 → se frena hasta que vuelva a entrar.
 * Se guarda en localStorage: sobrevive a recargar la página o cerrar el navegador.
 */
export type AccionOffline = { id: string; etiqueta: string; url: string; metodo: 'POST'; body?: unknown; creada_at: string; usuario: string | null };
export type Rechazada = AccionOffline & { error: string };

const CLAVE_COLA = 'afull_cola_offline';
const CLAVE_RECHAZADAS = 'afull_cola_rechazadas';
const oyentes = new Set<() => void>();
let usuarioActual: string | null = null;

/** Quién está en sesión: la cola solo manda lo suyo (si otro entra en el mismo celular, lo ajeno espera). */
export function fijarUsuarioCola(u: string | null) {
  usuarioActual = u;
  oyentes.forEach((f) => f());
  if (u) void sincronizar();
}
const delUsuario = (a: AccionOffline) => a.usuario === usuarioActual;

function leer<T>(clave: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function escribir(clave: string, v: unknown[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: queda solo lo que ya se mandó */
  }
  oyentes.forEach((f) => f());
}

export const pendientes = () => leer<AccionOffline>(CLAVE_COLA);
/** Lo pendiente de quien está en sesión (lo que muestra la pantalla). */
export const pendientesPropias = () => pendientes().filter(delUsuario);
export const rechazadas = () => leer<Rechazada>(CLAVE_RECHAZADAS);
export const descartarRechazada = (id: string) => escribir(CLAVE_RECHAZADAS, rechazadas().filter((r) => r.id !== id));
export function suscribirCola(f: () => void) {
  oyentes.add(f);
  return () => void oyentes.delete(f);
}

const sinSenal = (e: unknown) => e instanceof ErrorApi && e.status === 0;

/**
 * Manda la acción; si no hay señal la encola y devuelve `{ encolada: true }`.
 * Los errores del servidor se propagan igual que siempre (el formulario los muestra).
 */
export async function enviarOEncolar<T>(etiqueta: string, url: string, body?: unknown): Promise<{ encolada: true } | { encolada: false; respuesta: T }> {
  const creada = new Date().toISOString();
  // Encolada, la acción lleva su hora real (la API la acota y la marca "sin señal"). Solo campo y asistencia la aceptan.
  const conHora = /^\/api\/(campo|asistencia)\//.test(url) ? { ...((body as object | undefined) ?? {}), ocurridaAt: creada } : body;
  const accion: AccionOffline = { id: crypto.randomUUID(), etiqueta, url, metodo: 'POST', body: conHora, creada_at: creada, usuario: usuarioActual };
  // Con cosas pendientes, esta va detrás: el orden importa (iniciar viaje antes que cerrarlo, entrada antes que salida).
  if (pendientes().some(delUsuario) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    escribir(CLAVE_COLA, [...pendientes(), accion]);
    return { encolada: true };
  }
  try {
    return { encolada: false, respuesta: await apiFetch<T>(url, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) };
  } catch (e) {
    if (!sinSenal(e)) throw e;
    escribir(CLAVE_COLA, [...pendientes(), accion]);
    return { encolada: true };
  }
}

let enCurso: Promise<number> | null = null;

/** Manda lo pendiente en orden. Devuelve cuántas se enviaron. Una sola corrida a la vez. */
export function sincronizar(): Promise<number> {
  if (enCurso) return enCurso;
  // Ojo: se limpia DESPUÉS de asignar (con la cola vacía la corrida termina en el acto y dejaría la marca pegada).
  enCurso = correrCola().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function correrCola(): Promise<number> {
  let enviadas = 0;
  if (!usuarioActual) return 0;
  for (;;) {
    const a = pendientes().find(delUsuario);
    if (!a) break;
    try {
      await apiFetch(a.url, { method: a.metodo, ...(a.body !== undefined ? { body: JSON.stringify(a.body) } : {}) });
    } catch (e) {
      if (sinSenal(e) || (e instanceof ErrorApi && e.status === 401)) break;
      const msg = e instanceof Error ? e.message : 'Rechazada';
      escribir(CLAVE_RECHAZADAS, [...rechazadas(), { ...a, error: msg }]);
    }
    escribir(CLAVE_COLA, pendientes().filter((p) => p.id !== a.id));
    enviadas++;
  }
  return enviadas;
}

/** Reintenta sola: al volver la señal y cada 30 s. Se llama una vez al arrancar la app. */
export function iniciarSincronizador(onEnviadas?: (n: number) => void) {
  const correr = () => void sincronizar().then((n) => n > 0 && onEnviadas?.(n));
  // Justo al volver la señal la primera conexión suele fallar: se reintenta enseguida y a los pocos segundos.
  const alVolver = () => [0, 2000, 6000].forEach((ms) => window.setTimeout(correr, ms));
  window.addEventListener('online', alVolver);
  const t = window.setInterval(correr, 30_000);
  correr();
  return () => {
    window.removeEventListener('online', alVolver);
    window.clearInterval(t);
  };
}
