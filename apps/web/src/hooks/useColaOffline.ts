import { useEffect, useState } from 'react';
import { pendientesPropias, rechazadas, suscribirCola, type AccionOffline, type Rechazada } from '../lib/cola-offline.js';

/** Estado de la cola sin conexión y de la señal, para mostrarlo en "En la calle". */
export function useColaOffline() {
  const [estado, setEstado] = useState<{ pendientes: AccionOffline[]; rechazadas: Rechazada[] }>(() => ({ pendientes: pendientesPropias(), rechazadas: rechazadas() }));
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const leer = () => setEstado({ pendientes: pendientesPropias(), rechazadas: rechazadas() });
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    const quitar = suscribirCola(leer);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Otra pestaña puede haber mandado o encolado.
    window.addEventListener('storage', leer);
    return () => {
      quitar();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('storage', leer);
    };
  }, []);
  return { ...estado, enLinea };
}
