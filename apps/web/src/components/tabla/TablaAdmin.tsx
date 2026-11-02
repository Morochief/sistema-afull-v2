import { Loader2 } from 'lucide-react';
import type { TablaAdminProps } from './tipos.js';
import { BarraFiltros } from './BarraFiltros.js';
import { Paginador } from './Paginador.js';
import { EsqueletoTabla, ErrorTabla, VacioTabla } from './EstadoTabla.js';
import { cn } from '../../lib/utils.js';

export function TablaAdmin<T>({
  columnas,
  datos,
  estado,
  filtros,
  onFiltros,
  opcionesEstado,
  claveFila,
  onFilaClick,
  acciones,
  textoBusqueda,
  vacio,
  onReintentar,
}: TablaAdminProps<T>) {
  const { cargando, refrescando, error } = estado;
  const items = datos?.items || [];
  const total = datos?.total || 0;
  const tamPagina = datos?.tamPagina || 25;
  const totalPaginas = datos?.totalPaginas || 1;

  const handleLimpiarFiltros = () => {
    onFiltros({
      q: undefined,
      estado: 'todos',
      desde: undefined,
      hasta: undefined,
      pagina: 1,
    });
  };

  const handleCambiarPagina = (nuevaPagina: number) => {
    onFiltros({ pagina: nuevaPagina });
  };

  return (
    <div className="space-y-3">
      <BarraFiltros
        filtros={filtros}
        onFiltros={onFiltros}
        opcionesEstado={opcionesEstado}
        textoBusqueda={textoBusqueda}
        acciones={acciones}
      />

      {error ? (
        <ErrorTabla error={error} onReintentar={onReintentar} />
      ) : (
        <div className="relative rounded-md border border-[#1f2937] bg-[#111318] shadow-sm overflow-hidden">
          {refrescando && (
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded bg-[#161922]/90 border border-[#1f2937] px-2 py-1 text-[11px] text-neutral-300 shadow">
              <Loader2 className="h-3 w-3 animate-spin text-[#ea580c]" />
              <span>Actualizando...</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#161922] text-neutral-400 border-b border-[#1f2937] sticky top-0 z-10">
                <tr>
                  {columnas.map((col) => (
                    <th
                      key={col.id}
                      scope="col"
                      className={cn(
                        'px-3.5 py-2.5 font-semibold text-neutral-300 tracking-wider',
                        col.ancho,
                        col.alinear === 'der' ? 'text-right' : 'text-left'
                      )}
                    >
                      {col.encabezado}
                    </th>
                  ))}
                </tr>
              </thead>

              {cargando && !datos ? (
                <EsqueletoTabla columnasCount={columnas.length} />
              ) : items.length > 0 ? (
                <tbody
                  className={cn(
                    'divide-y divide-[#1f2937] transition-opacity duration-150',
                    refrescando && 'opacity-60 pointer-events-none'
                  )}
                >
                  {items.map((fila) => {
                    const clave = claveFila(fila);
                    const esClicable = Boolean(onFilaClick);

                    return (
                      <tr
                        key={clave}
                        onClick={esClicable ? () => onFilaClick?.(fila) : undefined}
                        onKeyDown={
                          esClicable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onFilaClick?.(fila);
                                }
                              }
                            : undefined
                        }
                        tabIndex={esClicable ? 0 : undefined}
                        className={cn(
                          'transition-colors hover:bg-[#161922]/60 focus-visible:bg-[#161922] focus-visible:outline-none',
                          esClicable && 'cursor-pointer'
                        )}
                      >
                        {columnas.map((col) => (
                          <td
                            key={col.id}
                            className={cn(
                              'px-3.5 py-2.5 text-neutral-200',
                              col.alinear === 'der' ? 'text-right' : 'text-left'
                            )}
                          >
                            {col.celda(fila)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ) : null}
            </table>
          </div>

          {!cargando && items.length === 0 && (
            <VacioTabla
              filtros={filtros}
              vacio={vacio}
              onLimpiarFiltros={handleLimpiarFiltros}
            />
          )}

          {datos && (
            <Paginador
              pagina={datos.pagina}
              total={total}
              tamPagina={tamPagina}
              totalPaginas={totalPaginas}
              tieneItems={items.length > 0}
              onCambiarPagina={handleCambiarPagina}
            />
          )}
        </div>
      )}
    </div>
  );
}
