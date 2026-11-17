import { useEffect, useMemo, useState } from 'react';
import { usePanel } from '../hooks/usePanel.js';
import { crearSincronizadorReloj } from '../lib/reloj.js';
import { TarjetaPausa, TarjetaSinTarea, TarjetaTrabajando } from '../components/panel/TarjetaPanel.js';
import { ModalAsignarPanel } from '../components/panel/ModalAsignarPanel.js';

type Persona = { persona_id: string; nombre: string };

function Columna({ titulo, cantidad, vacio, children }: { titulo: string; cantidad: number; vacio: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-[#1f2937] bg-[#0d0f14] p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{titulo} ({cantidad})</h2>
      {cantidad === 0 ? <p className="py-3 text-center text-xs text-neutral-500">{vacio}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

/** Loop 14: panel de Gerardo. Quién vino y en qué está, y darle una tarea en el momento. */
export function PanelPage() {
  const { data, isLoading, error } = usePanel();
  const [asignar, setAsignar] = useState<Persona | null>(null);
  const [, setTic] = useState(0);
  const reloj = useMemo(() => (data ? crearSincronizadorReloj(data.servidor_ahora) : null), [data]);
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-bold text-white">Panel</h1>
        <p className="text-xs text-neutral-400">Quién vino, en qué está y quién no tiene nada en marcha. Se actualiza solo.</p>
      </header>
      {isLoading && <p className="text-xs text-neutral-500">Cargando…</p>}
      {error && <p className="text-xs text-red-400">No se pudo cargar el panel. Reintentando…</p>}
      {data && reloj && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Columna titulo="Sin tarea en marcha" cantidad={data.sin_tarea.length} vacio="Todos los que vinieron están en algo.">
              {data.sin_tarea.map((p) => <TarjetaSinTarea key={p.persona_id} p={p} onAsignar={setAsignar} />)}
            </Columna>
            <Columna titulo="Trabajando" cantidad={data.trabajando.length} vacio="Nadie tiene el reloj en marcha.">
              {data.trabajando.map((p) => (
                <TarjetaTrabajando key={p.persona_id} p={p} segundos={reloj.segundosTranscurridos(p.desde)} onAsignar={setAsignar} />
              ))}
            </Columna>
            <Columna titulo="En pausa" cantidad={data.en_pausa.length} vacio="Nadie en pausa.">
              {data.en_pausa.map((p) => <TarjetaPausa key={p.persona_id} p={p} onAsignar={setAsignar} />)}
            </Columna>
          </div>
          {data.sin_marcar.length > 0 && (
            <section className="text-xs text-neutral-500">
              <h2 className="mb-1 font-semibold uppercase tracking-wider">No marcaron entrada ({data.sin_marcar.length})</h2>
              <ul className="flex flex-wrap gap-2">
                {data.sin_marcar.map((p) => (
                  <li key={p.persona_id}>
                    <button type="button" onClick={() => setAsignar(p)} className="rounded border border-[#1f2937] px-2 py-1 hover:text-neutral-300"
                      aria-label={`Asignar tarea a ${p.nombre}`}>{p.nombre}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <ModalAsignarPanel persona={asignar} onCerrar={() => setAsignar(null)} />
    </div>
  );
}
