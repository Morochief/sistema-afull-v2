import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CAPACIDADES, ETIQUETA_CAPACIDAD, type Capacidad } from '@afull/shared';
import { crearUsuario, editarUsuario, type UsuarioFila } from '../../lib/api-usuarios.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/** Plantillas rápidas (los "roles" son solo combinaciones de permisos). */
const PLANTILLAS: { nombre: string; caps: Capacidad[] }[] = [
  { nombre: 'Administración', caps: ['comercial', 'rrhh'] },
  { nombre: 'Taller', caps: ['taller'] },
  { nombre: 'Montaje', caps: ['montaje'] },
  { nombre: 'Diseño', caps: ['diseno'] },
];

type Props = { abierto: boolean; usuario: UsuarioFila | null; onCerrar: () => void; onGuardado: () => void };

/** Alta (usuario, clave y permisos) o edición de permisos de un usuario existente. */
export function ModalUsuario({ abierto, usuario, onCerrar, onGuardado }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [caps, setCaps] = useState<Capacidad[]>([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    setUsername(usuario?.username ?? '');
    setPassword('');
    setCaps(usuario?.capacidades ?? []);
  }, [abierto, usuario]);

  const alternar = (c: Capacidad) => setCaps((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      if (usuario) await editarUsuario(usuario.id, { capacidades: caps });
      else await crearUsuario({ username: username.trim(), password, capacidades: caps });
      toast.success(usuario ? 'Permisos actualizados.' : `Usuario ${username.trim().toLowerCase()} creado.`);
      onGuardado();
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo guardar'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <DialogHeader>
          <DialogTitle>{usuario ? `Permisos de ${usuario.username}` : 'Nuevo usuario'}</DialogTitle>
          <DialogDescription>
            {usuario ? 'Los cambios valen desde el próximo pedido que haga.' : 'Para que cargue horas o salga a la calle, después vinculalo a su persona en "Personas".'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {!usuario && (
            <>
              <div>
                <Label htmlFor="nuevoUsuario">Usuario</Label>
                <Input id="nuevoUsuario" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej.: edu.gimenez" autoComplete="off" autoFocus />
              </div>
              <div>
                <Label htmlFor="nuevaClave">Contraseña inicial</Label>
                <Input id="nuevaClave" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8, con letras y números" autoComplete="new-password" />
                <p className="mt-1 text-xs text-neutral-500">Pasásela en persona; después la puede cambiar desde "Mi clave".</p>
              </div>
            </>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-neutral-400">Rápido:</span>
              {PLANTILLAS.map((p) => (
                <button key={p.nombre} type="button" onClick={() => setCaps(p.caps)} className="rounded border border-[#1f2937] px-2 py-0.5 text-xs text-neutral-300 hover:border-[#ea580c] hover:text-white">
                  {p.nombre}
                </button>
              ))}
            </div>
            <fieldset className="space-y-1.5" aria-label="Permisos">
              {CAPACIDADES.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-[#161922]">
                  <input type="checkbox" checked={caps.includes(c)} onChange={() => alternar(c)} className="h-4 w-4 accent-[#ea580c]" />
                  <span className="text-neutral-200">{ETIQUETA_CAPACIDAD[c]}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Cancelar</Button>
          <Button type="submit" disabled={cargando || caps.length === 0 || (!usuario && (username.trim().length < 3 || password.length < 8))}>
            {cargando ? 'Guardando…' : usuario ? 'Guardar permisos' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
