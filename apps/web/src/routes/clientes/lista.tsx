import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Edit2, Power } from 'lucide-react';
import type { ClienteFila } from '@afull/shared';
import { useClientes } from '../../hooks/clientes/useClientes.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ModalNuevoCliente } from '../../components/modals/ModalNuevoCliente.js';
import { ModalEditarCliente } from '../../components/modals/ModalEditarCliente.js';
import { ModalEstadoCliente } from '../../components/modals/ModalEstadoCliente.js';

export function ClientesListaPage() {
  const navigate = useNavigate();
  const { datos, estado, filtros, setFiltros, reintentar } = useClientes();

  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [clienteAEditar, setClienteAEditar] = useState<ClienteFila | null>(null);
  const [clienteACambiarEstado, setClienteACambiarEstado] = useState<ClienteFila | null>(null);

  const opcionesEstado = [
    { valor: 'activos', etiqueta: 'Activos' },
    { valor: 'inactivos', etiqueta: 'Inactivos' },
    { valor: 'todos', etiqueta: 'Todos' },
  ];

  const columnas: Columna<ClienteFila>[] = [
    {
      id: 'codigo',
      encabezado: 'Código',
      ancho: 'w-24',
      celda: (fila) => (
        <span className="font-mono font-semibold text-[#ea580c]">{fila.codigo}</span>
      ),
    },
    {
      id: 'nombre',
      encabezado: 'Nombre / Fantasía',
      celda: (fila) => (
        <div>
          <div className="font-medium text-white">{fila.nombre}</div>
          {fila.razon_social && (
            <div className="text-[11px] text-neutral-400">{fila.razon_social}</div>
          )}
        </div>
      ),
    },
    {
      id: 'ruc',
      encabezado: 'RUC',
      ancho: 'w-32',
      celda: (fila) => (
        <span className="text-neutral-300 font-mono text-xs">{fila.ruc || '-'}</span>
      ),
    },
    {
      id: 'contacto',
      encabezado: 'Contacto',
      celda: (fila) => (
        <div className="text-xs text-neutral-300">
          <div>{fila.telefono || '-'}</div>
          {fila.email && <div className="text-[11px] text-neutral-400">{fila.email}</div>}
        </div>
      ),
    },
    {
      id: 'activo',
      encabezado: 'Estado',
      ancho: 'w-24',
      celda: (fila) => (
        <Badge variant={fila.activo ? 'success' : 'neutral'}>
          {fila.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'acciones',
      encabezado: 'Acciones',
      ancho: 'w-24',
      alinear: 'der',
      celda: (fila) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setClienteAEditar(fila)}
            aria-label={`Editar ${fila.nombre}`}
            className="h-7 w-7 p-0 text-neutral-400 hover:text-white"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setClienteACambiarEstado(fila)}
            aria-label={fila.activo ? `Desactivar ${fila.nombre}` : `Reactivar ${fila.nombre}`}
            className={`h-7 w-7 p-0 ${
              fila.activo
                ? 'text-neutral-400 hover:text-red-400'
                : 'text-neutral-400 hover:text-emerald-400'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Clientes</h1>
          <p className="text-xs text-neutral-400">
            Administración de cuentas comerciales, sucursales y contactos.
          </p>
        </div>

        <Button
          onClick={() => setModalNuevoAbierto(true)}
          className="gap-1.5 self-start sm:self-auto text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Nuevo Cliente</span>
        </Button>
      </div>

      <TablaAdmin<ClienteFila>
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={opcionesEstado}
        claveFila={(c) => c.id}
        onFilaClick={(c) => void navigate({ to: '/clientes/$id', params: { id: c.id } })}
        textoBusqueda="Buscar por nombre, RUC o código..."
        vacio={{
          titulo: 'Sin clientes registrados',
          descripcion: 'Comience dando de alta el primer cliente comercial.',
        }}
        onReintentar={reintentar}
      />

      <ModalNuevoCliente
        abierto={modalNuevoAbierto}
        onCerrar={() => setModalNuevoAbierto(false)}
      />

      <ModalEditarCliente
        cliente={clienteAEditar}
        abierto={Boolean(clienteAEditar)}
        onCerrar={() => setClienteAEditar(null)}
      />

      <ModalEstadoCliente
        cliente={clienteACambiarEstado}
        abierto={Boolean(clienteACambiarEstado)}
        onCerrar={() => setClienteACambiarEstado(null)}
      />
    </div>
  );
}
