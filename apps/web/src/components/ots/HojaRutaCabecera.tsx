import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Send, Play, Lock, Unlock, Plus } from 'lucide-react';
import { accionHojaOT, notasHojaOT, whatsappHojaOT, type EstadoHoja } from '../../lib/api-tareas.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { ModalWhatsappHoja } from './ModalWhatsappHoja.js';

const BADGE: Record<EstadoHoja, { texto: string; variant: 'warning' | 'success' | 'neutral' }> = {
  BORRADOR: { texto: 'Borrador · los operarios todavía no la ven', variant: 'warning' },
  ACTIVA: { texto: 'Activa', variant: 'success' },
  CERRADA: { texto: 'Cerrada', variant: 'neutral' },
};

type Props = { otId: string; estado: EstadoHoja; notas: string | null; editable: boolean; cantidad: number; onCambio: () => void; onAgregar: () => void };

/** Estado de la hoja de ruta, sus acciones (activar, WhatsApp, cerrar, reabrir) y las notas para el equipo. */
export function HojaRutaCabecera({ otId, estado, notas, editable, cantidad, onCambio, onAgregar }: Props) {
  const [texto, setTexto] = useState(notas ?? '');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setTexto(notas ?? ''), [notas]);

  const hacer = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      onCambio();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  };
  const whatsapp = () => hacer(async () => setMensaje((await whatsappHojaOT(otId)).mensaje));
  const b = BADGE[estado];

  return (
    <div className="space-y-3 border-b border-[#1f2937] pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Hoja de ruta ({cantidad})</h2>
          <Badge variant={b.variant} data-testid="estado-hoja">{b.texto}</Badge>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {estado !== 'CERRADA' && <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onAgregar}><Plus className="h-3.5 w-3.5" /> Agregar Tarea</Button>}
            {estado === 'BORRADOR' && <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={() => void hacer(() => accionHojaOT(otId, 'ACTIVAR', estado), 'Hoja activada: los operarios ya ven sus tareas.')}><Play className="h-3.5 w-3.5" /> Activar</Button>}
            {estado !== 'CERRADA' && <Button size="sm" variant="outline" className="h-7 gap-1.5 border-emerald-700 text-xs text-emerald-300" disabled={ocupado || cantidad === 0} onClick={() => void whatsapp()}><Send className="h-3.5 w-3.5" /> Enviar por WhatsApp</Button>}
            {estado === 'ACTIVA' && <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={() => void hacer(() => accionHojaOT(otId, 'CERRAR', estado), 'Hoja cerrada.')}><Lock className="h-3.5 w-3.5" /> Cerrar</Button>}
            {estado === 'CERRADA' && <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={() => void hacer(() => accionHojaOT(otId, 'REABRIR', estado), 'Hoja reabierta.')}><Unlock className="h-3.5 w-3.5" /> Reabrir</Button>}
          </div>
        )}
      </div>
      {editable && estado !== 'CERRADA' ? (
        <div className="flex gap-2">
          <textarea aria-label="Notas para el equipo" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000}
            placeholder="Notas para el equipo: dirección, contacto en el local, horario, por dónde entrar…"
            className="flex-1 rounded-md border border-[#1f2937] bg-[#161922] px-3 py-2 text-xs text-neutral-200" />
          {texto !== (notas ?? '') && <Button size="sm" className="h-8 self-end text-xs" disabled={ocupado} onClick={() => void hacer(() => notasHojaOT(otId, texto), 'Notas guardadas.')}>Guardar</Button>}
        </div>
      ) : notas ? <p className="whitespace-pre-wrap text-xs text-neutral-300">{notas}</p> : null}
      <ModalWhatsappHoja mensaje={mensaje} onCerrar={() => setMensaje(null)} />
    </div>
  );
}
