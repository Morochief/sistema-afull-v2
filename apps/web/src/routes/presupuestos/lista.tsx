import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { ESTADOS_PRESUPUESTO, type PresupuestoFila } from '@afull/shared';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { obtenerPresupuestos } from '../../lib/api-presupuestos.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { formatearDia } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { ESTADO_PRESUPUESTO } from '../../components/presupuestos/etiquetas.js';
import { ModalNuevoPresupuesto } from '../../components/modals/ModalNuevoPresupuesto.js';

export function PresupuestosListaPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<PresupuestoFila>(
    '/presupuestos',
    'presupuestos',
    obtenerPresupuestos
  );
  const [nuevo, setNuevo] = useState(false);

  const columnas: Columna<PresupuestoFila>[] = [
    {
      id: 'numero',
      encabezado: 'Número',
      ancho: 'w-36',
      celda: (f) => (
        <span className="font-mono font-semibold text-[#ea580c]">
          {f.numero} <span className="text-neutral-500">v{f.version}</span>
        </span>
      ),
    },
    {
      id: 'titulo',
      encabezado: 'Trabajo',
      celda: (f) => (
        <div>
          <div className="font-medium text-white">{f.titulo}</div>
          <div className="text-[11px] text-neutral-400">{f.cliente_nombre}</div>
        </div>
      ),
    },
    {
      id: 'total',
      encabezado: 'Total sin IVA',
      ancho: 'w-36',
      alinear: 'der',
      celda: (f) => <span className="font-mono text-xs text-neutral-200">{f.total_gs === null ? '—' : formatearGs(f.total_gs)}</span>,
    },
    {
      id: 'estado',
      encabezado: 'Estado',
      ancho: 'w-28',
      celda: (f) => <Badge variant={ESTADO_PRESUPUESTO[f.estado].variant}>{ESTADO_PRESUPUESTO[f.estado].texto}</Badge>,
    },
    {
      id: 'creado',
      encabezado: 'Creado',
      ancho: 'w-28',
      celda: (f) => <span className="font-mono text-xs text-neutral-400">{formatearDia(f.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Presupuestos</h1>
          <p className="text-xs text-neutral-400">Cotizaciones, versiones y aprobación. Al aprobar se generan las OTs.</p>
        </div>
        <Button onClick={() => setNuevo(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span>Nuevo Presupuesto</span>
        </Button>
      </div>

      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[
          { valor: 'todos', etiqueta: 'Todos' },
          ...ESTADOS_PRESUPUESTO.map((e) => ({ valor: e, etiqueta: ESTADO_PRESUPUESTO[e].texto })),
        ]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por número, trabajo o cliente..."
        onFilaClick={(f) => navigate({ to: '/presupuestos/$id', params: { id: f.id } })}
        vacio={{ titulo: 'Sin presupuestos', descripcion: 'No hay presupuestos con los filtros actuales.' }}
        onReintentar={reintentar}
      />

      <ModalNuevoPresupuesto
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        onCreado={(id) => navigate({ to: '/presupuestos/$id', params: { id } })}
      />
    </div>
  );
}
