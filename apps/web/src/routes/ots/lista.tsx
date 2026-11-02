import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Edit2, ArrowRightCircle } from 'lucide-react';
import {
  ESTADOS_OT,
  esEstadoFinal,
  type OTFila,
  type EstadoOT,
} from '@afull/shared';
import { useOTs } from '../../hooks/ots/useOTs.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge, type BadgeVariant } from '../../components/ui/badge.js';
import { formatearFechaDate } from '../../lib/fechas.js';
import { ModalNuevaOT } from '../../components/modals/ModalNuevaOT.js';
import { ModalEditarOT } from '../../components/modals/ModalEditarOT.js';
import { ModalTransicionOT } from '../../components/modals/ModalTransicionOT.js';

function badgeEstado(estado: EstadoOT): { variant: BadgeVariant; texto: string } {
  switch (estado) {
    case 'PENDIENTE':
      return { variant: 'neutral', texto: 'Pendiente' };
    case 'EN_DISENO':
      return { variant: 'default', texto: 'En Diseño' };
    case 'EN_TALLER':
      return { variant: 'warning', texto: 'En Taller' };
    case 'EN_MONTAJE':
      return { variant: 'warning', texto: 'En Montaje' };
    case 'TERMINADO':
      return { variant: 'success', texto: 'Terminado' };
    case 'CANCELADO':
      return { variant: 'danger', texto: 'Cancelado' };
    default:
      return { variant: 'neutral', texto: estado };
  }
}

export function OTsListaPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useOTs();

  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false);
  const [otAEditar, setOtAEditar] = useState<OTFila | null>(null);
  const [otATransicionar, setOtATransicionar] = useState<OTFila | null>(null);

  const opcionesEstado = [
    { valor: 'todos', etiqueta: 'Todos' },
    ...ESTADOS_OT.map((e) => ({ valor: e, etiqueta: e })),
  ];

  const columnas: Columna<OTFila>[] = [
    {
      id: 'codigo',
      encabezado: 'Código',
      ancho: 'w-24',
      celda: (fila) => (
        <span className="font-mono font-semibold text-[#ea580c]">{fila.codigo_ot}</span>
      ),
    },
    {
      id: 'titulo',
      encabezado: 'Trabajo / Título',
      celda: (fila) => (
        <div>
          <div className="font-medium text-white">{fila.titulo}</div>
          {fila.descripcion && (
            <div className="line-clamp-1 text-[11px] text-neutral-400">{fila.descripcion}</div>
          )}
        </div>
      ),
    },
    {
      id: 'cliente',
      encabezado: 'Cliente / Sucursal',
      celda: (fila) => (
        <div>
          <div className="text-white font-medium">{fila.cliente_nombre}</div>
          {fila.sucursal_nombre && (
            <div className="text-[11px] text-neutral-400">{fila.sucursal_nombre}</div>
          )}
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: 'Estado',
      ancho: 'w-28',
      celda: (fila) => {
        const b = badgeEstado(fila.estado);
        return <Badge variant={b.variant}>{b.texto}</Badge>;
      },
    },
    {
      id: 'fecha_prometida',
      encabezado: 'Prometida',
      ancho: 'w-28',
      celda: (fila) => (
        <span className="font-mono text-xs text-neutral-300">
          {formatearFechaDate(fila.fecha_prometida)}
        </span>
      ),
    },
    {
      id: 'created_at',
      encabezado: 'Creada',
      ancho: 'w-28',
      celda: (fila) => (
        <span className="font-mono text-xs text-neutral-400">
          {formatearFechaDate(fila.created_at)}
        </span>
      ),
    },
    {
      id: 'acciones',
      encabezado: 'Acciones',
      ancho: 'w-24',
      alinear: 'der',
      celda: (fila) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {!esEstadoFinal(fila.estado) && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOtATransicionar(fila)}
                title="Cambiar estado"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-[#ea580c]"
              >
                <ArrowRightCircle className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOtAEditar(fila)}
                title="Editar OT"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-white"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Órdenes de Trabajo</h1>
          <p className="text-xs text-neutral-400">
            Seguimiento de producción, diseño, taller y montaje.
          </p>
        </div>
        <Button onClick={() => setModalNuevaAbierto(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span>Nueva OT</span>
        </Button>
      </div>

      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={opcionesEstado}
        claveFila={(fila) => fila.id}
        textoBusqueda="Buscar por código, trabajo o cliente..."
        onFilaClick={(fila) => {
          navigate({ to: '/ots/$id', params: { id: fila.id } });
        }}
        vacio={{
          titulo: 'Sin órdenes de trabajo',
          descripcion: 'No se encontraron órdenes registradas con los filtros actuales.',
        }}
        onReintentar={reintentar}
      />

      <ModalNuevaOT
        abierto={modalNuevaAbierto}
        onCerrar={() => setModalNuevaAbierto(false)}
        clienteInicialId={filtros.clienteId}
      />

      <ModalEditarOT
        ot={otAEditar}
        abierto={Boolean(otAEditar)}
        onCerrar={() => setOtAEditar(null)}
      />

      <ModalTransicionOT
        ot={otATransicionar}
        abierto={Boolean(otATransicionar)}
        onCerrar={() => setOtATransicionar(null)}
      />
    </div>
  );
}
