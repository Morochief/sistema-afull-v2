import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { vincularUsuarioPersona, obtenerUsuariosVinculables } from '../../lib/api-personas.js';
import { mensajeDeError } from '../../lib/api.js';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Label } from '../ui/label.js';
import type { PersonaFila, UsuarioVinculable } from '@afull/shared';

type Props = {
  persona: PersonaFila | null;
  onCerrar: () => void;
  onVinculado: () => void;
};

export function ModalVincularUsuario({ persona, onCerrar, onVinculado }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioVinculable[]>([]);
  const [usuarioSeleccionadoId, setUsuarioSeleccionadoId] = useState<string>('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!persona) return;
    setUsuarioSeleccionadoId(persona.usuario_id || '');
    obtenerUsuariosVinculables()
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  }, [persona]);

  if (!persona) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      const nuevoId = usuarioSeleccionadoId ? usuarioSeleccionadoId : null;
      await vincularUsuarioPersona(persona.id, nuevoId);
      toast.success(
        nuevoId
          ? 'Usuario de sistema vinculado exitosamente.'
          : 'Usuario desvinculado de la persona.'
      );
      onVinculado();
      onCerrar();
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al vincular usuario'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={Boolean(persona)} onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Vincular Usuario de Sistema (Admin)</DialogTitle>
        <DialogDescription>
          Asocie una cuenta de acceso para que este colaborador pueda iniciar sesión y registrar tareas.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="mb-1 block">Colaborador</Label>
          <p className="text-xs text-neutral-300 font-semibold bg-[#090a0f] p-2.5 rounded border border-[#1f2937]">
            {persona.nombre} (C.I. {persona.ci})
          </p>
        </div>

        <div>
          <Label htmlFor="usuarioSelect">Cuenta de Usuario</Label>
          <select
            id="usuarioSelect"
            value={usuarioSeleccionadoId}
            onChange={(e) => setUsuarioSeleccionadoId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-[#1f2937] bg-[#161922] px-3 py-1 text-xs text-neutral-200 shadow-sm focus:border-[#ea580c]"
          >
            <option value="">(Sin usuario vinculado / Desvincular)</option>
            {usuarios.map((u) => {
              const vinculadoAOtra = u.persona_id && u.persona_id !== persona.id;
              return (
                <option
                  key={u.id}
                  value={u.id}
                  disabled={Boolean(vinculadoAOtra)}
                >
                  {u.username} {vinculadoAOtra ? '· (Asignado a otra persona)' : ''}
                </option>
              );
            })}
          </select>
          <p className="text-[11px] text-neutral-500 mt-1">
            Solo se listan usuarios activos. Las cuentas ya asignadas a otra persona no pueden ser reasignadas sin desvincularlas primero.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? 'Guardando...' : 'Guardar Vínculo'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
