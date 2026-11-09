import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cambiarMiClave, resetearClave } from '../../lib/api-usuarios.js';
import { mensajeDeError } from '../../lib/api.js';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';

/**
 * Contraseña. Con `usuario`: el admin pone una nueva ("se olvidó la clave") y se cierran sus sesiones.
 * Sin `usuario`: "Mi clave" — cada uno cambia la propia con la actual.
 */
export function ModalClave({ abierto, usuario, onCerrar }: { abierto: boolean; usuario?: { id: string; username: string } | null; onCerrar: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (abierto) [setActual, setNueva, setRepetir].forEach((f) => f(''));
  }, [abierto]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nueva !== repetir) {
      toast.error('Las dos contraseñas nuevas no coinciden');
      return;
    }
    setCargando(true);
    try {
      if (usuario) await resetearClave(usuario.id, nueva);
      else await cambiarMiClave(actual, nueva);
      toast.success(usuario ? `Contraseña de ${usuario.username} cambiada: tiene que volver a entrar.` : 'Tu contraseña cambió.');
      onCerrar();
    } catch (er) {
      toast.error(mensajeDeError(er, 'No se pudo cambiar la contraseña'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <DialogHeader>
          <DialogTitle>{usuario ? `Nueva contraseña para ${usuario.username}` : 'Cambiar mi contraseña'}</DialogTitle>
          <DialogDescription>Mínimo 8 caracteres, con letras y números.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {!usuario && (
            <div>
              <Label htmlFor="claveActual">Contraseña actual</Label>
              <Input id="claveActual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" autoFocus />
            </div>
          )}
          <div>
            <Label htmlFor="claveNueva">Contraseña nueva</Label>
            <Input id="claveNueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="claveRepetir">Repetir la nueva</Label>
            <Input id="claveRepetir" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={cargando}>Cancelar</Button>
          <Button type="submit" disabled={cargando || nueva.length < 8 || (!usuario && !actual)}>{cargando ? 'Guardando…' : 'Cambiar'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
