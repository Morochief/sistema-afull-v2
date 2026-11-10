/** Helpers de la Hoja de ruta (Loop 11): textos cortos del plan de una tarea y agrupaciones. */
type PlanTarea = { fecha_trabajo: string | null; cantidad: number | null; unidad: string | null; minutos_estimados: number | null };

export const ddmm = (f: string) => f.split('-').reverse().slice(0, 2).join('/');

export function tiempoEstimado(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

/** "3 m2 · 05/03 · ~1 h 30 min" (lo que haya). */
export function resumenPlan(t: PlanTarea) {
  const partes: string[] = [];
  if (t.cantidad !== null) partes.push(`${String(t.cantidad).replace('.', ',')} ${t.unidad ?? 'u'}`);
  if (t.fecha_trabajo) partes.push(ddmm(t.fecha_trabajo));
  if (t.minutos_estimados) partes.push(`~${tiempoEstimado(t.minutos_estimados)}`);
  return partes.join(' · ');
}

/** Tareas agrupadas por operario, en orden alfabético y "Sin asignar" al final (como el WhatsApp). */
export function agruparPorOperario<T extends { persona_asignada_nombre: string | null }>(tareas: T[]) {
  const grupos = new Map<string, T[]>();
  for (const t of tareas) grupos.set(t.persona_asignada_nombre ?? '', [...(grupos.get(t.persona_asignada_nombre ?? '') ?? []), t]);
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')))
    .map(([nombre, items]) => ({ nombre: nombre || 'Sin asignar', items }));
}

export const GRUPOS_DIA = ['Atrasadas', 'Para hoy', 'Próximas', 'Sin día'] as const;
export type GrupoDia = (typeof GRUPOS_DIA)[number];

/** Mi trabajo: atrasadas (día pasado), para hoy, próximas y sin día, según la fecha de Asunción `hoy`. */
export function agruparPorDia<T extends { fecha_trabajo: string | null }>(tareas: T[], hoy: string) {
  const grupo = (t: T): GrupoDia => (!t.fecha_trabajo ? 'Sin día' : t.fecha_trabajo < hoy ? 'Atrasadas' : t.fecha_trabajo === hoy ? 'Para hoy' : 'Próximas');
  return GRUPOS_DIA.map((g) => ({ grupo: g, items: tareas.filter((t) => grupo(t) === g) })).filter((x) => x.items.length > 0);
}

/** Fecha de hoy en Asunción (AAAA-MM-DD). */
export const hoyAsuncion = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(ahora);
