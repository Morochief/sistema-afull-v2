import ExcelJS from 'exceljs';
import type { FilaRegistro } from './registros.service.js';

/** Un texto que empieza con = + - @ se toma como fórmula en Excel: se escapa con ' (inyección de fórmulas). */
export const seguro = (v: string | null | undefined) => (v && /^[=+\-@]/.test(v) ? `'${v}` : v ?? '');
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const GS = '#,##0';

function encabezado(h: ExcelJS.Worksheet, columnas: { header: string; key: string; width: number; fmt?: string }[]) {
  h.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
  h.getRow(1).font = { bold: true };
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  h.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Hoja "Registros" con las columnas del Excel de Juan (+ OT y Cliente) y hoja "Resumen" por concepto y por persona. */
export async function excelRegistros(filas: FilaRegistro[]) {
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet('Registros');
  encabezado(h, [
    { header: 'Proyecto', key: 'proyecto', width: 28 }, { header: 'OT', key: 'ot', width: 16 }, { header: 'Fecha', key: 'fecha', width: 12, fmt: 'dd/mm/yyyy' },
    { header: 'Cliente', key: 'cliente', width: 24 }, { header: 'Concepto', key: 'concepto', width: 10 }, { header: 'Descripción', key: 'descripcion', width: 44 },
    { header: 'Hs Inicio', key: 'ini', width: 9 }, { header: 'Hs Fin', key: 'fin', width: 9 }, { header: 'Hs Total', key: 'hs', width: 9 },
    { header: 'Cantidad', key: 'cantidad', width: 10, fmt: '#,##0.####' }, { header: 'Unidad', key: 'unidad', width: 8 },
    { header: 'Precio Unitario', key: 'precio', width: 14, fmt: '#,##0.####' }, { header: 'Total', key: 'total', width: 14, fmt: GS },
  ]);
  for (const f of filas) {
    h.addRow({
      proyecto: seguro(f.proyecto), ot: f.ot_codigo, fecha: new Date(`${f.fecha}T00:00:00Z`), cliente: seguro(f.cliente), concepto: f.concepto,
      descripcion: seguro(f.descripcion), ini: f.hs_inicio ?? '', fin: f.hs_fin ?? '', hs: f.concepto === 'MO' ? hhmm(f.cantidad) : '',
      cantidad: f.cantidad, unidad: f.unidad, precio: f.precio_unitario, total: f.total_gs,
    });
  }
  const r = wb.addWorksheet('Resumen');
  encabezado(r, [{ header: 'Concepto / Persona', key: 'k', width: 34 }, { header: 'Horas', key: 'h', width: 10 }, { header: 'Total Gs.', key: 't', width: 16, fmt: GS }]);
  for (const c of ['MO', 'Insumo', 'Vehículo'] as const) {
    const de = filas.filter((f) => f.concepto === c);
    r.addRow({ k: c === 'MO' ? 'Mano de obra' : c === 'Insumo' ? 'Insumos y desperdicio' : 'Vehículos', h: c === 'MO' ? hhmm(de.reduce((a, f) => a + f.cantidad, 0)) : '', t: de.reduce((a, f) => a + f.total_gs, 0) });
  }
  r.addRow({ k: 'TOTAL', t: filas.reduce((a, f) => a + f.total_gs, 0) }).font = { bold: true };
  r.addRow({});
  const porPersona = new Map<string, { min: number; gs: number }>();
  for (const f of filas.filter((x) => x.concepto === 'MO')) {
    const p = porPersona.get(f.persona ?? '') ?? { min: 0, gs: 0 };
    porPersona.set(f.persona ?? '', { min: p.min + f.cantidad, gs: p.gs + f.total_gs });
  }
  for (const [p, v] of [...porPersona].sort()) r.addRow({ k: seguro(p), h: hhmm(v.min), t: v.gs });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Resumen = { persona: string; segundos: number; tramos: number; total_gs: number; sin_tarifa: boolean; reloj_abierto: boolean };
type Detalle = { persona: string; fecha: string; inicio: string; fin: string | null; minutos: number | null; ot_codigo: string; cliente: string; tarea: string; nota: string; total_gs: number };

/** Planilla de horas para pagar: "Resumen" por persona y "Detalle" con cada tramo. */
export async function excelHoras(resumen: Resumen[], detalle: Detalle[]) {
  const wb = new ExcelJS.Workbook();
  const r = wb.addWorksheet('Resumen');
  encabezado(r, [
    { header: 'Persona', key: 'p', width: 28 }, { header: 'Horas (hh:mm)', key: 'hh', width: 13 }, { header: 'Horas', key: 'h', width: 9, fmt: '0.00' },
    { header: 'Tramos', key: 'n', width: 8 }, { header: 'A pagar Gs.', key: 't', width: 16, fmt: GS }, { header: 'Avisos', key: 'a', width: 40 },
  ]);
  for (const x of resumen) {
    const avisos = [x.sin_tarifa && 'Horas sin tarifa (cuentan 0)', x.reloj_abierto && 'Tiene un reloj abierto: no suma hasta cerrarlo'].filter(Boolean).join(' · ');
    r.addRow({ p: seguro(x.persona), hh: hhmm(x.segundos / 60), h: Math.round((x.segundos / 3600) * 100) / 100, n: x.tramos, t: x.total_gs, a: avisos });
  }
  r.addRow({ p: 'TOTAL', t: resumen.reduce((a, x) => a + x.total_gs, 0) }).font = { bold: true };
  const d = wb.addWorksheet('Detalle');
  encabezado(d, [
    { header: 'Persona', key: 'p', width: 24 }, { header: 'Fecha', key: 'f', width: 12, fmt: 'dd/mm/yyyy' }, { header: 'Inicio', key: 'i', width: 8 },
    { header: 'Fin', key: 'fi', width: 8 }, { header: 'Minutos', key: 'm', width: 9 }, { header: 'OT', key: 'ot', width: 16 }, { header: 'Cliente', key: 'c', width: 22 },
    { header: 'Tarea', key: 'ta', width: 32 }, { header: 'Nota', key: 'n', width: 28 }, { header: 'Gs.', key: 'g', width: 14, fmt: GS },
  ]);
  for (const x of detalle) {
    d.addRow({ p: seguro(x.persona), f: new Date(`${x.fecha}T00:00:00Z`), i: x.inicio, fi: x.fin ?? '', m: x.minutos ?? '', ot: x.ot_codigo, c: seguro(x.cliente), ta: seguro(x.tarea), n: x.nota, g: x.total_gs });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
