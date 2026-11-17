import { obtenerClientes } from '../../lib/api-clientes.js';
import { obtenerPersonas } from '../../lib/api-personas.js';
import { obtenerProyectos } from '../../lib/api-presupuestos.js';
import type { Opcion } from './SelectorBuscar.js';

/** Fuentes de los buscadores de Reportes (las mismas listas de cada pantalla). */
export const buscarClientes = async (q: string): Promise<Opcion[]> =>
  (await obtenerClientes({ q, estado: 'activos', pagina: 1 })).items.map((c) => ({ id: c.id, texto: c.nombre }));
export const buscarProyectos = async (q: string): Promise<Opcion[]> =>
  (await obtenerProyectos({ q, pagina: 1 })).items.map((p) => ({ id: p.id, texto: `${p.codigo} · ${p.nombre}` }));
export const buscarPersonas = async (q: string): Promise<Opcion[]> =>
  (await obtenerPersonas({ q, pagina: 1 })).items.map((p) => ({ id: p.id, texto: p.nombre }));
