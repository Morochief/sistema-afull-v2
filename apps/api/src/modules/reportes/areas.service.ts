import ExcelJS from 'exceljs';
import { AREAS_PROCESO, type AreaProceso } from '@afull/shared';
import { sql } from '../../db/client.js';
import { validarRango } from './registros.service.js';
import { encabezado, seguro } from './excel.js';

const TZ = 'America/Asuncion';

export type FiltroAreas = { desde: string; hasta: string; clienteId?: string; proyectoId?: string };
export type FilaArea = { ot_id: string; ot_codigo: string; cliente: string; titulo: string; por_area: Partial<Record<AreaProceso, number>>; segundos: number };
export type ReporteAreas = { areas: { codigo: AreaProceso; nombre: string; segundos: number }[]; filas: FilaArea[] };

/**
 * Loop 22: cuánto tiempo llevó cada OT en cada área de trabajo, en un período (tramos cerrados que empezaron en esas
 * fechas). En una tanda, el tiempo va repartido por m² entre sus OTs, igual que en el costo (`v_mano_obra`).
 * Columnas: solo las áreas con horas, en el orden de AREAS_PROCESO. Filas: las OTs, de la que más tiempo llevó a la que menos.
 */
export async function horasPorArea(f: FiltroAreas): Promise<ReporteAreas> {
  validarRango(f.desde, f.hasta);
  const rows = await sql<{ ot_id: string; ot_codigo: string; cliente: string; titulo: string; area: AreaProceso; segundos: number }[]>`
    SELECT o.id AS ot_id, o.codigo_ot AS ot_codigo, c.nombre AS cliente, o.titulo, coalesce(tt.area, 'OTRO') AS area,
           round(sum(v.segundos * v.peso / v.peso_total))::int AS segundos
    FROM v_mano_obra v
    JOIN tarea t ON t.id = v.tarea_id
    LEFT JOIN tipo_tarea tt ON tt.codigo = t.tipo
    JOIN orden_trabajo o ON o.id = v.orden_trabajo_id
    JOIN cliente c ON c.id = o.cliente_id
    WHERE (v.hora_inicio AT TIME ZONE ${TZ})::date BETWEEN ${f.desde}::date AND ${f.hasta}::date
      ${f.clienteId ? sql`AND o.cliente_id = ${f.clienteId}` : sql``}
      ${f.proyectoId ? sql`AND o.proyecto_id = ${f.proyectoId}` : sql``}
    GROUP BY o.id, o.codigo_ot, c.nombre, o.titulo, coalesce(tt.area, 'OTRO')`;
  const porOt = new Map<string, FilaArea>();
  const totales = new Map<AreaProceso, number>();
  for (const r of rows) {
    const fila = porOt.get(r.ot_id) ?? { ot_id: r.ot_id, ot_codigo: r.ot_codigo, cliente: r.cliente, titulo: r.titulo, por_area: {}, segundos: 0 };
    fila.por_area[r.area] = (fila.por_area[r.area] ?? 0) + r.segundos;
    fila.segundos += r.segundos;
    porOt.set(r.ot_id, fila);
    totales.set(r.area, (totales.get(r.area) ?? 0) + r.segundos);
  }
  const areas = (Object.keys(AREAS_PROCESO) as AreaProceso[]).filter((k) => totales.has(k))
    .map((k) => ({ codigo: k, nombre: AREAS_PROCESO[k], segundos: totales.get(k)! }));
  const filas = [...porOt.values()].sort((a, b) => b.segundos - a.segundos || a.ot_codigo.localeCompare(b.ot_codigo));
  return { areas, filas };
}

const horas = (s: number) => Math.round((s / 3600) * 100) / 100;

/** Excel: una fila por OT, una columna por área (en horas con 2 decimales) y la fila TOTAL. */
export async function excelAreas(r: ReporteAreas) {
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet('Horas por área');
  encabezado(h, [
    { header: 'OT', key: 'ot', width: 16 }, { header: 'Cliente', key: 'cliente', width: 26 }, { header: 'Trabajo', key: 'titulo', width: 36 },
    ...r.areas.map((a) => ({ header: a.nombre, key: a.codigo, width: 13, fmt: '0.00' })),
    { header: 'Total horas', key: 'total', width: 12, fmt: '0.00' },
  ]);
  for (const f of r.filas) {
    h.addRow({
      ot: f.ot_codigo, cliente: seguro(f.cliente), titulo: seguro(f.titulo), total: horas(f.segundos),
      ...Object.fromEntries(r.areas.map((a) => [a.codigo, f.por_area[a.codigo] ? horas(f.por_area[a.codigo]!) : null])),
    });
  }
  h.addRow({ ot: 'TOTAL', total: horas(r.areas.reduce((a, x) => a + x.segundos, 0)), ...Object.fromEntries(r.areas.map((a) => [a.codigo, horas(a.segundos)])) }).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
