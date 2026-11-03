import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { ESTADOS_PERMISO, TIPOS_PERMISO } from '@afull/shared';
import { useListadoUrl } from '../../hooks/useListadoUrl.js';
import { useSesion } from '../../hooks/useSesion.js';
import { listarPermisos, type SolicitudPermiso } from '../../lib/api-permisos.js';
import { TablaAdmin } from '../../components/tabla/TablaAdmin.js';
import type { Columna } from '../../components/tabla/tipos.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { ESTADO_PERMISO, periodo } from '../../components/permisos/etiquetas.js';
import { ModalNuevaSolicitud } from '../../components/permisos/ModalNuevaSolicitud.js';

/** Permisos: cada uno ve y pide los suyos; el jefe (admin) y RR.HH. ven todos y firman. */
export function PermisosListaPage() {
  const navigate = useNavigate();
  const { tieneCapacidad } = useSesion();
  const esRrhh = tieneCapacidad('rrhh');
  const { datos, estado, filtros, setFiltros, reintentar } = useListadoUrl<SolicitudPermiso>('/permisos', 'permisos', listarPermisos);
  const [nueva, setNueva] = useState(false);

  const columnas: Columna<SolicitudPermiso>[] = [
    { id: 'numero', encabezado: 'Número', ancho: 'w-32', celda: (f) => <span className="font-mono font-semibold text-[#ea580c]">{f.numero}</span> },
    {
      id: 'persona', encabezado: 'Solicitud',
      celda: (f) => (
        <div>
          <div className="font-medium text-white">{TIPOS_PERMISO[f.tipo].texto}{f.detalle_tipo ? ` · ${f.detalle_tipo}` : ''}</div>
          <div className="text-[11px] text-neutral-400">{f.persona_nombre}{f.fuera_de_plazo && <span className="ml-1 text-amber-400">· fuera de plazo</span>}</div>
        </div>
      ),
    },
    { id: 'periodo', encabezado: 'Cuándo', ancho: 'w-48', celda: (f) => <span className="font-mono text-xs text-neutral-300">{periodo(f)}</span> },
    { id: 'estado', encabezado: 'Estado', ancho: 'w-28', celda: (f) => <Badge variant={ESTADO_PERMISO[f.estado].variant}>{ESTADO_PERMISO[f.estado].texto}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Permisos</h1>
          <p className="text-xs text-neutral-400">{esRrhh ? 'Solicitudes de todo el personal: el jefe autoriza y RR.HH. registra.' : 'Tus solicitudes de permiso y su estado.'}</p>
        </div>
        <Button onClick={() => setNueva(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Pedir permiso</Button>
      </div>
      <TablaAdmin
        columnas={columnas}
        datos={datos}
        estado={estado}
        filtros={filtros}
        onFiltros={setFiltros}
        opcionesEstado={[{ valor: 'todos', etiqueta: 'Todos' }, ...ESTADOS_PERMISO.map((e) => ({ valor: e, etiqueta: ESTADO_PERMISO[e].texto }))]}
        claveFila={(f) => f.id}
        textoBusqueda="Buscar por número, persona o motivo..."
        onFilaClick={(f) => navigate({ to: '/permisos/$id', params: { id: f.id } })}
        vacio={{ titulo: 'Sin solicitudes', descripcion: 'No hay solicitudes con los filtros actuales.' }}
        onReintentar={reintentar}
      />
      <ModalNuevaSolicitud abierto={nueva} esRrhh={esRrhh} onCerrar={() => setNueva(false)} onCreada={(id) => navigate({ to: '/permisos/$id', params: { id } })} />
    </div>
  );
}
