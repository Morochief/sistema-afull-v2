import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { TIPOS_CON_MERMA, type MiTrabajoTarea } from '@afull/shared';
import { iniciarTanda } from '../../lib/api-cronometro.js';
import { numero } from '../../lib/numero.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

const ES_MAQUINA = new Set<string>(TIPOS_CON_MERMA);
const esM2 = (u: string | null) => !!u && /^m(2|²)$/i.test(u.trim());

/**
 * Loop 12: una tanda de máquina con piezas de varios clientes. Edu elige sus impresiones (pendientes o pausadas)
 * y los m² de cada una; un solo reloj, y el tiempo se reparte por m² entre las OTs.
 */
export function ModalTanda({ origen, tareas, onCerrar }: { origen: MiTrabajoTarea; tareas: MiTrabajoTarea[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const candidatas = [origen, ...tareas.filter((t) => t.id !== origen.id)]
    .filter((t) => ES_MAQUINA.has(t.tipo) && (t.estado === 'PENDIENTE' || t.estado === 'PAUSADA') && !t.tanda);
  const [m2, setM2] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidatas.map((t) => [t.id, t.cantidad !== null && esM2(t.unidad) ? String(t.cantidad).replace('.', ',') : ''])));
  const [cargando, setCargando] = useState(false);
  const elegidas = candidatas.map((t) => ({ tareaId: t.id, m2Piezas: numero(m2[t.id] ?? '') })).filter((x) => x.m2Piezas > 0);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (elegidas.length < 2) return toast.error('Poné los m² de al menos 2 trabajos de clientes distintos');
    setCargando(true);
    try {
      await iniciarTanda(elegidas);
      toast.success(`Tanda iniciada: el tiempo se reparte entre ${elegidas.length} OTs según sus m².`);
      void qc.invalidateQueries({ queryKey: ['mi-trabajo'] });
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo iniciar la tanda'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Tanda para varios clientes</DialogTitle>
        <DialogDescription>Un solo reloj para toda la tanda: el tiempo de máquina se reparte entre las OTs según los m² de cada una.</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-3 text-xs">
        <Label>m² de piezas de cada trabajo (dejá vacío si no entra en esta tanda)</Label>
        {candidatas.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-neutral-200">{t.codigo_ot} · {t.cliente_nombre}</span>
            <div className="w-24 shrink-0">
              <Input aria-label={`m² ${t.codigo_ot}`} inputMode="decimal" placeholder="m²" value={m2[t.id] ?? ''} onChange={(ev) => setM2({ ...m2, [t.id]: ev.target.value })} />
            </div>
          </div>
        ))}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Volver</Button>
          <Button type="submit" disabled={cargando}>{cargando ? 'Iniciando…' : 'Iniciar tanda'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
