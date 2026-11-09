import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Paperclip } from 'lucide-react';
import { prepararArchivo } from '../../lib/imagen.js';
import { Button } from '../ui/button.js';

type Props = {
  etiqueta: string;
  /** Recibe el archivo ya achicado (fotos) o tal cual (PDF). */
  onArchivo: (a: { blob: Blob; mime: string }) => void | Promise<void>;
  permitirPdf?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'outline' | 'secondary';
};

/**
 * Botón que abre la cámara del celular (o el selector de archivos en la compu).
 * Con `permitirPdf` no fuerza la cámara, para poder elegir un PDF o una foto ya sacada.
 */
export function BotonFoto({ etiqueta, onArchivo, permitirPdf, disabled, className, variant = 'outline' }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [preparando, setPreparando] = useState(false);
  const elegido = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setPreparando(true);
    try {
      await onArchivo(await prepararArchivo(archivo, permitirPdf));
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo usar ese archivo');
    } finally {
      setPreparando(false);
    }
  };
  const Icono = permitirPdf ? Paperclip : Camera;
  return (
    <>
      <input
        ref={entrada}
        type="file"
        className="hidden"
        aria-label={etiqueta}
        accept={permitirPdf ? 'image/*,application/pdf' : 'image/*'}
        {...(permitirPdf ? {} : { capture: 'environment' as const })}
        onChange={(e) => void elegido(e)}
      />
      <Button type="button" variant={variant} size="sm" className={className ?? 'min-h-[40px] gap-1.5'} disabled={disabled || preparando} onClick={() => entrada.current?.click()}>
        <Icono className="h-4 w-4" />
        {preparando ? 'Preparando…' : etiqueta}
      </Button>
    </>
  );
}
