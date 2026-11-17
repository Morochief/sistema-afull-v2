import { calcularPrecio, type PreFactura } from '../../lib/api-reportes.js';
import { formatearGs } from '../../lib/formato.js';

/**
 * Loop 20: el resumen de la pre-factura (en la pantalla y en la hoja para imprimir): cliente, OTs, costos,
 * margen sobre la venta (como el presupuesto), precio sugerido, IVA y lo presupuestado para comparar.
 */
export function ResumenPreFactura({ p, margen, claro = false }: { p: PreFactura; margen: number; claro?: boolean }) {
  const { precio, iva, total } = calcularPrecio(p.costo_base_gs, margen);
  const borde = claro ? 'border-neutral-300' : 'border-[#1f2937]';
  const tenue = claro ? 'text-neutral-500' : 'text-neutral-400';
  const fila = (texto: string, monto: number, fuerte = false, testid?: string) => (
    <div className={`flex justify-between gap-4 py-1 ${fuerte ? 'font-bold' : ''}`} data-testid={testid}><span>{texto}</span><span className="font-mono">{formatearGs(monto)}</span></div>
  );
  return (
    <div className="space-y-3 text-xs">
      <div className={`rounded border ${borde} p-3`}>
        <p className="text-sm font-semibold">{p.cliente.nombre}</p>
        <p className={tenue}>{[p.cliente.razon_social, p.cliente.ruc && `RUC ${p.cliente.ruc}`].filter(Boolean).join(' · ') || 'Sin razón social ni RUC cargados'}</p>
        {p.proyecto && <p className={tenue}>Proyecto {p.proyecto.codigo} · {p.proyecto.nombre}</p>}
        {p.desde && <p className={tenue}>Período {p.desde} al {p.hasta}</p>}
      </div>
      <div className={`rounded border ${borde} p-3`}>
        <p className="mb-1 font-semibold">Órdenes de trabajo ({p.ots.length})</p>
        {p.ots.map((o) => (
          <div key={o.id} className="flex justify-between gap-4"><span>{o.codigo_ot} · {o.titulo} <span className={tenue}>({o.estado})</span></span>
            <span className="font-mono">{o.monto_presupuestado_gs === null ? 'sin presupuesto' : formatearGs(o.monto_presupuestado_gs)}</span></div>
        ))}
      </div>
      <div className={`rounded border ${borde} p-3`}>
        {fila('Mano de obra', p.mano_obra_gs)}
        {fila('Insumos, materiales y desperdicio', p.insumos_gs)}
        {fila('Vehículos y viajes', p.vehiculos_gs)}
        <div className={`border-t ${borde}`}>{fila('Costo base', p.costo_base_gs, true)}</div>
        <div className={`flex justify-between py-1 ${tenue}`}><span>Margen sobre la venta</span><span className="font-mono">{margen} %</span></div>
        {fila('Precio sugerido (sin IVA)', precio, true, 'precio-sugerido')}
        {fila('IVA 10 %', iva)}
        <div className={`border-t ${borde}`}>{fila('Total con IVA', total, true, 'total-con-iva')}</div>
        {p.monto_presupuestado_gs !== null && (
          <div className={`mt-1 flex justify-between ${tenue}`}><span>Presupuestado (sin IVA)</span><span className="font-mono">{formatearGs(p.monto_presupuestado_gs)}</span></div>
        )}
      </div>
    </div>
  );
}
