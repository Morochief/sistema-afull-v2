import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useColaOffline } from '../../hooks/useColaOffline.js';
import { descartarRechazada, sincronizar } from '../../lib/cola-offline.js';
import { formatearFechaHora } from '../../lib/fechas.js';
import { Button } from '../ui/button.js';

/** Aviso de "sin señal", lo que falta mandar y lo que el servidor rechazó al reenviar. */
export function EstadoConexion({ alEnviar }: { alEnviar: () => void }) {
  const { pendientes, rechazadas, enLinea } = useColaOffline();
  if (enLinea && pendientes.length === 0 && rechazadas.length === 0) return null;
  return (
    <section className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs" data-testid="estado-conexion">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-amber-300">
          <CloudOff className="h-4 w-4" />
          {enLinea ? 'Con señal' : 'Sin señal'}
          {pendientes.length > 0 && ` · ${pendientes.length} ${pendientes.length === 1 ? 'acción guardada' : 'acciones guardadas'} para enviar`}
        </span>
        {pendientes.length > 0 && (
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void sincronizar().then((n) => n > 0 && alEnviar())}>
            <RefreshCw className="h-3.5 w-3.5" /> Enviar ahora
          </Button>
        )}
      </div>
      {pendientes.map((p) => <div key={p.id} className="text-neutral-400">· {p.etiqueta} ({formatearFechaHora(p.creada_at)})</div>)}
      {rechazadas.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2 rounded border border-red-900/40 bg-red-950/20 p-2 text-red-300">
          <span>No se pudo registrar «{r.etiqueta}» del {formatearFechaHora(r.creada_at)}: {r.error}. Volvé a cargarlo si corresponde.</span>
          <button type="button" aria-label="Descartar aviso" onClick={() => descartarRechazada(r.id)}><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </section>
  );
}
