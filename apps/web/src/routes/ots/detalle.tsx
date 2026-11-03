import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { ArrowLeft, Edit2, ArrowRightCircle, Calendar, User, Clock } from 'lucide-react';
import { esEstadoFinal, type EstadoOT } from '@afull/shared';
import { useOT } from '../../hooks/ots/useOT.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaDate, formatearFechaHora } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { Button } from '../../components/ui/button.js';
import { Badge, type BadgeVariant } from '../../components/ui/badge.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { ModalEditarOT } from '../../components/modals/ModalEditarOT.js';
import { ModalTransicionOT } from '../../components/modals/ModalTransicionOT.js';
import { SeccionTareasOT } from '../../components/ots/SeccionTareasOT.js';

function badgeEstado(estado: EstadoOT): { variant: BadgeVariant; texto: string } {
  switch (estado) {
    case 'PENDIENTE':
      return { variant: 'neutral', texto: 'Pendiente' };
    case 'EN_DISENO':
      return { variant: 'default', texto: 'En Diseño' };
    case 'EN_TALLER':
      return { variant: 'warning', texto: 'En Taller' };
    case 'EN_MONTAJE':
      return { variant: 'warning', texto: 'En Montaje' };
    case 'TERMINADO':
      return { variant: 'success', texto: 'Terminado' };
    case 'CANCELADO':
      return { variant: 'danger', texto: 'Cancelado' };
    default:
      return { variant: 'neutral', texto: estado };
  }
}

export function OTsDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: ot, isLoading, error, refetch } = useOT(id);

  const [modalEditar, setModalEditar] = useState(false);
  const [modalTransicionar, setModalTransicionar] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !ot) {
    return (
      <div className="p-8 text-center rounded-md border border-red-900/40 bg-red-950/10">
        <h2 className="text-sm font-semibold text-white mb-2">No se pudo cargar la orden</h2>
        <p className="text-xs text-red-300 mb-4">{mensajeDeError(error, 'OT inexistente')}</p>
        <Button size="sm" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const final = esEstadoFinal(ot.estado);
  const b = badgeEstado(ot.estado);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1f2937] pb-4">
        <div className="flex items-center gap-3">
          <Link to="/ots" className="rounded p-1.5 text-neutral-400 hover:text-white hover:bg-[#1f2937]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#ea580c]">{ot.codigo_ot}</span>
              <h1 className="text-lg font-bold text-white">{ot.titulo}</h1>
              <Badge variant={b.variant}>{b.texto}</Badge>
            </div>
            <p className="text-xs text-neutral-400">
              Cliente:{' '}
              <Link to="/clientes/$id" params={{ id: ot.cliente_id }} className="text-[#ea580c] hover:underline">
                {ot.cliente_nombre}
              </Link>
              {ot.sucursal_nombre && ` · Sucursal: ${ot.sucursal_nombre}`}
            </p>
          </div>
        </div>

        {!final && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setModalEditar(true)} className="gap-1.5 text-xs">
              <Edit2 className="h-3.5 w-3.5" />
              <span>Editar</span>
            </Button>
            <Button size="sm" onClick={() => setModalTransicionar(true)} className="gap-1.5 text-xs">
              <ArrowRightCircle className="h-3.5 w-3.5" />
              <span>Avanzar Estado</span>
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Detalles Operativos</h2>
          <div>
            <span className="text-[11px] text-neutral-500">Descripción</span>
            <p className="text-xs text-neutral-200 whitespace-pre-wrap">{ot.descripcion || 'Sin descripción adicional.'}</p>
          </div>
        </div>

        <div className="rounded-md border border-[#1f2937] bg-[#111318] p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Metadatos</h2>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Prometida:</span>
              <span className="font-mono text-neutral-200">{formatearFechaDate(ot.fecha_prometida)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Creada:</span>
              <span className="font-mono text-neutral-200">{formatearFechaHora(ot.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Creada por:</span>
              <span className="text-neutral-300 truncate max-w-[140px]">{ot.creado_por_nombre}</span>
            </div>
            {ot.presupuesto_id && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Presupuesto:</span>
                <Link to="/presupuestos/$id" params={{ id: ot.presupuesto_id }} className="font-mono text-[#ea580c] hover:underline">
                  {ot.presupuesto_numero} v{ot.presupuesto_version}
                </Link>
              </div>
            )}
            {ot.monto_presupuestado_gs !== null && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Monto presupuestado:</span>
                <span className="font-mono text-neutral-200">{formatearGs(ot.monto_presupuestado_gs)}</span>
              </div>
            )}
            {ot.proyecto_id && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Proyecto:</span>
                <Link to="/proyectos/$id" params={{ id: ot.proyecto_id }} className="font-mono text-[#ea580c] hover:underline">
                  {ot.proyecto_codigo}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <SeccionTareasOT otId={ot.id} otFinalizada={final} />

      <div className="rounded-md border border-[#1f2937] bg-[#111318] p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Línea de Tiempo de Estados</h2>
        <div className="space-y-3">
          {ot.eventos.map((ev, idx) => (
            <div key={ev.id || idx} className="flex items-start gap-3 border-l-2 border-[#1f2937] pl-3 py-1">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-white">
                    {ev.estado_anterior ? `${ev.estado_anterior} → ` : 'Inicial: '}
                    <span className="text-[#ea580c]">{ev.estado_nuevo}</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {formatearFechaHora(ev.created_at)}
                  </span>
                </div>
                {ev.comentario && (
                  <p className="text-xs text-neutral-300 bg-[#161922] p-2 rounded border border-[#1f2937]">
                    {ev.comentario}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ModalEditarOT ot={ot} abierto={modalEditar} onCerrar={() => setModalEditar(false)} />
      <ModalTransicionOT
        ot={ot}
        abierto={modalTransicionar}
        onCerrar={() => setModalTransicionar(false)}
        onTransicionExitosa={() => void refetch()}
      />
    </div>
  );
}
