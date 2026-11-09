import { toast } from 'sonner';
import type { TipoArchivo } from '@afull/shared';
import type { RefArchivo } from '../../lib/api-archivos.js';
import { guardarFoto } from '../../lib/fotos-pendientes.js';
import { useFotosPendientes } from '../../hooks/useFotosPendientes.js';
import { BotonFoto } from './BotonFoto.js';
import { GaleriaArchivos } from './GaleriaArchivos.js';

type Props = {
  titulo: string;
  tipo: TipoArchivo;
  refArchivo: RefArchivo;
  /** Para la lista de pendientes ("Evidencia OT-2026-0012"). */
  etiqueta: string;
  boton?: string;
  puedeSubir?: boolean;
  permitirPdf?: boolean;
  vacio?: string;
};

/** Lo subido + botón para agregar. Lo nuevo pasa por la cola de fotos: si no hay señal, queda en el celular y sube solo. */
export function SeccionArchivos({ titulo, tipo, refArchivo, etiqueta, boton = 'Agregar foto', puedeSubir = true, permitirPdf, vacio }: Props) {
  const { porSubir } = useFotosPendientes(refArchivo);
  const agregar = async (a: { blob: Blob; mime: string }) => {
    await guardarFoto({ etiqueta, tipo, ref: refArchivo, ...a });
    toast.success(navigator.onLine === false ? 'Guardada en el celular: se sube sola cuando vuelva la señal.' : 'Subiendo…');
  };
  return (
    <div className="space-y-2" data-testid={`archivos-${tipo.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-300">{titulo}</span>
        {puedeSubir && <BotonFoto etiqueta={boton} permitirPdf={permitirPdf} onArchivo={agregar} />}
      </div>
      {porSubir.length > 0 && (
        <p className="text-xs text-amber-300">{porSubir.length === 1 ? '1 foto guardada en este celular, por subir.' : `${porSubir.length} fotos guardadas en este celular, por subir.`}</p>
      )}
      <GaleriaArchivos refArchivo={refArchivo} vacio={vacio} />
    </div>
  );
}
