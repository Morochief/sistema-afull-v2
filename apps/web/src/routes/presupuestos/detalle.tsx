import { useState } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Printer } from 'lucide-react';
import type { PresupuestoItemFila } from '@afull/shared';
import { obtenerPresupuesto, editarItemPresupuesto, type AccionPresupuesto } from '../../lib/api-presupuestos.js';
import { obtenerCliente } from '../../lib/api-clientes.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { ESTADO_PRESUPUESTO } from '../../components/presupuestos/etiquetas.js';
import { TablaItems } from '../../components/presupuestos/TablaItems.js';
import { ModalItemPresupuesto } from '../../components/modals/ModalItemPresupuesto.js';
import { ModalAccionPresupuesto } from '../../components/modals/ModalAccionPresupuesto.js';

const ACCIONES: Record<string, { accion: AccionPresupuesto; texto: string; variante?: 'outline' }[]> = {
  BORRADOR: [{ accion: 'anular', texto: 'Anular', variante: 'outline' }, { accion: 'enviar', texto: 'Enviar al cliente' }],
  ENVIADO: [
    { accion: 'rechazar', texto: 'Rechazado', variante: 'outline' },
    { accion: 'nueva-version', texto: 'Nueva versión', variante: 'outline' },
    { accion: 'aprobar', texto: 'Aprobar' },
  ],
  RECHAZADO: [{ accion: 'nueva-version', texto: 'Nueva versión' }],
};

export function PresupuestoDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ['presupuesto', id], queryFn: () => obtenerPresupuesto(id) });
  const { data: cliente } = useQuery({ queryKey: ['cliente', p?.cliente_id], queryFn: () => obtenerCliente(p!.cliente_id), enabled: Boolean(p) });
  const [itemModal, setItemModal] = useState<{ item: PresupuestoItemFila | null } | null>(null);
  const [accion, setAccion] = useState<AccionPresupuesto | null>(null);

  const recargar = () => {
    void qc.invalidateQueries({ queryKey: ['presupuestos'] });
    void refetch();
  };

  if (isLoading) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (error || !p) {
    return (
      <div className="p-8 text-center rounded-md border border-red-900/40 bg-red-950/10">
        <h2 className="text-sm font-semibold text-white mb-2">No se pudo cargar el presupuesto</h2>
        <p className="text-xs text-red-300 mb-4">{mensajeDeError(error as ErrorApi, 'Presupuesto inexistente')}</p>
        <Button size="sm" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const editable = p.estado === 'BORRADOR';
  const alternar = async (i: PresupuestoItemFila) => {
    try {
      await editarItemPresupuesto(p.id, i.id, { activo: !i.activo });
      recargar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cambiar el ítem'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-[#1f2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/presupuestos" className="rounded p-1.5 text-neutral-400 hover:bg-[#1f2937] hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#ea580c]">{p.numero} v{p.version}</span>
              <h1 className="text-lg font-bold text-white">{p.titulo}</h1>
              <Badge variant={ESTADO_PRESUPUESTO[p.estado].variant}>{ESTADO_PRESUPUESTO[p.estado].texto}</Badge>
            </div>
            <p className="text-xs text-neutral-400">
              Cliente: <Link to="/clientes/$id" params={{ id: p.cliente_id }} className="text-[#ea580c] hover:underline">{p.cliente_nombre}</Link>
              {' · '}Validez {p.validez_dias} días{p.total_gs !== null && <> · Total {formatearGs(p.total_gs)}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/presupuestos/$id/imprimir" params={{ id: p.id }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#1f2937] px-3 text-xs text-neutral-200 hover:bg-[#1f2937]">
            <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
          </Link>
          {(ACCIONES[p.estado] ?? []).map((a) => (
            <Button key={a.accion} size="sm" variant={a.variante} className="text-xs" onClick={() => setAccion(a.accion)}>{a.texto}</Button>
          ))}
        </div>
      </div>

      {p.notas && <p className="whitespace-pre-wrap rounded-md border border-[#1f2937] bg-[#111318] p-3 text-xs text-neutral-300">{p.notas}</p>}

      <section className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Ítems</h2>
          {editable && (
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setItemModal({ item: null })}><Plus className="h-3.5 w-3.5" /> Agregar Ítem</Button>
          )}
        </div>
        <TablaItems
          items={p.items}
          margenPct={p.margen_pct}
          totalCongelado={p.total_gs}
          editable={editable}
          onEditar={(item) => setItemModal({ item })}
          onAlternarActivo={(i) => void alternar(i)}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Versiones</h2>
          {p.versiones.map((v) => (
            <Link key={v.id} to="/presupuestos/$id" params={{ id: v.id }} className={`flex justify-between rounded px-2 py-1 text-xs hover:bg-[#1f2937] ${v.id === p.id ? 'bg-[#1f2937] text-white' : 'text-neutral-300'}`}>
              <span>v{v.version} · {ESTADO_PRESUPUESTO[v.estado].texto}</span>
              <span className="font-mono">{v.total_gs === null ? '—' : formatearGs(v.total_gs)}</span>
            </Link>
          ))}
        </div>
        <div className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Historial</h2>
          {p.eventos.map((ev) => (
            <div key={ev.id} className="border-l-2 border-[#1f2937] py-1 pl-3 text-xs">
              <span className="font-semibold text-white">{ev.estado_anterior ? `${ESTADO_PRESUPUESTO[ev.estado_anterior].texto} → ` : ''}{ESTADO_PRESUPUESTO[ev.estado_nuevo].texto}</span>
              <span className="ml-2 font-mono text-[11px] text-neutral-500">{formatearFechaHora(ev.created_at)} · {ev.autor_nombre}</span>
              {ev.comentario && <p className="mt-1 text-neutral-300">{ev.comentario}</p>}
            </div>
          ))}
        </div>
      </section>

      <ModalItemPresupuesto
        abierto={Boolean(itemModal)}
        presupuestoId={p.id}
        item={itemModal?.item ?? null}
        sucursales={cliente?.sucursales ?? []}
        onCerrar={() => setItemModal(null)}
        onGuardado={recargar}
      />
      <ModalAccionPresupuesto
        accion={accion}
        presupuestoId={p.id}
        desde={p.estado}
        totalGs={p.total_gs}
        onCerrar={() => setAccion(null)}
        onHecho={(r) => {
          void qc.invalidateQueries({ queryKey: ['ots'] });
          if (accion === 'nueva-version' && r.id !== p.id) navigate({ to: '/presupuestos/$id', params: { id: r.id } });
          else if (r.proyecto) navigate({ to: '/proyectos/$id', params: { id: r.proyecto.id } });
          else if (r.ots?.[0]) navigate({ to: '/ots/$id', params: { id: r.ots[0].id } });
          recargar();
        }}
      />
    </div>
  );
}
