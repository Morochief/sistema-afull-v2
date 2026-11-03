import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit2, Link as LinkIcon, DollarSign, Power } from 'lucide-react';
import type { PersonaFila } from '@afull/shared';
import { usePersonas } from '../hooks/personas/usePersonas.js';
import { useSesion } from '../hooks/useSesion.js';
import { cambiarEstadoPersona } from '../lib/api-personas.js';
import { mensajeDeError } from '../lib/api.js';
import { TablaAdmin } from '../components/tabla/TablaAdmin.js';
import type { Columna } from '../components/tabla/tipos.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { ModalNuevaPersona } from '../components/modals/ModalNuevaPersona.js';
import { ModalEditarPersona } from '../components/modals/ModalEditarPersona.js';
import { ModalVincularUsuario } from '../components/modals/ModalVincularUsuario.js';
import { ModalTarifasPersona } from '../components/modals/ModalTarifasPersona.js';

export function PersonasPage() {
  const { tieneCapacidad } = useSesion();
  const { datos, estado, filtros, setFiltros, reintentar } = usePersonas();

  const [modalNuevo, setModalNuevo] = useState(false);
  const [personaEditar, setPersonaEditar] = useState<PersonaFila | null>(null);
  const [personaVincular, setPersonaVincular] = useState<PersonaFila | null>(null);
  const [personaTarifas, setPersonaTarifas] = useState<PersonaFila | null>(null);

  const esAdmin = tieneCapacidad('admin');
  const esRrhh = tieneCapacidad('rrhh');

  const handleToggleEstado = async (p: PersonaFila) => {
    try {
      await cambiarEstadoPersona(p.id, !p.activo, p.updated_at);
      toast.success(p.activo ? 'Colaborador desactivado' : 'Colaborador reactivado');
      reintentar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al cambiar estado'));
    }
  };

  const columnas: Columna<PersonaFila>[] = [
    {
      id: 'nombre',
      encabezado: 'Nombre / Colaborador',
      celda: (fila) => (
        <div>
          <div className="font-semibold text-white">{fila.nombre}</div>
          <div className="text-[11px] text-neutral-400">C.I.: {fila.ci}</div>
        </div>
      ),
    },
    {
      id: 'cargo',
      encabezado: 'Cargo / Departamento',
      celda: (fila) => (
        <span className="text-neutral-300 text-xs">
          {fila.cargo || '—'} {fila.departamento ? `(${fila.departamento})` : ''}
        </span>
      ),
    },
    {
      id: 'usuario',
      encabezado: 'Cuenta de Acceso',
      celda: (fila) =>
        fila.username ? (
          <Badge variant="neutral" className="border-neutral-700 text-neutral-200 font-mono">
            @{fila.username}
          </Badge>
        ) : (
          <span className="text-neutral-500 text-xs italic">Sin usuario</span>
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
      ancho: 'w-48',
      alinear: 'der',
      celda: (fila) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPersonaEditar(fila)}
            className="h-8 w-8 p-0 text-neutral-400 hover:text-white"
            title="Editar ficha"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>

          {esAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPersonaVincular(fila)}
              className="h-8 w-8 p-0 text-neutral-400 hover:text-[#ea580c]"
              title="Vincular usuario de acceso"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
          )}

          {esRrhh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPersonaTarifas(fila)}
              className="h-8 w-8 p-0 text-neutral-400 hover:text-emerald-400"
              title="Tarifas horarias"
            >
              <DollarSign className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleToggleEstado(fila)}
            className={`h-8 w-8 p-0 ${
              fila.activo ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-500 hover:text-emerald-400'
            }`}
            title={fila.activo ? 'Desactivar' : 'Reactivar'}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1f2937] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Personas y Colaboradores</h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            Padrón de personal, asignación de cuentas y tarifas horarias (RRHH).
          </p>
        </div>
        {esRrhh && (
          <Button onClick={() => setModalNuevo(true)} className="gap-2 text-xs">
            <Plus className="h-4 w-4" />
            <span>Nueva Persona</span>
          </Button>
        )}
      </div>

      <TablaAdmin<PersonaFila>
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[
          { valor: 'activos', etiqueta: 'Activos' },
          { valor: 'inactivos', etiqueta: 'Inactivos' },
          { valor: 'todos', etiqueta: 'Todos' },
        ]}
        claveFila={(fila) => fila.id}
        textoBusqueda="Buscar por nombre o CI..."
        vacio={{
          titulo: 'No se encontraron personas',
          descripcion: 'Ajuste los filtros o registre una nueva persona en el sistema.',
        }}
        onReintentar={reintentar}
      />

      <ModalNuevaPersona
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onCreada={reintentar}
      />

      <ModalEditarPersona
        persona={personaEditar}
        onCerrar={() => setPersonaEditar(null)}
        onGuardada={reintentar}
      />

      <ModalVincularUsuario
        persona={personaVincular}
        onCerrar={() => setPersonaVincular(null)}
        onVinculado={reintentar}
      />

      <ModalTarifasPersona
        persona={personaTarifas}
        onCerrar={() => setPersonaTarifas(null)}
      />
    </div>
  );
}
