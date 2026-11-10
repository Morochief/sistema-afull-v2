import { toast } from 'sonner';
import { guardarFoto } from '../../lib/fotos-pendientes.js';
import { useFotosPendientes } from '../../hooks/useFotosPendientes.js';
import { BotonFoto } from '../archivos/BotonFoto.js';

/**
 * Evidencia del montaje en una parada (REQ-03). Se pueden sacar varias, antes o después de marcarla hecha.
 * Sin señal quedan en el celular y suben solas; la galería la ve Comercial en la salida.
 */
export function FotoMontaje({ paradaId, codigoOt }: { paradaId: string; codigoOt: string }) {
  const { porSubir } = useFotosPendientes({ paradaId });
  const agregar = async (a: { blob: Blob; mime: string }) => {
    await guardarFoto({ etiqueta: `Foto del montaje ${codigoOt}`, tipo: 'EVIDENCIA_PARADA', ref: { paradaId }, ...a });
    toast.success(navigator.onLine === false ? 'Foto guardada: se sube sola cuando vuelva la señal.' : 'Foto guardada, subiendo…');
  };
  return (
    <div className="flex items-center gap-2">
      <BotonFoto etiqueta="Foto del montaje" onArchivo={agregar} className="h-8 gap-1 text-[11px]" variant="outline" />
      {porSubir.length > 0 && <span className="text-[11px] text-amber-300">{porSubir.length} por subir</span>}
    </div>
  );
}
