import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Upload } from 'lucide-react';
import type { DisenoVersion } from '@afull/shared';
import { ESTADO_DISENO } from './etiquetas.js';
import { versionesDiseno, aprobarDiseno, observarDiseno } from '../../lib/api-disenos.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { Input } from '../ui/input.js';
import { ModalSubirDiseno } from './ModalSubirDiseno.js';


/** Diseño de la OT: versiones con su enlace de Drive, verificación (Juan o Sofi) y carga de una versión nueva. */
export function SeccionDisenoOT({ otId, otFinalizada }: { otId: string; otFinalizada: boolean }) {
  const qc = useQueryClient();
  const { data: versiones = [] } = useQuery({ queryKey: ['disenos', 'ot', otId], queryFn: () => versionesDiseno(otId) });
  const [subir, setSubir] = useState(false);
  const [observando, setObservando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const hayPendiente = versiones.some((v) => v.estado === 'PENDIENTE');

  const revisar = async (v: DisenoVersion, aprobar: boolean) => {
    try {
      if (aprobar) await aprobarDiseno(v.id);
      else await observarDiseno(v.id, motivo.trim());
      toast.success(aprobar ? 'Diseño aprobado: ya aparece en la cola de taller.' : 'Diseño observado.');
      setObservando(null);
      setMotivo('');
      void qc.invalidateQueries({ queryKey: ['disenos'] });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo registrar la revisión'));
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-[#1f2937] bg-[#111318] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Diseño ({versiones.length})</h2>
        {!otFinalizada && !hayPendiente && (
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setSubir(true)}><Upload className="h-3.5 w-3.5" /> Cargar diseño</Button>
        )}
      </div>
      {versiones.length === 0 && <p className="py-2 text-center text-xs text-neutral-500">Sin diseño cargado.</p>}
      {versiones.map((v) => (
        <div key={v.id} className="space-y-2 border-t border-[#1f2937] pt-2 text-xs first:border-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-neutral-400">v{v.version}</span>
            <Badge variant={ESTADO_DISENO[v.estado].variant}>{ESTADO_DISENO[v.estado].texto}</Badge>
            <span className="text-neutral-400">{v.origen === 'CLIENTE' ? 'del cliente' : 'de la diseñadora'} · {v.subido_por_nombre} · {formatearFechaHora(v.subido_at)}</span>
            <a href={v.drive_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[#ea580c] hover:underline">
              Abrir en Drive <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {v.notas && <p className="text-neutral-300">{v.notas}</p>}
          {v.revisado_por_nombre && (
            <p className="text-neutral-500">{v.estado === 'APROBADO' ? 'Aprobó' : 'Observó'} {v.revisado_por_nombre} · {formatearFechaHora(v.revisado_at)}{v.observacion && `: ${v.observacion}`}</p>
          )}
          {v.estado === 'PENDIENTE' && !otFinalizada && (
            observando === v.id ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) void revisar(v, false); }}>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué hay que corregir (medidas, textos…)" className="h-8 text-xs" autoFocus />
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={!motivo.trim()}>Observar</Button>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setObservando(null)}>Volver</Button>
              </form>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => void revisar(v, true)}>Aprobar (medidas verificadas)</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setObservando(v.id)}>Observar</Button>
              </div>
            )
          )}
        </div>
      ))}
      {subir && <ModalSubirDiseno otId={otId} puedeElegirOrigen onCerrar={() => setSubir(false)} />}
    </div>
  );
}
