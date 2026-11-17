import { useState } from 'react';
import { useSesion } from '../hooks/useSesion.js';
import { TabRegistros } from '../components/reportes/TabRegistros.js';
import { TabHoras } from '../components/reportes/TabHoras.js';
import { TabPreFactura } from '../components/reportes/TabPreFactura.js';

type Pestana = 'registros' | 'horas' | 'prefactura';

/** Loop 20: Reportes. Registros y pre-factura para la oficina (comercial); horas para pagar para RR.HH. */
export function ReportesPage() {
  const { tieneCapacidad } = useSesion();
  const pestanas = ([
    ['registros', 'Registros', tieneCapacidad('comercial')],
    ['horas', 'Horas para pagar', tieneCapacidad('rrhh')],
    ['prefactura', 'Pre-factura', tieneCapacidad('comercial')],
  ] as [Pestana, string, boolean][]).filter(([, , v]) => v);
  const [activa, setActiva] = useState<Pestana | null>(null);
  const actual = activa ?? pestanas[0]?.[0] ?? null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">Reportes</h1>
        <p className="text-xs text-neutral-400">Mano de obra, insumos y viajes por período, horas para pagar y pre-factura. Todo se descarga en Excel o se imprime.</p>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-[#1f2937]">
        {pestanas.map(([id, texto]) => (
          <button key={id} role="tab" aria-selected={actual === id} onClick={() => setActiva(id)}
            className={`px-3 py-2 text-xs font-semibold ${actual === id ? 'border-b-2 border-[#ea580c] text-white' : 'text-neutral-400 hover:text-white'}`}>{texto}</button>
        ))}
      </div>
      {actual === 'registros' && <TabRegistros />}
      {actual === 'horas' && <TabHoras />}
      {actual === 'prefactura' && <TabPreFactura />}
      {!actual && <p className="text-xs text-neutral-400">No tenés permiso para ver reportes.</p>}
    </div>
  );
}
