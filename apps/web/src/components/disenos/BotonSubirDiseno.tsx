import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Upload } from 'lucide-react';
import type { MiTrabajoTarea } from '@afull/shared';
import { verificarDiseno } from '../../lib/api-disenos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../ui/button.js';
import { ModalSubirDiseno } from './ModalSubirDiseno.js';
import { ESTADO_DISENO } from './etiquetas.js';

/**
 * En "Mi trabajo", para tareas de diseño: la diseñadora carga el enlace de Drive sin salir de su pantalla,
 * ve en qué quedó su última versión, la marca como verificada o sube una corregida (Loop 19).
 */
export function BotonSubirDiseno({ tarea }: { tarea: MiTrabajoTarea }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const u = tarea.ultimo_diseno ?? null;
  const verificar = async () => {
    if (!u) return;
    setCargando(true);
    try {
      await verificarDiseno(u.id);
      toast.success(`Diseño v${u.version} verificado: Edu ya lo ve en Diseños.`);
      void qc.invalidateQueries({ queryKey: ['mi-trabajo'] });
      void qc.invalidateQueries({ queryKey: ['disenos'] });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo verificar'));
    } finally {
      setCargando(false);
    }
  };
  const estado = u ? (u.estado === 'APROBADO' && u.autoverificada ? 'Verificado por vos' : ESTADO_DISENO[u.estado].texto) : null;
  return (
    <>
      {u && (
        <div className="mt-2 rounded border border-[#1f2937] px-2.5 py-1.5 text-[11px]">
          <p className="text-neutral-200">{`v${u.version} · ${estado}`}</p>
          {u.estado === 'OBSERVADO' && u.observacion && <p className="text-red-400">Observado: {u.observacion}</p>}
        </div>
      )}
      {u?.estado === 'PENDIENTE' && (
        <Button size="sm" className="mt-2 h-8 w-full gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-500" disabled={cargando} onClick={() => void verificar()}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como verificado
        </Button>
      )}
      <Button size="sm" variant="outline" className="mt-2 h-8 w-full gap-1.5 text-xs" onClick={() => setAbierto(true)}>
        <Upload className="h-3.5 w-3.5" /> {u ? 'Subir versión corregida' : 'Cargar enlace del diseño'}
      </Button>
      {abierto && <ModalSubirDiseno otId={tarea.orden_trabajo_id} puedeElegirOrigen={false} reemplaza={!!u} onCerrar={() => { setAbierto(false); void qc.invalidateQueries({ queryKey: ['mi-trabajo'] }); }} />}
    </>
  );
}
