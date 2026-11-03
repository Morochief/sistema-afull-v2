import { useState } from 'react';
import { toast } from 'sonner';
import type { EstadoPresupuesto } from '@afull/shared';
import { accionPresupuesto, type AccionPresupuesto, type ResultadoAprobacion } from '../../lib/api-presupuestos.js';
import { mensajeDeError } from '../../lib/api.js';
import { formatearGs } from '../../lib/formato.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

const TEXTOS: Record<AccionPresupuesto, { titulo: string; desc: string; boton: string; pide?: string; peligro?: boolean }> = {
  enviar: { titulo: 'Enviar presupuesto', desc: 'Se calcula y congela el total. Después ya no se editan ítems: para cambios, nueva versión.', boton: 'Enviar' },
  aprobar: {
    titulo: 'Aprobar presupuesto',
    desc: 'Se generan las OTs (una por sucursal; con 2 o más sucursales, también el proyecto). No se puede deshacer.',
    boton: 'Aprobar y generar OTs',
    pide: 'Evidencia de aprobación (N.º de OC, mail o WhatsApp)',
  },
  rechazar: { titulo: 'Rechazar presupuesto', desc: 'El cliente no aceptó. Podés hacer una nueva versión después.', boton: 'Rechazar', pide: 'Motivo del rechazo', peligro: true },
  anular: { titulo: 'Anular borrador', desc: 'El borrador queda anulado y no se puede usar.', boton: 'Anular', pide: 'Motivo', peligro: true },
  'nueva-version': { titulo: 'Nueva versión', desc: 'Se crea un borrador con los mismos ítems para modificarlo. Si estaba enviado, el actual queda reemplazado.', boton: 'Crear versión' },
};

type Props = {
  accion: AccionPresupuesto | null;
  presupuestoId: string;
  desde: EstadoPresupuesto;
  totalGs: number | null;
  onCerrar: () => void;
  onHecho: (r: { id: string } & Partial<ResultadoAprobacion>) => void;
};

export function ModalAccionPresupuesto({ accion, presupuestoId, desde, totalGs, onCerrar, onHecho }: Props) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  if (!accion) return null;
  const t = TEXTOS[accion];

  const cerrar = () => {
    setComentario('');
    setError(null);
    onCerrar();
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (t.pide && !comentario.trim()) {
      setError('Obligatorio');
      return;
    }
    setCargando(true);
    try {
      const r = await accionPresupuesto(presupuestoId, accion, desde, comentario.trim() || undefined);
      if (accion === 'aprobar') {
        const n = r.ots?.length ?? 0;
        toast.success(r.proyecto ? `Aprobado: proyecto ${r.proyecto.codigo} con ${n} OTs.` : `Aprobado: se generó ${r.ots?.[0]?.codigo_ot ?? 'la OT'}.`);
      } else {
        toast.success(`${t.titulo}: listo.`);
      }
      cerrar();
      onHecho(r);
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo completar la acción'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={cerrar}>
      <DialogHeader>
        <DialogTitle className={t.peligro ? 'text-red-400' : undefined}>{t.titulo}</DialogTitle>
        <DialogDescription>{t.desc}</DialogDescription>
      </DialogHeader>
      <form onSubmit={confirmar} className="space-y-4">
        {totalGs !== null && accion === 'aprobar' && (
          <p className="rounded border border-[#1f2937] bg-[#090a0f] p-2.5 text-xs text-neutral-300">
            Total aprobado: <strong className="text-white">{formatearGs(totalGs)}</strong>
          </p>
        )}
        {t.pide && (
          <div>
            <Label htmlFor="accionComentario">{t.pide} <span className="text-red-400">*</span></Label>
            <Input
              id="accionComentario"
              value={comentario}
              onChange={(e) => {
                setComentario(e.target.value);
                setError(null);
              }}
              error={error ?? undefined}
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando} className={t.peligro ? 'bg-red-600 hover:bg-red-700 text-white' : undefined}>
            {cargando ? 'Procesando...' : t.boton}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
