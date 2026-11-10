import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerProyectos } from '../../lib/api-presupuestos.js';
import { agregarProyectoHoja, type ResultadoProyectoHoja } from '../../lib/api-campo.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../ui/button.js';

const selectCls = 'h-9 min-w-0 flex-1 rounded-md border border-[#1f2937] bg-[#111318] px-2 text-sm text-neutral-100';

/** Mensaje para la persona: cuántas paradas entraron y cuáles se saltearon y por qué. */
export function resumenAgregado(r: ResultadoProyectoHoja) {
  const partes = [`Se ${r.agregadas.length === 1 ? 'agregó 1 parada' : `agregaron ${r.agregadas.length} paradas`}.`];
  const cerradas = r.salteadas.filter((s) => s.motivo === 'cerrada').map((s) => s.codigo_ot);
  const yaEstan = r.salteadas.filter((s) => s.motivo === 'ya_esta').map((s) => s.codigo_ot);
  if (yaEstan.length) partes.push(`Ya estaban: ${yaEstan.join(', ')}.`);
  if (cerradas.length) partes.push(`Cerradas, no se agregan: ${cerradas.join(', ')}.`);
  return partes.join(' ');
}

/** Agregar todas las OTs abiertas de un proyecto a la hoja, de una vez (docs/LOOP_4_DISENO.md §8). */
export function AgregarProyecto({ hojaId, motivoExtra, onAgregado }: { hojaId: string; motivoExtra?: string; onAgregado: () => void }) {
  const [proyectoId, setProyectoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { data } = useQuery({ queryKey: ['proyectos-abiertos-hoja'], queryFn: () => obtenerProyectos({ estado: 'ABIERTO', pagina: 1 }) });
  const proyectos = data?.items ?? [];
  if (!proyectos.length) return null;

  const agregar = async () => {
    setEnviando(true);
    try {
      toast.success(resumenAgregado(await agregarProyectoHoja(hojaId, { proyectoId, motivoExtra: motivoExtra?.trim() || undefined })));
      setProyectoId('');
      onAgregado();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo agregar el proyecto'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Proyecto" className={selectCls} value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
        <option value="">Agregar proyecto completo…</option>
        {proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.cliente_nombre ? ` · ${p.cliente_nombre}` : ''}</option>)}
      </select>
      <Button type="button" size="sm" disabled={!proyectoId || enviando} onClick={() => void agregar()}>Agregar proyecto</Button>
    </div>
  );
}
