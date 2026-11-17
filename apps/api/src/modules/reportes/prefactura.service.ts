import { sql } from '../../db/client.js';
import { ErrorApp } from '../../lib/errores.js';
import { todosLosRegistros, validarRango } from './registros.service.js';

/**
 * Loop 20: pre-factura por proyecto (todas sus OTs, sin límite de fechas) o por cliente + período (las OTs con
 * registros en el período). Costo de mano de obra, insumos y vehículos; el margen y el precio sugerido se calculan
 * en la pantalla (precio = costo ÷ (1 − margen), igual que el presupuesto). Documento interno, no es la factura legal.
 */
export async function preFactura(q: { proyectoId?: string; clienteId?: string; desde?: string; hasta?: string }) {
  let clienteId: string;
  let proyecto: { codigo: string; nombre: string } | null = null;
  if (q.proyectoId) {
    const [py] = await sql<{ codigo: string; nombre: string; cliente_id: string }[]>`SELECT codigo, nombre, cliente_id FROM proyecto WHERE id = ${q.proyectoId}`;
    if (!py) throw new ErrorApp(404, 'Proyecto no encontrado');
    clienteId = py.cliente_id;
    proyecto = { codigo: py.codigo, nombre: py.nombre };
  } else if (q.clienteId && q.desde && q.hasta) {
    validarRango(q.desde, q.hasta);
    clienteId = q.clienteId;
  } else {
    throw new ErrorApp(400, 'Elegí un proyecto, o un cliente con el período');
  }
  const [cliente] = await sql<{ nombre: string; razon_social: string | null; ruc: string | null }[]>`SELECT nombre, razon_social, ruc FROM cliente WHERE id = ${clienteId}`;
  if (!cliente) throw new ErrorApp(404, 'Cliente no encontrado');
  const registros = q.proyectoId
    ? await todosLosRegistros({ proyectoId: q.proyectoId }, 5000)
    : await todosLosRegistros({ clienteId, desde: q.desde, hasta: q.hasta }, 5000);
  const ids = [...new Set(registros.map((r) => r.ot_id))];
  const ots = q.proyectoId
    ? await sql<{ id: string; codigo_ot: string; titulo: string; estado: string; monto_presupuestado_gs: number | null }[]>`
        SELECT id, codigo_ot, titulo, estado, monto_presupuestado_gs::float8 AS monto_presupuestado_gs FROM orden_trabajo WHERE proyecto_id = ${q.proyectoId} ORDER BY codigo_ot`
    : (await sql<{ id: string; codigo_ot: string; titulo: string; estado: string; monto_presupuestado_gs: number | null }[]>`
        SELECT id, codigo_ot, titulo, estado, monto_presupuestado_gs::float8 AS monto_presupuestado_gs FROM orden_trabajo WHERE cliente_id = ${clienteId} ORDER BY codigo_ot`)
        .filter((o) => ids.includes(o.id));
  const suma = (c: string) => registros.filter((r) => r.concepto === c).reduce((a, r) => a + r.total_gs, 0);
  const [mo, ins, veh] = [suma('MO'), suma('Insumo'), suma('Vehículo')];
  const montos = ots.map((o) => o.monto_presupuestado_gs).filter((m): m is number => m !== null);
  return {
    cliente, proyecto, desde: q.desde ?? null, hasta: q.hasta ?? null, ots: [...ots],
    mano_obra_gs: mo, insumos_gs: ins, vehiculos_gs: veh, costo_base_gs: mo + ins + veh,
    monto_presupuestado_gs: montos.length ? montos.reduce((a, b) => a + b, 0) : null,
    registros,
  };
}
