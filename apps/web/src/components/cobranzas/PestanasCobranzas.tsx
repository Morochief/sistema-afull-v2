import { Link } from '@tanstack/react-router';
import { useSesion } from '../../hooks/useSesion.js';

/** Loop 21: pestañas de Cobranzas (cada una es su propia ruta, así el filtro de cada tabla vive en la URL). */
export function PestanasCobranzas({ actual }: { actual: 'facturas' | 'recibos' | 'empresa' }) {
  const { tieneCapacidad } = useSesion();
  const pestanas = [
    { id: 'facturas', texto: 'Facturas a cobrar', ruta: '/cobranzas' },
    { id: 'recibos', texto: 'Recibos', ruta: '/cobranzas/recibos' },
    ...(tieneCapacidad('admin') ? [{ id: 'empresa', texto: 'Datos de aFull', ruta: '/cobranzas/empresa' }] : []),
  ] as const;
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Cobranzas</h1>
        <p className="text-xs text-neutral-400">Facturas que ya emitiste, lo que se cobró y los recibos de dinero para el cliente.</p>
      </div>
      <nav className="inline-flex rounded-md border border-[#1f2937] bg-[#111318] p-0.5 text-sm" role="tablist">
        {pestanas.map((p) => (
          <Link key={p.id} to={p.ruta} role="tab" aria-selected={actual === p.id}
            className={`rounded px-4 py-1.5 ${actual === p.id ? 'bg-[#ea580c] text-white' : 'text-neutral-300 hover:text-white'}`}>
            {p.texto}
          </Link>
        ))}
      </nav>
    </div>
  );
}
