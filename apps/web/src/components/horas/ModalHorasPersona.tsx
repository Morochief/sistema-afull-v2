import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { duracion, horasDePersona, type TramoHoras } from '../../lib/api-horas.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Badge } from '../ui/badge.js';
import { ModalAjusteHora } from './ModalAjusteHora.js';
import { ModalCargarHoras } from './ModalCargarHoras.js';

const TZ = 'America/Asuncion';
const fecha = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const diaHora = (iso: string) => new Intl.DateTimeFormat('es-PY', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat('es-PY', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Loop 13: las horas de una persona (Juan, Gerardo y Sofi, desde Personas). Por defecto los últimos 7 días.
 * Cada tramo: cuándo, cuánto, en qué OT; lo corregido y lo cargado a mano con quién y por qué.
 */
export function ModalHorasPersona({ persona, onCerrar }: { persona: { id: string; nombre: string }; onCerrar: () => void }) {
  const [desde, setDesde] = useState(() => fecha(new Date(Date.now() - 6 * 86_400_000)));
  const [hasta, setHasta] = useState(() => fecha(new Date()));
  const [pagina, setPagina] = useState(1);
  const [ajuste, setAjuste] = useState<TramoHoras | null>(null);
  const [cargar, setCargar] = useState(false);
  const { data } = useQuery({ queryKey: ['horas', persona.id, desde, hasta, pagina], queryFn: () => horasDePersona(persona.id, desde, hasta, pagina) });
  const paginas = Math.max(1, Math.ceil((data?.total ?? 0) / 25));

  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Horas de {persona.nombre}</DialogTitle>
        <DialogDescription>Cada tramo del reloj. Si alguien se olvidó de pausar o trabajó sin celular, se corrige acá con el motivo.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="horasDesde">Desde</Label><Input id="horasDesde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} /></div>
          <div><Label htmlFor="horasHasta">Hasta</Label><Input id="horasHasta" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} /></div>
          <Button type="button" size="sm" className="ml-auto gap-1" onClick={() => setCargar(true)}><Plus className="h-3.5 w-3.5" /> Cargar horas a mano</Button>
        </div>
        {data && <p className="font-semibold text-neutral-200">Total del período: {duracion(data.segundos_periodo)}</p>}
        {data?.items.length === 0 && <p className="py-4 text-center text-neutral-500">No hay horas en esas fechas.</p>}
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {data?.items.map((t) => (
            <li key={t.id} className="rounded border border-[#1f2937] p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-neutral-200">{diaHora(t.hora_inicio)} → {t.hora_fin ? hora(t.hora_fin) : 'sigue corriendo'}</span>
                <span className="font-mono text-[#ea580c]">{duracion(t.segundos)}</span>
                {t.abierto && <Badge variant="warning">Reloj abierto</Badge>}
                {t.origen === 'MANUAL' && <Badge variant="neutral">A mano</Badge>}
                {t.en_tanda && <Badge variant="neutral">Tanda</Badge>}
              </div>
              <p className="text-neutral-400">{t.ot_codigo} · {t.cliente} · {t.tarea}</p>
              {t.motivo_correccion && (
                <p className="text-amber-300">Corregido por {t.corregido_por}: {t.motivo_correccion}{t.hora_fin_original && t.hora_fin !== t.hora_fin_original ? ` (antes ${hora(t.hora_fin_original)})` : ''}</p>
              )}
              {t.origen === 'MANUAL' && <p className="text-neutral-400">A mano ({t.cargado_por}): {t.motivo_manual}</p>}
              <div className="mt-1 flex gap-2">
                {t.abierto && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAjuste(t)}>Cerrar con hora</Button>}
                {!t.abierto && !t.motivo_correccion && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAjuste(t)}>Corregir fin</Button>}
              </div>
            </li>
          ))}
        </ul>
        {paginas > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
            <span>{pagina} / {paginas}</span>
            <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
          </div>
        )}
      </div>
      {ajuste && <ModalAjusteHora tramo={ajuste} onCerrar={() => setAjuste(null)} />}
      {cargar && <ModalCargarHoras persona={persona} onCerrar={() => setCargar(false)} />}
    </Dialog>
  );
}
