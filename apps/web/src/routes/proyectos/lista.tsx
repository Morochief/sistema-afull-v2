import { useNavigate } from '@tanstack/react-router';
import { ESTADOS_PROYECTO, type ProyectoFila } from '@afull/shared';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { obtenerProyectos } from '../../lib/api-presupuestos.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Badge } from '../../components/ui/badge.js';
import { formatearDia } from '../../lib/fechas.js';
import { ESTADO_PROYECTO } from '../../components/presupuestos/etiquetas.js';

export function ProyectosListaPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<ProyectoFila>('/proyectos', 'proyectos', obtenerProyectos);

  const columnas: Columna<ProyectoFila>[] = [
    { id: 'codigo', encabezado: 'Código', ancho: 'w-32', celda: (f) => <span className="font-mono font-semibold text-[#ea580c]">{f.codigo}</span> },
    {
      id: 'nombre',
      encabezado: 'Proyecto',
      celda: (f) => (
        <div>
          <div className="font-medium text-white">{f.nombre}</div>
          <div className="text-[11px] text-neutral-400">{f.cliente_nombre}</div>
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: 'Estado',
      ancho: 'w-28',
      celda: (f) => <Badge variant={ESTADO_PROYECTO[f.estado].variant}>{ESTADO_PROYECTO[f.estado].texto}</Badge>,
    },
    { id: 'creado', encabezado: 'Creado', ancho: 'w-28', celda: (f) => <span className="font-mono text-xs text-neutral-400">{formatearDia(f.created_at)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Proyectos</h1>
        <p className="text-xs text-neutral-400">Campañas con varias OTs (una por local). Se crean al aprobar un presupuesto multi-local.</p>
      </div>
      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todos' }, ...ESTADOS_PROYECTO.map((e) => ({ valor: e, etiqueta: ESTADO_PROYECTO[e].texto }))]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por código, nombre o cliente..."
        onFilaClick={(f) => navigate({ to: '/proyectos/$id', params: { id: f.id } })}
        vacio={{ titulo: 'Sin proyectos', descripcion: 'Aparecen al aprobar un presupuesto con 2 o más sucursales.' }}
        onReintentar={reintentar}
      />
    </div>
  );
}
