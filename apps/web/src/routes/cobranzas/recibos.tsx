import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Receipt } from 'lucide-react';
import { ETIQUETA_MEDIO, type ReciboFila } from '@afull/shared';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { listarRecibos, type PaginaRecibos } from '../../lib/api-cobranzas.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { formatearFechaDate } from '../../lib/fechas.js';
import { formatearGs } from '../../lib/formato.js';
import { PestanasCobranzas } from '../../components/cobranzas/PestanasCobranzas.js';
import { ModalNuevoRecibo } from '../../components/cobranzas/ModalNuevoRecibo.js';

/** Loop 21: recibos de dinero emitidos. Al tocar uno se abre para ver, imprimir o anular. */
export function CobranzasRecibosPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<ReciboFila, PaginaRecibos>('/cobranzas/recibos', 'cobranzas-recibos', listarRecibos);
  const [nuevo, setNuevo] = useState(false);
  const abrir = (id: string) => navigate({ to: '/cobranzas/recibos/$id', params: { id } });

  const columnas: Columna<ReciboFila>[] = [
    { id: 'numero', encabezado: 'Recibo', ancho: 'w-36', celda: (r) => <span className="font-mono font-semibold text-[#ea580c]">{r.numero}</span> },
    { id: 'cliente', encabezado: 'Cliente', celda: (r) => <span className="text-white">{r.cliente_nombre}</span> },
    { id: 'fecha', encabezado: 'Fecha', ancho: 'w-24', celda: (r) => <span className="font-mono text-xs text-neutral-400">{formatearFechaDate(r.fecha)}</span> },
    { id: 'medio', encabezado: 'Medio', ancho: 'w-36', celda: (r) => <span className="text-xs text-neutral-300">{ETIQUETA_MEDIO[r.medio]}</span> },
    { id: 'importe', encabezado: 'Importe', ancho: 'w-32', alinear: 'der', celda: (r) => <span className="font-mono text-xs font-semibold text-white">{formatearGs(r.importe_gs)}</span> },
    { id: 'estado', encabezado: 'Estado', ancho: 'w-24', celda: (r) => r.anulado_at ? <Badge variant="neutral">Anulado</Badge> : <Badge variant="success">Vigente</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <PestanasCobranzas actual="recibos" />
        <Button onClick={() => setNuevo(true)} className="gap-1.5"><Receipt className="h-4 w-4" />Nuevo recibo</Button>
      </div>
      {datos && <p className="text-xs text-neutral-400">Cobrado con este filtro (sin anulados): <b className="font-mono text-white">{formatearGs(datos.cobrado_total_gs)}</b></p>}
      <TablaAdmin
        columnas={columnas} datos={datos} estado={estado} filtros={filtros} onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todos' }, { valor: 'VIGENTE', etiqueta: 'Vigentes' }, { valor: 'ANULADO', etiqueta: 'Anulados' }]}
        claveFila={(r) => r.id}
        textoBusqueda="Buscar por número, cliente o nº de operación..."
        onFilaClick={(r) => abrir(r.id)}
        vacio={{ titulo: 'Sin recibos', descripcion: 'Todavía no se emitió ningún recibo con estos filtros.' }}
        onReintentar={reintentar}
      />
      <ModalNuevoRecibo abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={abrir} />
    </div>
  );
}
