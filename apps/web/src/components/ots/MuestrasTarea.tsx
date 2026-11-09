import { useState } from 'react';
import { Images } from 'lucide-react';
import { SeccionArchivos } from '../archivos/SeccionArchivos.js';
import { Button } from '../ui/button.js';

/**
 * Muestras de impresión de una tarea (REQ-03): foto de la muestra antes del despacho, para que Comercial
 * (o el cliente, por fuera) la apruebe. Se despliega a pedido para no bajar fotos de todas las tareas.
 */
export function MuestrasTarea({ tareaId, descripcion, puedeSubir = true }: { tareaId: string; descripcion: string; puedeSubir?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} aria-label={`Muestras de ${descripcion}`}>
        <Images className="h-3.5 w-3.5" /> {abierta ? 'Ocultar muestras' : 'Muestras'}
      </Button>
      {abierta && (
        <SeccionArchivos
          titulo="Fotos de la muestra"
          tipo="MUESTRA_TAREA"
          refArchivo={{ tareaId }}
          etiqueta={`Muestra: ${descripcion}`}
          boton="Foto de la muestra"
          puedeSubir={puedeSubir}
          vacio="Todavía no hay fotos de la muestra."
        />
      )}
    </div>
  );
}
