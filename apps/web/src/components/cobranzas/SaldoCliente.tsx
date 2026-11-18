import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { saldoCliente } from '../../lib/api-cobranzas.js';
import { formatearGs } from '../../lib/formato.js';

/** Loop 21: lo que este cliente debe (facturas cargadas en Cobranzas, menos lo cobrado). */
export function SaldoCliente({ clienteId, nombre }: { clienteId: string; nombre: string }) {
  const { data } = useQuery({ queryKey: ['cobranzas-saldo', clienteId], queryFn: () => saldoCliente(clienteId) });
  if (!data) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-[#1f2937] bg-[#111318] px-4 py-3 text-sm">
      <span className="text-neutral-400">
        Saldo por cobrar: <b className="font-mono text-white">{formatearGs(data.saldo_gs)}</b>
        {data.facturas_pendientes > 0 && <span className="ml-2 text-xs">({data.facturas_pendientes} factura{data.facturas_pendientes === 1 ? '' : 's'})</span>}
      </span>
      <Link to="/cobranzas" search={{ q: nombre }} className="text-xs text-[#ea580c] hover:underline">Ver en Cobranzas</Link>
    </div>
  );
}
