import { Clock, User } from 'lucide-react';
import { Badge } from '../ui/badge.js';
import { formatearTiempoTranscurrido } from '../../lib/reloj.js';
import type { LivePersonaItem } from '@afull/shared';

export function TarjetaPersonaLive({
  persona,
  segundosTranscurridos,
}: {
  persona: LivePersonaItem;
  segundosTranscurridos: number;
}) {
  const activo = persona.en_curso && persona.intervalo_abierto;
  const tarea = persona.intervalo_abierto?.tarea;
  const ot = tarea?.orden_trabajo;

  return (
    <div
      className={`rounded-md border p-4 transition-all shadow-md ${
        activo
          ? 'border-[#ea580c] bg-[#ea580c]/5'
          : 'border-[#1f2937] bg-[#111318]'
      }`}
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1f2937]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-sm text-white">{persona.nombre}</span>
        </div>
        <Badge
          variant={activo ? 'default' : 'neutral'}
          className={activo ? 'bg-emerald-600/90 text-white' : ''}
        >
          {activo ? 'EN CURSO' : 'LIBRE'}
        </Badge>
      </div>

      {activo && tarea && ot ? (
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">
              {ot.codigo_ot} · {ot.cliente_nombre}
            </span>
            <div className="flex items-center gap-1 font-mono text-[#ea580c] font-bold">
              <Clock className="h-3 w-3 animate-pulse" />
              <span>{formatearTiempoTranscurrido(segundosTranscurridos)}</span>
            </div>
          </div>
          <h4 className="text-xs font-semibold text-white">
            {ot.titulo}
          </h4>
          <p className="text-xs text-neutral-300 line-clamp-2">
            {tarea.descripcion}
          </p>
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-neutral-500 mb-2">
          Sin actividad en curso
        </div>
      )}

      <div className="pt-2 border-t border-[#1f2937] flex items-center justify-between text-xs">
        <span className="text-neutral-500">Acumulado hoy:</span>
        <span className="font-semibold text-white">{persona.minutos_hoy} min</span>
      </div>
    </div>
  );
}
