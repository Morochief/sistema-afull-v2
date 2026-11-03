import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../ui/button.js';
import { ModalSubirDiseno } from './ModalSubirDiseno.js';

/** En "Mi trabajo", para tareas de diseño: la diseñadora carga el enlace de Drive sin salir de su pantalla. */
export function BotonSubirDiseno({ otId }: { otId: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="mt-2 h-8 w-full gap-1.5 text-xs" onClick={() => setAbierto(true)}>
        <Upload className="h-3.5 w-3.5" /> Cargar enlace del diseño
      </Button>
      {abierto && <ModalSubirDiseno otId={otId} puedeElegirOrigen={false} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
