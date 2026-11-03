import type { AreaProceso, Proceso } from '@afull/shared';
import { AREAS, useProcesos } from './procesos.js';

/** <option>s agrupadas por área, solo procesos activos (más el actual, si quedó desactivado). */
export function OpcionesProceso({ actual }: { actual?: string }) {
  const { data = [] } = useProcesos();
  const visibles = data.filter((p) => p.activo || p.codigo === actual);
  const porArea = new Map<AreaProceso, Proceso[]>();
  for (const p of visibles) porArea.set(p.area, [...(porArea.get(p.area) ?? []), p]);
  if (visibles.length === 0) return <option value={actual ?? ''}>{actual ?? 'Cargando procesos…'}</option>;
  return (
    <>
      {[...porArea.entries()].map(([area, lista]) => (
        <optgroup key={area} label={AREAS[area]}>
          {lista.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </optgroup>
      ))}
    </>
  );
}
