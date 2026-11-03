import { useState, useEffect } from 'react';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { obtenerPersonasAsignables } from '../../lib/api-personas.js';
import { Plus, Trash2 } from 'lucide-react';
import { TIPOS_TAREA, type TipoTarea, type PersonaAsignable } from '@afull/shared';

export type TareaFormItem = {
  tipo: TipoTarea;
  descripcion: string;
  personaAsignadaId?: string;
};

type Props = {
  tareas: TareaFormItem[];
  onChange: (tareas: TareaFormItem[]) => void;
};

const ETIQUETAS_TIPO: Record<TipoTarea, string> = {
  DISENO: 'Diseño',
  TALLER_IMPRESION: 'Impresión',
  TALLER_CORTE: 'Corte',
  TALLER_HERRERIA: 'Herrería',
  TALLER_ARMADO: 'Armado',
  MONTAJE_CALLE: 'Montaje en Calle',
  OTRO: 'Otro',
};

export function SelectorTareasOT({ tareas, onChange }: Props) {
  const [asignables, setAsignables] = useState<PersonaAsignable[]>([]);

  useEffect(() => {
    obtenerPersonasAsignables()
      .then(setAsignables)
      .catch(() => setAsignables([]));
  }, []);

  const agregarTarea = () => {
    if (tareas.length >= 30) return;
    onChange([
      ...tareas,
      {
        tipo: 'TALLER_ARMADO',
        descripcion: '',
        personaAsignadaId: undefined,
      },
    ]);
  };

  const quitarTarea = (idx: number) => {
    onChange(tareas.filter((_, i) => i !== idx));
  };

  const actualizarTarea = (idx: number, campo: keyof TareaFormItem, valor: unknown) => {
    const copia = [...tareas];
    copia[idx] = { ...copia[idx], [campo]: valor };
    onChange(copia);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-[#1f2937]">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          Tareas Iniciales ({tareas.length}/30)
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={agregarTarea}
          disabled={tareas.length >= 30}
          className="h-7 text-xs gap-1 border-[#1f2937]"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar Tarea
        </Button>
      </div>

      {tareas.length === 0 ? (
        <p className="text-xs text-neutral-500 italic py-1">
          Sin tareas iniciales. Podés agregarlas ahora o definirlas más adelante.
        </p>
      ) : (
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {tareas.map((t, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-md border border-[#1f2937] bg-[#090a0f] space-y-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <select
                  value={t.tipo}
                  onChange={(e) => actualizarTarea(idx, 'tipo', e.target.value as TipoTarea)}
                  className="flex-1 h-8 rounded border border-[#1f2937] bg-[#111318] px-2 text-xs text-white"
                >
                  {TIPOS_TAREA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {ETIQUETAS_TIPO[tipo]}
                    </option>
                  ))}
                </select>

                <select
                  value={t.personaAsignadaId || ''}
                  onChange={(e) =>
                    actualizarTarea(idx, 'personaAsignadaId', e.target.value || undefined)
                  }
                  className="flex-1 h-8 rounded border border-[#1f2937] bg-[#111318] px-2 text-xs text-white"
                >
                  <option value="">Sin operario asignado</option>
                  {asignables.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => quitarTarea(idx)}
                  className="h-8 w-8 p-0 text-neutral-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Input
                value={t.descripcion}
                onChange={(e) => actualizarTarea(idx, 'descripcion', e.target.value)}
                placeholder="Descripción de la tarea (obligatoria)..."
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
