import { ImageUp, RotateCcw, X } from 'lucide-react';
import { useFotosPendientes } from '../../hooks/useFotosPendientes.js';
import { descartarFoto, reintentarFoto, sincronizarFotos } from '../../lib/fotos-pendientes.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';

/** Fotos guardadas en este celular: cuántas faltan subir y cuáles rechazó el servidor (se pueden reintentar o descartar). */
export function FotosPorSubir() {
  const { porSubir, conError } = useFotosPendientes();
  if (porSubir.length === 0 && conError.length === 0) return null;
  return (
    <section className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs" data-testid="fotos-por-subir">
      {porSubir.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-amber-300">
            <ImageUp className="h-4 w-4" />
            {porSubir.length === 1 ? '1 foto guardada en el celular, por subir' : `${porSubir.length} fotos guardadas en el celular, por subir`}
          </span>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void sincronizarFotos()}>Subir ahora</Button>
        </div>
      )}
      {porSubir.map((f) => <div key={f.id} className="text-neutral-400">· {f.etiqueta} ({formatearFechaHora(f.tomada_at)})</div>)}
      {conError.map((f) => (
        <div key={f.id} className="flex items-start justify-between gap-2 rounded border border-red-900/40 bg-red-950/20 p-2 text-red-300">
          <span>No se pudo subir «{f.etiqueta}» del {formatearFechaHora(f.tomada_at)}: {f.error}</span>
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label="Reintentar foto" onClick={() => void reintentarFoto(f.id)}><RotateCcw className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Descartar foto" onClick={() => void descartarFoto(f.id)}><X className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      ))}
    </section>
  );
}
