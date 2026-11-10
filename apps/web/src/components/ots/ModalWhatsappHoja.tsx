import { toast } from 'sonner';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.js';
import { Button } from '../ui/button.js';

/** Muestra el mensaje armado para que Gerardo lo copie o lo abra en WhatsApp y elija el grupo. */
export function ModalWhatsappHoja({ mensaje, onCerrar }: { mensaje: string | null; onCerrar: () => void }) {
  if (!mensaje) return null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast.success('Mensaje copiado.');
    } catch {
      toast.error('No se pudo copiar: seleccioná el texto y copialo a mano.');
    }
  };
  return (
    <Dialog abierto onCerrar={onCerrar}>
      <DialogHeader>
        <DialogTitle>Hoja de ruta para WhatsApp</DialogTitle>
        <DialogDescription>La hoja ya está activa: los operarios ven sus tareas en "Mi trabajo".</DialogDescription>
      </DialogHeader>
      <pre data-testid="mensaje-whatsapp" className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-[#1f2937] bg-[#090a0f] p-3 text-xs text-neutral-200">{mensaje}</pre>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void copiar()}>Copiar</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">Abrir WhatsApp</a>
      </DialogFooter>
    </Dialog>
  );
}
