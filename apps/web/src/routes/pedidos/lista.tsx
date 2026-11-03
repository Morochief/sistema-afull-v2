import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { listarPedidos, type PedidoFila } from '../../lib/api-portal.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Badge } from '../../components/ui/badge.js';
import { formatearDia } from '../../lib/fechas.js';
import { ModalPedido } from '../../components/portal/ModalPedido.js';

const ESTADO = { NUEVO: { t: 'Nuevo', v: 'warning' }, CONVERTIDO: { t: 'Convertido', v: 'success' }, DESCARTADO: { t: 'Descartado', v: 'neutral' } } as const;

/** Bandeja de pedidos que los clientes cargan en el portal. */
export function PedidosListaPage() {
  const qc = useQueryClient();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<PedidoFila>('/pedidos', 'pedidos', listarPedidos);
  const [abierto, setAbierto] = useState<PedidoFila | null>(null);
  const columnas: Columna<PedidoFila>[] = [
    { id: 'numero', encabezado: 'Pedido', ancho: 'w-32', celda: (f) => <span className="font-mono font-semibold text-[#ea580c]">{f.numero}</span> },
    {
      id: 'que', encabezado: 'Qué pide',
      celda: (f) => (
        <div>
          <div className="line-clamp-1 text-white">{f.descripcion}</div>
          <div className="text-[11px] text-neutral-400">{f.cliente_nombre}{f.sucursal_nombre && ` · ${f.sucursal_nombre}`}</div>
        </div>
      ),
    },
    { id: 'resultado', encabezado: 'Resultado', ancho: 'w-32', celda: (f) => <span className="font-mono text-xs text-neutral-300">{f.codigo_ot ?? f.presupuesto_numero ?? '—'}</span> },
    { id: 'estado', encabezado: 'Estado', ancho: 'w-28', celda: (f) => <Badge variant={ESTADO[f.estado].v}>{ESTADO[f.estado].t}</Badge> },
    { id: 'fecha', encabezado: 'Llegó', ancho: 'w-28', celda: (f) => <span className="font-mono text-xs text-neutral-400">{formatearDia(f.created_at)}</span> },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Pedidos del portal</h1>
        <p className="text-xs text-neutral-400">Lo que piden los clientes desde su enlace. Cada pedido se convierte en OT o presupuesto, o se descarta con motivo.</p>
      </div>
      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todos' }, ...(['NUEVO', 'CONVERTIDO', 'DESCARTADO'] as const).map((e) => ({ valor: e, etiqueta: ESTADO[e].t }))]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por número, cliente, local o texto..."
        onFilaClick={setAbierto}
        vacio={{ titulo: 'Sin pedidos', descripcion: 'Cuando un cliente pida algo desde su portal, aparece acá.' }}
        onReintentar={reintentar}
      />
      <ModalPedido pedido={abierto} onCerrar={() => setAbierto(null)} onResuelto={() => void qc.invalidateQueries({ queryKey: ['pedidos'] })} />
    </div>
  );
}
