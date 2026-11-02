import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { ArrowLeft, Plus, Edit2, Power, Star, Building2, Users, Tag, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { SucursalFila, ContactoFila, MarcaFila } from '@afull/shared';
import { useCliente } from '../../hooks/clientes/useCliente.js';
import { cambiarEstadoSucursal, cambiarEstadoContacto, cambiarEstadoMarca } from '../../lib/api-subrecursos.js';
import { mensajeDeError } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { ModalEditarCliente } from '../../components/modals/ModalEditarCliente.js';
import { ModalSucursal } from '../../components/modals/ModalSucursal.js';
import { ModalContacto } from '../../components/modals/ModalContacto.js';
import { ModalMarca } from '../../components/modals/ModalMarca.js';

export function ClientesDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: cliente, isLoading, error, refetch } = useCliente(id);

  const [modalEditarCli, setModalEditarCli] = useState(false);
  const [sucursalModal, setSucursalModal] = useState<{ abierto: boolean; datos: SucursalFila | null }>({ abierto: false, datos: null });
  const [contactoModal, setContactoModal] = useState<{ abierto: boolean; datos: ContactoFila | null }>({ abierto: false, datos: null });
  const [marcaModal, setMarcaModal] = useState<{ abierto: boolean; datos: MarcaFila | null }>({ abierto: false, datos: null });

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="p-8 text-center rounded-md border border-red-900/40 bg-red-950/10">
        <h2 className="text-sm font-semibold text-white mb-2">No se pudo cargar el cliente</h2>
        <p className="text-xs text-red-300 mb-4">{mensajeDeError(error, 'Cliente inexistente')}</p>
        <Button size="sm" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const handleToggleSucursal = async (s: SucursalFila) => {
    try {
      await cambiarEstadoSucursal(id, s.id, !s.activo, s.updated_at);
      toast.success(`Sucursal ${!s.activo ? 'activada' : 'desactivada'}.`);
      await refetch();
    } catch (e) {
      toast.error(mensajeDeError(e, 'Error al cambiar estado de sucursal'));
    }
  };

  const handleToggleContacto = async (c: ContactoFila) => {
    try {
      await cambiarEstadoContacto(id, c.id, !c.activo);
      toast.success(`Contacto ${!c.activo ? 'activado' : 'desactivado'}.`);
      await refetch();
    } catch (e) {
      toast.error(mensajeDeError(e, 'Error al cambiar estado de contacto'));
    }
  };

  const handleToggleMarca = async (m: MarcaFila) => {
    try {
      await cambiarEstadoMarca(id, m.id, !m.activo);
      toast.success(`Marca ${!m.activo ? 'activada' : 'desactivada'}.`);
      await refetch();
    } catch (e) {
      toast.error(mensajeDeError(e, 'Error al cambiar estado de marca'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1f2937] pb-4">
        <div className="flex items-center gap-3">
          <Link to="/clientes" className="rounded p-1.5 text-neutral-400 hover:text-white hover:bg-[#1f2937]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#ea580c]">{cliente.codigo}</span>
              <h1 className="text-lg font-bold text-white">{cliente.nombre}</h1>
              <Badge variant={cliente.activo ? 'success' : 'neutral'}>{cliente.activo ? 'Activo' : 'Inactivo'}</Badge>
            </div>
            {cliente.razon_social && <p className="text-xs text-neutral-400">{cliente.razon_social}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/ots" search={{ clienteId: id }}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 text-[#ea580c]" />
              <span>Ver OTs</span>
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => setModalEditarCli(true)} className="gap-1.5 text-xs">
            <Edit2 className="h-3.5 w-3.5" />
            <span>Editar Datos</span>
          </Button>
        </div>
      </div>

      {/* Datos comerciales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-md border border-[#1f2937] bg-[#111318] text-xs">
        <div><span className="text-neutral-500 block mb-0.5">RUC</span><span className="text-neutral-200 font-mono">{cliente.ruc || '-'}</span></div>
        <div><span className="text-neutral-500 block mb-0.5">Teléfono</span><span className="text-neutral-200">{cliente.telefono || '-'}</span></div>
        <div><span className="text-neutral-500 block mb-0.5">Email</span><span className="text-neutral-200">{cliente.email || '-'}</span></div>
        <div><span className="text-neutral-500 block mb-0.5">Alta</span><span className="text-neutral-200 font-mono">{cliente.created_at.slice(0, 10)}</span></div>
      </div>

      {/* Sucursales */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Building2 className="h-4 w-4 text-[#ea580c]" />
            <span>Sucursales ({cliente.sucursales.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSucursalModal({ abierto: true, datos: null })} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Nueva Sucursal</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cliente.sucursales.map((s) => (
            <div key={s.id} className="p-3 rounded-md border border-[#1f2937] bg-[#111318] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">{s.nombre}</span>
                  <Badge variant={s.activo ? 'success' : 'neutral'}>{s.activo ? 'Activa' : 'Inactiva'}</Badge>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{s.ciudad || '-'} · {s.direccion || 'Sin dirección'}</div>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">GPS: {s.gps_lat}, {s.gps_lng}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSucursalModal({ abierto: true, datos: s })} className="h-7 w-7 p-0 text-neutral-400 hover:text-white"><Edit2 className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => void handleToggleSucursal(s)} className={`h-7 w-7 p-0 ${s.activo ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-400 hover:text-emerald-400'}`}><Power className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {cliente.sucursales.length === 0 && <p className="text-xs text-neutral-500 italic">Sin sucursales registradas.</p>}
        </div>
      </div>

      {/* Contactos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="h-4 w-4 text-[#ea580c]" />
            <span>Contactos ({cliente.contactos.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setContactoModal({ abierto: true, datos: null })} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Nuevo Contacto</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cliente.contactos.map((c) => (
            <div key={c.id} className="p-3 rounded-md border border-[#1f2937] bg-[#111318] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">{c.nombre}</span>
                  {c.es_principal && <Badge variant="warning" className="gap-1"><Star className="h-2.5 w-2.5 fill-current" /> Principal</Badge>}
                  <Badge variant={c.activo ? 'success' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{c.cargo || 'Sin cargo'} · Tel: {c.telefono || '-'}</div>
                {c.email && <div className="text-[11px] text-neutral-500">{c.email}</div>}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setContactoModal({ abierto: true, datos: c })} className="h-7 w-7 p-0 text-neutral-400 hover:text-white"><Edit2 className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => void handleToggleContacto(c)} className={`h-7 w-7 p-0 ${c.activo ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-400 hover:text-emerald-400'}`}><Power className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {cliente.contactos.length === 0 && <p className="text-xs text-neutral-500 italic">Sin contactos registrados.</p>}
        </div>
      </div>

      {/* Marcas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Tag className="h-4 w-4 text-[#ea580c]" />
            <span>Marcas ({cliente.marcas.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setMarcaModal({ abierto: true, datos: null })} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Nueva Marca</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cliente.marcas.map((m) => (
            <div key={m.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#1f2937] bg-[#111318] px-2.5 py-1 text-xs text-neutral-200">
              <span className={m.activo ? 'font-medium' : 'line-through text-neutral-500'}>{m.nombre}</span>
              <button type="button" onClick={() => setMarcaModal({ abierto: true, datos: m })} className="text-neutral-400 hover:text-white"><Edit2 className="h-3 w-3" /></button>
              <button type="button" onClick={() => void handleToggleMarca(m)} className={m.activo ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-400 hover:text-emerald-400'}><Power className="h-3 w-3" /></button>
            </div>
          ))}
          {cliente.marcas.length === 0 && <p className="text-xs text-neutral-500 italic">Sin marcas registradas.</p>}
        </div>
      </div>

      <ModalEditarCliente cliente={cliente} abierto={modalEditarCli} onCerrar={() => { setModalEditarCli(false); void refetch(); }} />
      <ModalSucursal clienteId={id} sucursal={sucursalModal.datos} abierto={sucursalModal.abierto} onCerrar={() => setSucursalModal({ abierto: false, datos: null })} />
      <ModalContacto clienteId={id} contacto={contactoModal.datos} abierto={contactoModal.abierto} onCerrar={() => setContactoModal({ abierto: false, datos: null })} />
      <ModalMarca clienteId={id} marca={marcaModal.datos} abierto={marcaModal.abierto} onCerrar={() => setMarcaModal({ abierto: false, datos: null })} />
    </div>
  );
}
