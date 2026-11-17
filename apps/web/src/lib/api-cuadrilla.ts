import { apiFetch, ErrorApi } from './api.js';

/** Loop 16: salidas de hoy donde soy conductor, con la cuadrilla y la última marcación de hoy de cada uno. */
export type PersonaCuadrilla = { persona_id: string; nombre: string; rol: string; ultima_tipo: 'ENTRADA' | 'SALIDA' | null; ultima_at: string | null };
export type SalidaCuadrilla = { hoja_ruta_id: string; descripcion: string | null; vehiculo: string | null; personas: PersonaCuadrilla[] };
export type ResultadoCuadrilla = { marcadas: { personaId: string; id: string; repetida: boolean }[]; rechazadas: { personaId: string; motivo: string }[] };

const CLAVE = 'afull:cuadrilla-hoy';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());

/** Como "Mi día": si no hay señal, devuelve la última lista bajada (para poder marcar y que se encole). */
export async function obtenerCuadrilla(): Promise<{ salidas: SalidaCuadrilla[] }> {
  try {
    const d = await apiFetch<{ salidas: SalidaCuadrilla[] }>('/api/asistencia/cuadrilla');
    try { localStorage.setItem(CLAVE, JSON.stringify({ dia: hoy(), d })); } catch { /* sin almacenamiento */ }
    return d;
  } catch (e) {
    if (!(e instanceof ErrorApi && e.status === 0)) throw e;
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as { dia: string; d: { salidas: SalidaCuadrilla[] } } | null;
      return g?.dia === hoy() ? g.d : { salidas: [] }; // la de ayer no sirve: la API la rechazaría
    } catch { return { salidas: [] }; }
  }
}

/** Quién puede marcar `tipo` ahora: entrada si no está adentro; salida si está adentro. */
export const puedeMarcar = (p: PersonaCuadrilla, tipo: 'ENTRADA' | 'SALIDA') => (tipo === 'ENTRADA' ? p.ultima_tipo !== 'ENTRADA' : p.ultima_tipo === 'ENTRADA');
