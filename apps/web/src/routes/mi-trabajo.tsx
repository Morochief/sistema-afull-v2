import { useState, useEffect, useMemo, useRef } from 'react';
import { useMiTrabajo } from '../hooks/useMiTrabajo.js';
import { useSesion } from '../hooks/useSesion.js';
import { iniciarTarea, pausarTarea, finalizarTarea } from '../lib/api-cronometro.js';
import { crearSincronizadorReloj } from '../lib/reloj.js';
import { ModalPausarTarea } from '../components/modals/ModalPausarTarea.js';
import { ModalFinalizarTarea } from '../components/modals/ModalFinalizarTarea.js';
import { TarjetaTareaActiva, TarjetaTareaAsignada } from '../components/cronometro/TarjetasTrabajo.js';
import { Button } from '../components/ui/button.js';
import { AlertTriangle } from 'lucide-react';
import type { MotivoCierreIntervalo, MiTrabajoTarea } from '@afull/shared';

export function MiTrabajoPage() {
  const { usuario } = useSesion();
  const { data, isLoading, error, refetch, sinPersonaVinculada } = useMiTrabajo();

  const [tareaPausarId, setTareaPausarId] = useState<string | null>(null);
  const [tareaFinalizarId, setTareaFinalizarId] = useState<string | null>(null);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [mensajeAutoPausa, setMensajeAutoPausa] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const clavesRef = useRef<Map<string, string>>(new Map());
  const horaRecibidoMs = useRef(Date.now());

  useEffect(() => {
    horaRecibidoMs.current = Date.now();
  }, [data?.servidor_ahora]);

  const sincReloj = useMemo(() => {
    if (!data?.servidor_ahora) return null;
    return crearSincronizadorReloj(data.servidor_ahora, horaRecibidoMs.current);
  }, [data?.servidor_ahora]);

  const [segundosActivos, setSegundosActivos] = useState(0);

  const tareaEnCurso = useMemo(() => {
    if (!data?.tareas) return null;
    return data.tareas.find((t) => t.estado === 'EN_CURSO') || null;
  }, [data?.tareas]);

  useEffect(() => {
    if (!tareaEnCurso?.intervalo_abierto?.hora_inicio || !sincReloj) {
      setSegundosActivos(0);
      return;
    }
    const tick = () => {
      setSegundosActivos(
        sincReloj.segundosTranscurridos(tareaEnCurso.intervalo_abierto!.hora_inicio)
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tareaEnCurso, sincReloj]);

  const obtenerClaveIdempotencia = (accion: string, id: string) => {
    const k = `${accion}:${id}`;
    if (!clavesRef.current.has(k)) {
      clavesRef.current.set(k, crypto.randomUUID());
    }
    return clavesRef.current.get(k)!;
  };

  const limpiarClave = (accion: string, id: string) => {
    clavesRef.current.delete(`${accion}:${id}`);
  };

  const handleIniciar = async (tarea: MiTrabajoTarea) => {
    setErrorAccion(null);
    setCargandoAccion(true);
    const clave = obtenerClaveIdempotencia('iniciar', tarea.id);
    try {
      const prevEnCurso = tareaEnCurso;
      await iniciarTarea(tarea.id, clave);
      limpiarClave('iniciar', tarea.id);
      if (prevEnCurso && prevEnCurso.id !== tarea.id) {
        setMensajeAutoPausa(`Se pausó automáticamente la tarea «${prevEnCurso.descripcion}»`);
        setTimeout(() => setMensajeAutoPausa(null), 5000);
      }
      await refetch();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'Error al iniciar');
    } finally {
      setCargandoAccion(false);
    }
  };

  const handleConfirmarPausa = async (motivo: MotivoCierreIntervalo) => {
    if (!tareaPausarId) return;
    setErrorAccion(null);
    setCargandoAccion(true);
    const clave = obtenerClaveIdempotencia('pausar', tareaPausarId);
    try {
      await pausarTarea(tareaPausarId, { motivo, claveIdempotencia: clave });
      limpiarClave('pausar', tareaPausarId);
      setTareaPausarId(null);
      await refetch();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'Error al pausar');
    } finally {
      setCargandoAccion(false);
    }
  };

  const handleConfirmarFinalizar = async (comentario?: string) => {
    if (!tareaFinalizarId) return;
    setErrorAccion(null);
    setCargandoAccion(true);
    const clave = obtenerClaveIdempotencia('finalizar', tareaFinalizarId);
    try {
      await finalizarTarea(tareaFinalizarId, { comentario, claveIdempotencia: clave });
      limpiarClave('finalizar', tareaFinalizarId);
      setTareaFinalizarId(null);
      await refetch();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'Error al finalizar');
    } finally {
      setCargandoAccion(false);
    }
  };

  if (sinPersonaVinculada) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 rounded-md border border-amber-800/40 bg-amber-950/20 text-neutral-200 shadow-xl">
        <div className="flex items-center gap-3 text-amber-500 mb-3">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h2 className="text-base font-bold text-white">Usuario sin ficha vinculada</h2>
        </div>
        <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
          Tu usuario <span className="font-semibold text-white">@{usuario?.username}</span> no está
          vinculado a una persona en el sistema.
        </p>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Para registrar tiempos y usar el cronómetro, solicitale a un administrador o al equipo de
          RRHH que vincule tu usuario con tu ficha de colaborador en el panel de Personas.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto p-4 text-center text-xs text-neutral-400 py-16">
        Cargando tus tareas asignadas...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-4 text-center">
        <p className="text-xs text-red-400 mb-3">{error instanceof Error ? error.message : 'Error'}</p>
        <Button onClick={() => void refetch()} className="min-h-[48px] px-6">Reintentar</Button>
      </div>
    );
  }

  const tareasRestantes = (data?.tareas || []).filter((t) => t.estado !== 'EN_CURSO');

  return (
    <div className="max-w-lg mx-auto pb-12">
      <div className="flex items-center justify-between mb-4 border-b border-[#1f2937] pb-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Mi Trabajo</h1>
          <p className="text-xs text-neutral-400">{data?.persona.nombre}</p>
        </div>
        <div className="text-right">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Hoy</span>
          <span className="text-sm font-semibold text-[#ea580c]">{data?.minutos_hoy_total || 0} min</span>
        </div>
      </div>

      {mensajeAutoPausa && (
        <div className="mb-4 p-3 rounded-md border border-[#ea580c]/50 bg-[#ea580c]/10 text-xs text-neutral-200">
          {mensajeAutoPausa}
        </div>
      )}

      {errorAccion && (
        <div className="mb-4 p-3 rounded-md border border-red-800/60 bg-red-950/30 text-xs text-red-300">
          {errorAccion}
        </div>
      )}

      {tareaEnCurso && (
        <TarjetaTareaActiva
          tarea={tareaEnCurso}
          segundosActivos={segundosActivos}
          cargando={cargandoAccion}
          onPausar={() => setTareaPausarId(tareaEnCurso.id)}
          onFinalizar={() => setTareaFinalizarId(tareaEnCurso.id)}
        />
      )}

      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
        Tareas Asignadas ({tareasRestantes.length})
      </h3>

      {tareasRestantes.length === 0 && !tareaEnCurso && (
        <div className="text-center py-12 rounded-md border border-dashed border-[#1f2937] text-neutral-500 text-xs">
          No tenés tareas pendientes ni en curso en este momento.
        </div>
      )}

      <div className="space-y-3">
        {tareasRestantes.map((tarea) => (
          <TarjetaTareaAsignada
            key={tarea.id}
            tarea={tarea}
            cargando={cargandoAccion}
            onIniciar={() => void handleIniciar(tarea)}
          />
        ))}
      </div>

      <ModalPausarTarea
        abierto={Boolean(tareaPausarId)}
        onCerrar={() => setTareaPausarId(null)}
        onConfirmar={handleConfirmarPausa}
        cargando={cargandoAccion}
      />

      <ModalFinalizarTarea
        abierto={Boolean(tareaFinalizarId)}
        onCerrar={() => setTareaFinalizarId(null)}
        onConfirmar={handleConfirmarFinalizar}
        cargando={cargandoAccion}
      />
    </div>
  );
}
