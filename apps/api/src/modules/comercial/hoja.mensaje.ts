/** Texto de WhatsApp de la hoja de ruta, con el formato que el equipo ya usa (docs/LOOP_11_HOJA_RUTA_DISENO.md §3). */
export type CabeceraHoja = { cliente: string; codigo_ot: string; titulo: string; sucursal: string | null; notas: string | null };
export type TareaHoja = {
  operario: string | null; descripcion: string; fecha_trabajo: string | null;
  cantidad: number | null; unidad: string | null; minutos_estimados: number | null;
};

const ddmm = (f: string) => f.split('-').reverse().slice(0, 2).join('/');
const ddmmaaaa = (f: string) => f.split('-').reverse().join('/');
const cantidad = (n: number) => String(n).replace('.', ',');

export function tiempo(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

function linea(t: TareaHoja) {
  let s = t.descripcion;
  if (t.cantidad !== null) s += ` (Cant: ${cantidad(t.cantidad)} ${t.unidad ?? 'u'})`;
  if (t.fecha_trabajo) s += ` · ${ddmm(t.fecha_trabajo)}`;
  if (t.minutos_estimados) s += ` · ~${tiempo(t.minutos_estimados)}`;
  return s;
}

/** Agrupa por operario (orden alfabético, "Sin asignar" al final); dentro, por día y en el orden cargado. */
export function mensajeHoja(c: CabeceraHoja, tareas: TareaHoja[], hoy: string) {
  const fechas = tareas.map((t) => t.fecha_trabajo).filter((f): f is string => !!f).sort();
  const grupos = new Map<string, TareaHoja[]>();
  for (const t of tareas) grupos.set(t.operario ?? '', [...(grupos.get(t.operario ?? '') ?? []), t]);
  const nombres = [...grupos.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
  const lineas = [`*Hoja de Ruta — ${c.cliente}*`, `OT: ${c.codigo_ot} · ${c.titulo}`];
  if (c.sucursal) lineas.push(`Local: ${c.sucursal}`);
  lineas.push(`Fecha: ${ddmmaaaa(fechas[0] ?? hoy)}`, '');
  if (c.notas) lineas.push(c.notas, '');
  for (const n of nombres) {
    lineas.push(`⛔${n || 'Sin asignar'}⛔`);
    for (const t of grupos.get(n)!) lineas.push(linea(t));
    lineas.push('');
  }
  return lineas.join('\n').trim();
}
