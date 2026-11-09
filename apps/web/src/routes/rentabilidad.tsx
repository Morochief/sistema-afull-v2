import { useNavigate } from '@tanstack/react-router';
import { useListadoUrl } from '../hooks/useListadoUrl.js';
import { listarRentabilidad, type PaginaRentabilidad, type RentabilidadFila } from '../lib/api-costeo.js';
import { claseMargen, textoMargen } from '../lib/margen.js';
import { TablaAdmin } from '../components/tabla/TablaAdmin.js';
import type { Columna } from '../components/tabla/tipos.js';
import { Badge } from '../components/ui/badge.js';
import { formatearDia } from '../lib/fechas.js';
import { formatearGs } from '../lib/formato.js';

const gs = (v: number | null) => <span className="font-mono text-xs text-neutral-200">{formatearGs(v)}</span>;

/** Rentabilidad: OTs cerradas con su costo real congelado contra lo vendido (solo admin y comercial). */
export function RentabilidadPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<RentabilidadFila, PaginaRentabilidad>('/rentabilidad', 'rentabilidad', listarRentabilidad);
  const r = datos?.resumen;

  const columnas: Columna<RentabilidadFila>[] = [
    { id: 'ot', encabezado: 'OT', ancho: 'w-36', celda: (f) => <span className="font-mono font-semibold text-[#ea580c]">{f.codigo_ot}</span> },
    {
      id: 'trabajo', encabezado: 'Trabajo',
      celda: (f) => <div><div className="font-medium text-white">{f.titulo}</div><div className="text-[11px] text-neutral-400">{f.cliente_nombre}</div></div>,
    },
    { id: 'venta', encabezado: 'Venta', alinear: 'der', ancho: 'w-32', celda: (f) => gs(f.monto_presupuestado_gs) },
    {
      id: 'costo', encabezado: 'Costo real', alinear: 'der', ancho: 'w-32',
      celda: (f) => (
        <div title={`Mano de obra ${formatearGs(f.mano_obra_gs)} · Material ${formatearGs(f.material_gs)} · Vehículo ${formatearGs(f.km_gs)}`}>{gs(f.total_gs)}</div>
      ),
    },
    { id: 'margen', encabezado: 'Margen', alinear: 'der', ancho: 'w-24', celda: (f) => <span className={`font-mono text-xs font-semibold ${claseMargen(f.margen_pct)}`}>{textoMargen(f.margen_pct)}</span> },
    {
      id: 'estado', encabezado: 'Cierre', ancho: 'w-28',
      celda: (f) => <Badge variant={f.estado_final === 'TERMINADO' ? 'success' : 'danger'}>{f.estado_final === 'TERMINADO' ? 'Terminada' : 'Cancelada'}</Badge>,
    },
    { id: 'fecha', encabezado: 'Cerrada', ancho: 'w-28', celda: (f) => <span className="font-mono text-xs text-neutral-400">{formatearDia(f.cerrado_at)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Rentabilidad</h1>
        <p className="text-xs text-neutral-400">OTs cerradas: costo real (mano de obra + material + vehículo) contra lo vendido sin IVA. El costo se congela al cerrar la OT.</p>
      </div>
      {r && (
        <div className="grid grid-cols-3 gap-2 text-xs" data-testid="resumen-rentabilidad">
          <div className="rounded border border-[#1f2937] bg-[#111318] p-3"><div className="text-neutral-500">Vendido</div><div className="font-mono text-white">{formatearGs(r.venta_gs)}</div></div>
          <div className="rounded border border-[#1f2937] bg-[#111318] p-3"><div className="text-neutral-500">Costo real</div><div className="font-mono text-white">{formatearGs(r.costo_gs)}</div>{(r.costo_sin_venta_gs ?? 0) > 0 && <div className="mt-1 text-[11px] text-amber-400" title="OTs cerradas sin monto presupuestado: no entran en el margen">+ {formatearGs(r.costo_sin_venta_gs ?? 0)} en OTs sin presupuesto</div>}</div>
          <div className="rounded border border-[#1f2937] bg-[#111318] p-3"><div className="text-neutral-500">Margen real</div><div className={`font-mono font-semibold ${claseMargen(r.margen_pct)}`}>{textoMargen(r.margen_pct)}</div></div>
        </div>
      )}
      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todas' }, { valor: 'TERMINADO', etiqueta: 'Terminadas' }, { valor: 'CANCELADO', etiqueta: 'Canceladas' }]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por OT, trabajo o cliente..."
        onFilaClick={(f) => navigate({ to: '/ots/$id', params: { id: f.id } })}
        vacio={{ titulo: 'Sin OTs cerradas', descripcion: 'El costo real aparece acá cuando una OT se termina o se cancela.' }}
        onReintentar={reintentar}
      />
    </div>
  );
}
