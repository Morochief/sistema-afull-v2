import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { anularRecibo, obtenerRecibo, refrescarCobranzas } from '../../lib/api-cobranzas.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { HojaRecibo } from '../../components/cobranzas/HojaRecibo.js';
import { ModalAnular } from '../../components/cobranzas/ModalAnular.js';

/**
 * Recibo para ver, imprimir o "Guardar como PDF" (para mandarlo por WhatsApp o correo). Va fuera del menú, como el
 * presupuesto imprimible; sin sesión la API responde 401 y se avisa.
 */
export function ReciboPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const { data: r, error, isLoading, refetch } = useQuery({ queryKey: ['cobranzas-recibo', id], queryFn: () => obtenerRecibo(id) });
  const [anular, setAnular] = useState(false);
  useEffect(() => { document.title = r ? `Recibo ${r.numero} — ${r.cliente.nombre}` : 'Recibo'; }, [r]);

  if (isLoading) return <p className="p-8 text-sm">Cargando…</p>;
  if (error || !r) return <p className="p-8 text-sm">{mensajeDeError(error as ErrorApi, 'No se pudo cargar el recibo. Iniciá sesión e intentá de nuevo.')}</p>;
  return (
    <div className="min-h-screen bg-white p-6 print:p-0">
      <div className="mx-auto mb-4 flex max-w-[190mm] items-center justify-between gap-2 print:hidden">
        <Link to="/cobranzas/recibos" className="text-xs text-neutral-600 underline">← Volver a recibos</Link>
        <div className="flex gap-2">
          {!r.anulado_at && <button type="button" onClick={() => setAnular(true)} className="rounded border border-red-300 px-3 py-2 text-xs text-red-700">Anular recibo</button>}
          <button type="button" onClick={() => window.print()} className="rounded bg-[#ea580c] px-4 py-2 text-xs font-semibold text-white">Imprimir / Guardar PDF</button>
        </div>
      </div>
      {!r.empresa && <p className="mx-auto mb-3 max-w-[190mm] rounded bg-amber-100 p-2 text-xs text-amber-900 print:hidden">Faltan los datos de aFull (razón social y RUC) para el encabezado: los carga el administrador en Cobranzas → Datos de aFull.</p>}
      {r.nota && <p className="mx-auto mb-3 max-w-[190mm] text-xs text-neutral-500 print:hidden">Nota interna: {r.nota}</p>}
      <HojaRecibo r={r} />
      <div className="dark">
        <ModalAnular titulo={anular ? `recibo ${r.numero}` : null} onCerrar={() => setAnular(false)}
          aviso="El saldo vuelve a las facturas y el recibo queda marcado como ANULADO (no se borra)."
          onAnular={async (m) => { await anularRecibo(r.id, m); await refrescarCobranzas(qc); await refetch(); }} />
      </div>
    </div>
  );
}
