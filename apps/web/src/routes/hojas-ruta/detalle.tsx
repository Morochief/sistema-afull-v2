import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { obtenerHojaRuta, agregarPersonaHoja, agregarParadaHoja } from '../../lib/api-campo.js';
import { obtenerPersonasAsignables } from '../../lib/api-personas.js';
import { obtenerOTs } from '../../lib/api-ots.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { FotosHoja } from '../../components/hojas-ruta/FotosHoja.js';
import { AgregarProyecto } from '../../components/hojas-ruta/AgregarProyecto.js';

const selectCls = 'h-9 rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';

/** Armar la hoja: cuadrilla (con rol) y paradas (OTs abiertas). Con la hoja en curso, una parada nueva es EXTRA y pide motivo. */
export function HojaRutaDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: h, isLoading, error, refetch } = useQuery({ queryKey: ['hoja-ruta', id], queryFn: () => obtenerHojaRuta(id) });
  const { data: personas = [] } = useQuery({ queryKey: ['personas-asignables'], queryFn: () => obtenerPersonasAsignables() });
  const [personaId, setPersonaId] = useState('');
  const [rol, setRol] = useState('MONTADOR');
  const [buscarOT, setBuscarOT] = useState('');
  const q = useDebounce(buscarOT, 300);
  const { data: ots } = useQuery({ queryKey: ['ots-hoja', q], queryFn: () => obtenerOTs({ q, pagina: 1 }), enabled: q.trim().length > 1 });
  const [motivoExtra, setMotivoExtra] = useState('');

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !h) return <p className="text-xs text-red-300">{mensajeDeError(error as ErrorApi, 'Hoja de ruta inexistente')}</p>;
  const editable = h.estado !== 'FINALIZADA';
  const extra = h.estado === 'EN_CURSO';

  const hacer = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void refetch();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-[#1f2937] pb-3">
        <Link to="/hojas-ruta" className="rounded p-1.5 text-neutral-400 hover:bg-[#1f2937] hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-bold text-white">{h.descripcion || 'Hoja de ruta'} · {h.fecha.split('-').reverse().join('/')}</h1>
        <Badge variant={h.estado === 'FINALIZADA' ? 'success' : h.estado === 'EN_CURSO' ? 'warning' : 'neutral'}>{h.estado}</Badge>
        <span className="text-xs text-neutral-400">{h.chapa ?? 'sin vehículo'}</span>
      </div>

      <section className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs">
        <h2 className="font-semibold uppercase tracking-wider text-neutral-400">Cuadrilla</h2>
        {h.personas.filter((p) => p.activo).map((p) => <div key={p.id} className="text-white">{p.nombre} <span className="text-neutral-400">· {p.rol.toLowerCase()}</span></div>)}
        {editable && (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (personaId) void hacer(() => agregarPersonaHoja(h.id, { personaId, rol }), 'Persona agregada.'); }}>
            <select aria-label="Persona" className={selectCls} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">Agregar persona…</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select aria-label="Rol" className={selectCls} value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="CONDUCTOR">Conductor</option><option value="MONTADOR">Montador</option><option value="AYUDANTE">Ayudante</option>
            </select>
            <Button type="submit" size="sm" disabled={!personaId}>Agregar</Button>
          </form>
        )}
      </section>

      <section className="space-y-2 rounded-md border border-[#1f2937] bg-[#111318] p-4 text-xs">
        <h2 className="font-semibold uppercase tracking-wider text-neutral-400">Paradas ({h.paradas.length})</h2>
        {h.paradas.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-t border-[#1f2937] pt-2">
            <span className="text-white">{p.orden_secuencia}. <Link to="/ots/$id" params={{ id: p.orden_trabajo_id }} className="font-mono text-[#ea580c] hover:underline">{p.codigo_ot}</Link> {p.cliente_nombre}{p.sucursal_nombre && ` · ${p.sucursal_nombre}`}{p.tipo === 'EXTRA' && ` · extra: ${p.motivo_extra}`}</span>
            <span className="text-neutral-400">{p.estado === 'OMITIDA' ? `omitida: ${p.motivo_omision}` : p.estado.toLowerCase()}{p.fotos > 0 && ` · ${p.fotos} foto${p.fotos > 1 ? 's' : ''}`}</span>
          </div>
        ))}
        {editable && (
          <div className="space-y-2 border-t border-[#1f2937] pt-2">
            <Input value={buscarOT} onChange={(e) => setBuscarOT(e.target.value)} placeholder="Buscar OT por código, trabajo o cliente para agregar…" />
            {extra && <Input value={motivoExtra} onChange={(e) => setMotivoExtra(e.target.value)} placeholder="La hoja ya salió: motivo de la parada extra" />}
            <AgregarProyecto hojaId={h.id} motivoExtra={motivoExtra} onAgregado={() => void refetch()} />
            {(ots?.items ?? []).filter((o) => o.estado !== 'TERMINADO' && o.estado !== 'CANCELADO').map((o) => (
              <button key={o.id} type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-[#161922]"
                onClick={() => void hacer(() => agregarParadaHoja(h.id, { ordenTrabajoId: o.id, motivoExtra: motivoExtra.trim() || undefined }), `Parada ${o.codigo_ot} agregada.`)}>
                <span className="font-mono text-[#ea580c]">{o.codigo_ot}</span> {o.titulo} · {o.cliente_nombre}{o.sucursal_nombre && ` · ${o.sucursal_nombre}`}
              </button>
            ))}
          </div>
        )}
      </section>
      <FotosHoja h={h} />
    </div>
  );
}
