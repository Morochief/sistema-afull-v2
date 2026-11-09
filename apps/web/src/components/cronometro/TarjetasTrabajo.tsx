import { Play, Pause, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { formatearTiempoTranscurrido } from '../../lib/reloj.js';
import type { MiTrabajoTarea } from '@afull/shared';
import { BotonSubirDiseno } from '../disenos/BotonSubirDiseno.js';
import { AccionesMaterial } from '../insumos/AccionesMaterial.js';
import { MuestrasTarea } from '../ots/MuestrasTarea.js';

export function TarjetaTareaActiva({
  tarea,
  segundosActivos,
  cargando,
  onPausar,
  onFinalizar,
}: {
  tarea: MiTrabajoTarea;
  segundosActivos: number;
  cargando: boolean;
  onPausar: () => void;
  onFinalizar: () => void;
}) {
  return (
    <div className="mb-6 p-4 rounded-md border border-[#ea580c] bg-[#ea580c]/5 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-400">{tarea.codigo_ot}</span>
        <Badge variant="default" className="bg-[#ea580c] text-white">EN CURSO</Badge>
      </div>
      <h2 className="text-sm font-bold text-white mb-1">{tarea.ot_titulo}</h2>
      <p className="text-xs text-neutral-300 mb-3">{tarea.descripcion}</p>

      <div className="flex items-center justify-center gap-2 py-4 my-2 rounded bg-[#090a0f] border border-[#1f2937]">
        <Clock className="h-5 w-5 text-[#ea580c] animate-pulse" />
        <span className="font-mono text-2xl font-bold text-white">
          {formatearTiempoTranscurrido(segundosActivos)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Button
          type="button"
          variant="outline"
          disabled={cargando}
          onClick={onPausar}
          className="min-h-[48px] py-3 text-sm font-semibold border-amber-600/60 text-amber-400 hover:bg-amber-950/30"
        >
          <Pause className="h-4 w-4 mr-2" /> Pausar
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={cargando}
          onClick={onFinalizar}
          className="min-h-[48px] py-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar
        </Button>
      </div>
      {tarea.tipo === 'DISENO' ? <BotonSubirDiseno otId={tarea.orden_trabajo_id} /> : <AccionesMaterial tarea={tarea} />}
      {tarea.tipo !== 'DISENO' && <MuestrasTarea tareaId={tarea.id} descripcion={tarea.descripcion} />}
    </div>
  );
}

export function TarjetaTareaAsignada({
  tarea,
  cargando,
  onIniciar,
}: {
  tarea: MiTrabajoTarea;
  cargando: boolean;
  onIniciar: () => void;
}) {
  return (
    <div className="p-3.5 rounded-md border border-[#1f2937] bg-[#111318] hover:border-neutral-700 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-neutral-400">
          {tarea.codigo_ot} · {tarea.cliente_nombre}
        </span>
        <Badge variant={tarea.estado === 'PAUSADA' ? 'warning' : 'neutral'}>
          {tarea.estado}
        </Badge>
      </div>
      <h4 className="text-xs font-semibold text-white mb-1">{tarea.ot_titulo}</h4>
      <p className="text-xs text-neutral-300 mb-3 line-clamp-2">{tarea.descripcion}</p>

      <Button
        type="button"
        variant="primary"
        disabled={cargando}
        onClick={onIniciar}
        className="w-full min-h-[48px] py-3 text-xs font-semibold bg-[#ea580c] hover:bg-[#c2410c] text-white flex items-center justify-center gap-2"
      >
        <Play className="h-4 w-4 fill-white" />
        {tarea.estado === 'PAUSADA' ? 'Reanudar Trabajo' : 'Iniciar Trabajo'}
      </Button>
      {tarea.tipo === 'DISENO' ? <BotonSubirDiseno otId={tarea.orden_trabajo_id} /> : <AccionesMaterial tarea={tarea} />}
    </div>
  );
}
