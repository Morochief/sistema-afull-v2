import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { NOMBRE_PERIODO, cuandoTermino, duracionLarga, obtenerTerminadas, rangoPeriodo, type Periodo } from '../../lib/api-terminadas.js';
import { mensajeDeError, type ErrorApi } from '../../lib/api.js';

const VERBO: Record<Periodo, string> = { semana: 'Esta semana trabajaste', semana_pasada: 'La semana pasada trabajaste', mes: 'Este mes trabajaste' };
const cantidadTexto = (c: number | null, u: string | null) => (c == null ? null : `${String(c).replace('.', ',')}${u ? ` ${u}` : ''}`);

/** Loop 15: Mi trabajo → Terminadas. Lo que hizo, cuándo y cuánto le llevó (sin montos). */
export function TerminadasMiTrabajo() {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [pagina, setPagina] = useState(1);
  const { desde, hasta } = rangoPeriodo(periodo);
  const { data, isLoading, error } = useQuery({
    queryKey: ['mi-trabajo', 'terminadas', desde, hasta, pagina],
    queryFn: () => obtenerTerminadas(desde, hasta, pagina),
    refetchOnMount: 'always', // al volver a la pestaña, recién terminó algo: no mostrar lo de hace un rato
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="group" aria-label="Período">
        {(Object.keys(NOMBRE_PERIODO) as Periodo[]).map((p) => (
          <button key={p} type="button" aria-pressed={periodo === p} onClick={() => { setPeriodo(p); setPagina(1); }}
            className={`h-8 rounded px-3 text-xs font-semibold ${periodo === p ? 'bg-[#ea580c] text-white' : 'border border-[#1f2937] text-neutral-300'}`}>
            {NOMBRE_PERIODO[p]}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-xs text-neutral-500">Cargando…</p>}
      {error && <p className="text-xs text-red-400">{mensajeDeError(error as ErrorApi, 'No se pudo cargar lo terminado')}</p>}
      {data && (
        <>
          <p className="rounded border border-[#1f2937] bg-[#111318] p-3 text-sm text-white" data-testid="horas-periodo">
            {VERBO[periodo]} <strong>{duracionLarga(data.horas_periodo_segundos)}</strong>
          </p>
          {data.items.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500">No terminaste tareas en este período.</p>
          ) : (
            <ul className="space-y-2">
              {data.items.map((t) => (
                <li key={t.tarea_id} className="rounded border border-[#1f2937] bg-[#111318] p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-white"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#22c55e]" />{t.descripcion}</span>
                    <span className="shrink-0 font-mono text-neutral-200">{duracionLarga(t.segundos)}</span>
                  </div>
                  <p className="mt-1 text-neutral-500"><span className="text-[#ea580c]">{t.ot_codigo}</span> · {t.cliente_nombre}</p>
                  <p className="text-neutral-500">
                    Terminada {cuandoTermino(t.terminada_at)}{cantidadTexto(t.cantidad, t.unidad) ? ` · ${cantidadTexto(t.cantidad, t.unidad)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {data.totalPaginas > 1 && (
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="rounded border border-[#1f2937] px-3 py-1.5 disabled:opacity-40">Anteriores</button>
              <span>Página {pagina} de {data.totalPaginas}</span>
              <button type="button" disabled={pagina >= data.totalPaginas} onClick={() => setPagina(pagina + 1)} className="rounded border border-[#1f2937] px-3 py-1.5 disabled:opacity-40">Siguientes</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
