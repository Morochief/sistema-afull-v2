import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Plus, Power, ShieldCheck } from 'lucide-react';
import { ETIQUETA_CAPACIDAD } from '@afull/shared';
import { useUsuarios } from '../hooks/useUsuarios.js';
import { useSesion } from '../hooks/useSesion.js';
import { editarUsuario, type UsuarioFila } from '../lib/api-usuarios.js';
import { mensajeDeError } from '../lib/api.js';
import { formatearFechaHora } from '../lib/fechas.js';
import { TablaAdmin } from '../components/tabla/TablaAdmin.js';
import type { Columna } from '../components/tabla/tipos.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { ModalUsuario } from '../components/usuarios/ModalUsuario.js';
import { ModalClave } from '../components/usuarios/ModalClave.js';

/** Usuarios del sistema (solo admin): alta, permisos, contraseña y alta/baja. */
export function UsuariosPage() {
  const { usuario: yo } = useSesion();
  const { datos, estado, filtros, setFiltros, reintentar } = useUsuarios();
  const [modal, setModal] = useState<{ abierto: boolean; usuario: UsuarioFila | null }>({ abierto: false, usuario: null });
  const [clave, setClave] = useState<UsuarioFila | null>(null);

  const alternarActivo = async (u: UsuarioFila) => {
    if (u.activo && !window.confirm(`¿Desactivar a ${u.username}? No va a poder entrar (su historial queda).`)) return;
    try {
      await editarUsuario(u.id, { activo: !u.activo });
      toast.success(u.activo ? `${u.username} desactivado.` : `${u.username} reactivado.`);
      reintentar();
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo cambiar el estado'));
    }
  };

  const columnas: Columna<UsuarioFila>[] = [
    {
      id: 'usuario',
      encabezado: 'Usuario',
      celda: (u) => (
        <div>
          <div className="font-mono font-semibold text-white">{u.username}</div>
          <div className="text-[11px] text-neutral-400">{u.persona_nombre ?? 'Sin persona vinculada'}</div>
        </div>
      ),
    },
    {
      id: 'permisos',
      encabezado: 'Permisos',
      celda: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.capacidades.map((c) => (
            <Badge key={c} variant={c === 'admin' ? 'default' : 'neutral'} title={ETIQUETA_CAPACIDAD[c]}>{c}</Badge>
          ))}
        </div>
      ),
    },
    { id: 'acceso', encabezado: 'Último acceso', celda: (u) => <span className="text-xs text-neutral-400">{u.ultimo_acceso ? formatearFechaHora(u.ultimo_acceso) : 'Nunca'}</span> },
    { id: 'estado', encabezado: 'Estado', ancho: 'w-24', celda: (u) => <Badge variant={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge> },
    {
      id: 'acciones',
      encabezado: 'Acciones',
      ancho: 'w-36',
      alinear: 'der',
      celda: (u) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-neutral-400 hover:text-white" title="Permisos" aria-label={`Permisos de ${u.username}`} onClick={() => setModal({ abierto: true, usuario: u })}>
            <ShieldCheck className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-neutral-400 hover:text-[#ea580c]" title="Nueva contraseña" aria-label={`Contraseña de ${u.username}`} onClick={() => setClave(u)}>
            <KeyRound className="h-4 w-4" />
          </Button>
          {u.id !== yo?.id && (
            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${u.activo ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-500 hover:text-emerald-400'}`} title={u.activo ? 'Desactivar' : 'Reactivar'} aria-label={`${u.activo ? 'Desactivar' : 'Reactivar'} ${u.username}`} onClick={() => void alternarActivo(u)}>
              <Power className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-[#1f2937] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Usuarios</h1>
          <p className="mt-0.5 text-xs text-neutral-400">Quién entra al sistema y qué puede hacer. Nada se borra: un usuario que se va se desactiva.</p>
        </div>
        <Button onClick={() => setModal({ abierto: true, usuario: null })} className="gap-2 text-xs">
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>
      <TablaAdmin<UsuarioFila>
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
        claveFila={(u) => u.id}
        textoBusqueda="Buscar por usuario o nombre…"
        vacio={{ titulo: 'No hay usuarios con ese filtro' }}
        onReintentar={reintentar}
      />
      <ModalUsuario abierto={modal.abierto} usuario={modal.usuario} onCerrar={() => setModal({ abierto: false, usuario: null })} onGuardado={reintentar} />
      <ModalClave abierto={clave !== null} usuario={clave} onCerrar={() => setClave(null)} />
    </div>
  );
}
