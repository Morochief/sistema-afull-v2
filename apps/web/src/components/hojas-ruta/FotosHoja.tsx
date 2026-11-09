import type { HojaRutaDetalle } from '../../lib/api-campo.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { GaleriaArchivos } from '../archivos/GaleriaArchivos.js';

/**
 * Lo que la cuadrilla trajo de la calle (L4.E3): viajes con la foto del odómetro al salir y al volver,
 * y las fotos del montaje por parada. La galería solo se pide para lo que tiene fotos.
 */
export function FotosHoja({ h }: { h: HojaRutaDetalle }) {
  const paradasConFotos = h.paradas.filter((p) => p.fotos > 0);
  if (h.viajes.length === 0 && paradasConFotos.length === 0) return null;
  return (
    <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs" data-testid="fotos-hoja">
      <h2 className="font-semibold uppercase tracking-wider text-neutral-400">Viajes y fotos</h2>
      {h.viajes.map((v) => (
        <div key={v.id} className="space-y-1.5 border-t border-[#1f2937] pt-2">
          <div className="text-white">
            {v.conductor} · {v.km_inicio} km → {v.km_fin ?? '…'} km
            <span className="text-neutral-400"> · {formatearFechaHora(v.hora_inicio)}{v.hora_fin && ` a ${formatearFechaHora(v.hora_fin)}`}</span>
            {v.alerta_desvio && <span className="text-amber-300"> · desvío: {v.motivo_desvio}</span>}
          </div>
          {v.fotos < (v.km_fin === null ? 1 : 2) && <p className="text-amber-300">Falta la foto del odómetro{v.km_fin !== null && v.fotos === 1 ? ' de una de las puntas' : ''} (puede estar por subir desde el celular).</p>}
          {v.fotos > 0 && <GaleriaArchivos refArchivo={{ viajeId: v.id }} />}
        </div>
      ))}
      {paradasConFotos.map((p) => (
        <div key={p.id} className="space-y-1.5 border-t border-[#1f2937] pt-2">
          <div className="text-white">Montaje {p.codigo_ot} <span className="text-neutral-400">· {p.cliente_nombre}{p.sucursal_nombre && ` · ${p.sucursal_nombre}`}</span></div>
          <GaleriaArchivos refArchivo={{ paradaId: p.id }} />
        </div>
      ))}
    </section>
  );
}
