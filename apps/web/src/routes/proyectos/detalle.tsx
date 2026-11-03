import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { obtenerProyecto, finalizarProyecto } from '../../lib/api-presupuestos.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { formatearGs } from '../../lib/formato.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog.js';
import { ESTADO_PROYECTO } from '../../components/presupuestos/etiquetas.js';
import { SeccionCosteoProyecto } from '../../components/costeo/SeccionCosteoProyecto.js';

export function ProyectoDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const { data: py, isLoading, error, refetch } = useQuery({ queryKey: ['proyecto', id], queryFn: () => obtenerProyecto(id) });
  const [accion, setAccion] = useState<'cerrar' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !py) {
    return (
      <div className="rounded-md border border-red-900/40 bg-red-950/10 p-8 text-center">
        <p className="mb-4 text-xs text-red-300">{mensajeDeError(error as ErrorApi, 'Proyecto inexistente')}</p>
        <Button size="sm" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accion) return;
    if (accion === 'cancelar' && !motivo.trim()) {
      toast.error('El motivo es obligatorio para cancelar.');
      return;
    }
    setCargando(true);
    try {
      await finalizarProyecto(py.id, accion, motivo.trim() || undefined);
      toast.success(accion === 'cerrar' ? 'Proyecto cerrado.' : 'Proyecto cancelado.');
      setAccion(null);
      setMotivo('');
      void qc.invalidateQueries({ queryKey: ['proyectos'] });
      void refetch();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo completar'), { duration: 8000 });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-[#1f2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/proyectos" className="rounded p-1.5 text-neutral-400 hover:bg-[#1f2937] hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#ea580c]">{py.codigo}</span>
              <h1 className="text-lg font-bold text-white">{py.nombre}</h1>
              <Badge variant={ESTADO_PROYECTO[py.estado].variant}>{ESTADO_PROYECTO[py.estado].texto}</Badge>
            </div>
            <p className="text-xs text-neutral-400">
              Cliente: <Link to="/clientes/$id" params={{ id: py.cliente_id }} className="text-[#ea580c] hover:underline">{py.cliente_nombre}</Link>
            </p>
          </div>
        </div>
        {py.estado === 'ABIERTO' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setAccion('cancelar')}>Cancelar proyecto</Button>
            <Button size="sm" className="text-xs" onClick={() => setAccion('cerrar')}>Cerrar proyecto</Button>
          </div>
        )}
      </div>

      <section className="rounded-md border border-[#1f2937] bg-[#111318] p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Órdenes de trabajo ({py.ordenes_trabajo.length})</h2>
        <table className="w-full text-xs">
          <tbody>
            {py.ordenes_trabajo.map((o) => (
              <tr key={o.id} className="border-b border-[#1f2937]/60">
                <td className="py-2 pr-2"><Link to="/ots/$id" params={{ id: o.id }} className="font-mono text-[#ea580c] hover:underline">{o.codigo_ot}</Link></td>
                <td className="py-2 pr-2 text-white">{o.titulo}</td>
                <td className="py-2 pr-2 text-neutral-400">{o.estado}</td>
                <td className="py-2 text-right font-mono text-neutral-200">{o.monto_presupuestado_gs === null ? '—' : formatearGs(o.monto_presupuestado_gs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end gap-6 text-sm font-semibold text-white">
          <span>Total presupuestado</span>
          <span className="font-mono text-[#ea580c]">{formatearGs(py.total_presupuestado_gs)}</span>
        </div>
      </section>

      <SeccionCosteoProyecto proyectoId={py.id} />

      <Dialog abierto={Boolean(accion)} onCerrar={() => setAccion(null)}>
        <DialogHeader>
          <DialogTitle>{accion === 'cerrar' ? 'Cerrar proyecto' : 'Cancelar proyecto'}</DialogTitle>
          <DialogDescription>Todas las OTs del proyecto tienen que estar terminadas o canceladas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={confirmar} className="space-y-4">
          <div>
            <Label htmlFor="motivoProyecto">Motivo {accion === 'cancelar' && <span className="text-red-400">*</span>}</Label>
            <Input id="motivoProyecto" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccion(null)} disabled={cargando}>Volver</Button>
            <Button type="submit" disabled={cargando}>{cargando ? 'Procesando...' : 'Confirmar'}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
