import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { TIPOS_PERMISO, type EstadoPermiso } from '@afull/shared';
import { obtenerPermiso, transicionarPermiso } from '../../lib/api-permisos.js';
import { useSesion } from '../../hooks/useSesion.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { ESTADO_PERMISO, periodo } from '../../components/permisos/etiquetas.js';

const FIRMA: Record<EstadoPermiso, string> = {
  PENDIENTE: 'Solicitó', AUTORIZADA: 'Autorizó (jefe inmediato)', REGISTRADA: 'Registró (RR.HH.)', RECHAZADA: 'Rechazó', ANULADA: 'Anuló',
};

/** Detalle de la solicitud con sus firmas y las acciones que le tocan a quien mira. */
export function PermisoDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const { tieneCapacidad } = useSesion();
  const { data: s, isLoading, error } = useQuery({ queryKey: ['permiso', id], queryFn: () => obtenerPermiso(id) });
  const [comentario, setComentario] = useState('');
  const [cargando, setCargando] = useState(false);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !s) return <p className="text-xs text-red-300">{mensajeDeError(error, 'Solicitud inexistente')}</p>;

  const esJefe = tieneCapacidad('admin');
  const esRrhh = tieneCapacidad('rrhh');
  const mover = async (a: EstadoPermiso, conDescuento?: boolean) => {
    setCargando(true);
    try {
      await transicionarPermiso(s.id, { desde: s.estado, a, comentario: comentario.trim() || undefined, conDescuento });
      toast.success(`Solicitud ${ESTADO_PERMISO[a].texto.toLowerCase()}.`);
      setComentario('');
      void qc.invalidateQueries({ queryKey: ['permiso', id] });
      void qc.invalidateQueries({ queryKey: ['permisos'] });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo actualizar'));
    } finally {
      setCargando(false);
    }
  };

  const acciones: React.ReactNode[] = [];
  if (s.estado === 'PENDIENTE' && esJefe) acciones.push(<Button key="aut" size="sm" disabled={cargando} onClick={() => void mover('AUTORIZADA')}>Autorizar</Button>);
  if (s.estado === 'AUTORIZADA' && esRrhh) {
    acciones.push(<Button key="nod" size="sm" disabled={cargando} onClick={() => void mover('REGISTRADA', false)}>Registrar sin descuento</Button>);
    acciones.push(<Button key="sid" size="sm" variant="outline" disabled={cargando} onClick={() => void mover('REGISTRADA', true)}>Registrar con descuento</Button>);
  }
  if ((s.estado === 'PENDIENTE' || s.estado === 'AUTORIZADA') && esRrhh) {
    acciones.push(<Button key="rec" size="sm" variant="outline" disabled={cargando || !comentario.trim()} onClick={() => void mover('RECHAZADA')}>Rechazar</Button>);
  }
  if (s.estado === 'PENDIENTE' && s.es_propia) acciones.push(<Button key="anu" size="sm" variant="ghost" disabled={cargando} onClick={() => void mover('ANULADA')}>Anular mi solicitud</Button>);

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/permisos" className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Permisos</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-bold text-white">{s.numero}</h1>
        <Badge variant={ESTADO_PERMISO[s.estado].variant}>{ESTADO_PERMISO[s.estado].texto}</Badge>
        {s.con_descuento !== null && <Badge variant={s.con_descuento ? 'danger' : 'success'}>{s.con_descuento ? 'Con descuento' : 'Sin descuento'}</Badge>}
        {s.fuera_de_plazo && <Badge variant="warning">Fuera de las 24 h</Badge>}
      </div>
      <div className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs">
        <div><span className="text-neutral-400">Solicitante:</span> <span className="text-white">{s.persona_nombre}</span></div>
        <div><span className="text-neutral-400">Solicita:</span> <span className="text-white">{TIPOS_PERMISO[s.tipo].texto}{s.detalle_tipo ? ` · ${s.detalle_tipo}` : ''}</span></div>
        <div><span className="text-neutral-400">Cuándo:</span> <span className="font-mono text-white">{periodo(s)}</span></div>
        <div><span className="text-neutral-400">Motivo:</span> <span className="whitespace-pre-wrap text-neutral-200">{s.motivo}</span></div>
        <div>
          <span className="text-neutral-400">Comprobante:</span>{' '}
          {s.comprobante_url ? (
            <a href={s.comprobante_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#ea580c] hover:underline">Abrir <ExternalLink className="h-3 w-3" /></a>
          ) : TIPOS_PERMISO[s.tipo].requiereComprobante ? <span className="text-amber-400">falta (este tipo lo requiere)</span> : <span className="text-neutral-500">—</span>}
        </div>
      </div>
      {acciones.length > 0 && (
        <div className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4" data-testid="acciones-permiso">
          {esRrhh && <Input aria-label="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario (obligatorio para rechazar)" />}
          <div className="flex flex-wrap gap-2">{acciones}</div>
        </div>
      )}
      <div className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Firmas</h2>
        {s.eventos.map((e) => (
          <div key={e.id} className="border-l-2 border-[#1f2937] pl-3 text-xs">
            <span className="text-white">{FIRMA[e.estado_nuevo]}</span> <span className="text-neutral-400">· {e.autor} · {formatearFechaHora(e.created_at)}</span>
            {e.con_descuento !== null && <span className="text-neutral-400"> · {e.con_descuento ? 'con' : 'sin'} descuento</span>}
            {e.comentario && <p className="mt-1 text-neutral-300">{e.comentario}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
