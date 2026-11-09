import { useEffect, useState } from 'react';
import { fotosDelUsuario, suscribirFotos, type FotoPendiente } from '../lib/fotos-pendientes.js';
import type { RefArchivo } from '../lib/api-archivos.js';

const mismaRef = (a: RefArchivo, b: RefArchivo) =>
  (Object.keys(b) as (keyof RefArchivo)[]).every((k) => b[k] === undefined || a[k] === b[k]);

/** Fotos guardadas en el celular de quien está en sesión (todas, o solo las de una cosa). */
export function useFotosPendientes(ref?: RefArchivo) {
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const clave = JSON.stringify(ref ?? {});
  useEffect(() => {
    let vivo = true;
    const leer = () => void fotosDelUsuario().then((fs) => vivo && setFotos(ref ? fs.filter((f) => mismaRef(f.ref, ref)) : fs));
    leer();
    const quitar = suscribirFotos(leer);
    return () => {
      vivo = false;
      quitar();
    };
    // `clave` resume `ref` (objeto nuevo en cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return { fotos, porSubir: fotos.filter((f) => !f.error), conError: fotos.filter((f) => f.error) };
}
