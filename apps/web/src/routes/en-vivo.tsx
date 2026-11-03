import { useState, useEffect, useMemo, useRef } from 'react';
import { useLive } from '../hooks/useLive.js';
import { crearSincronizadorReloj } from '../lib/reloj.js';
import { TarjetaPersonaLive } from '../components/live/TarjetaPersonaLive.js';
import { Button } from '../components/ui/button.js';
import { Radio, RefreshCw } from 'lucide-react';

export function EnVivoPage() {
  const { data, isLoading, error, refetch, isFetching } = useLive();

  const horaRecibidoMs = useRef(Date.now());
  useEffect(() => {
    horaRecibidoMs.current = Date.now();
  }, [data?.servidor_ahora]);

  const sincReloj = useMemo(() => {
    if (!data?.servidor_ahora) return null;
    return crearSincronizadorReloj(data.servidor_ahora, horaRecibidoMs.current);
  }, [data?.servidor_ahora]);

  const [segundosPorPersona, setSegundosPorPersona] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!data?.personas || !sincReloj) return;

    const actualizarSegundos = () => {
      const mapa: Record<string, number> = {};
      for (const p of data.personas) {
        if (p.en_curso && p.intervalo_abierto?.hora_inicio) {
          mapa[p.persona_id] = sincReloj.segundosTranscurridos(p.intervalo_abierto.hora_inicio);
        }
      }
      setSegundosPorPersona(mapa);
    };

    actualizarSegundos();
    const interval = setInterval(actualizarSegundos, 1000);
    return () => clearInterval(interval);
  }, [data?.personas, sincReloj]);

  if (isLoading) {
    return (
      <div className="text-center py-20 text-xs text-neutral-400">
        Cargando estado del taller y cuadrillas en vivo...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-xs text-red-400 mb-3">{error instanceof Error ? error.message : 'Error'}</p>
        <Button onClick={() => void refetch()} className="min-h-[48px] px-6">
          Reintentar
        </Button>
      </div>
    );
  }

  const personas = data?.personas || [];
  const enCursoCount = personas.filter((p) => p.en_curso).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f2937] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Control en Vivo</h1>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Seguimiento de operarios y cuadrillas en tiempo real (sondeo cada 30 s + broadcast).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1f2937] bg-[#111318] text-xs">
            <Radio className="h-3.5 w-3.5 text-[#ea580c]" />
            <span className="text-neutral-300">
              <strong className="text-white">{enCursoCount}</strong> de {personas.length} activos
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="h-8 gap-1.5 text-xs border-[#1f2937]"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      {personas.length === 0 ? (
        <div className="text-center py-16 rounded-md border border-dashed border-[#1f2937] text-neutral-500 text-xs">
          No hay operarios activos con perfil de taller o montaje asignable.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((persona) => (
            <TarjetaPersonaLive
              key={persona.persona_id}
              persona={persona}
              segundosTranscurridos={segundosPorPersona[persona.persona_id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
