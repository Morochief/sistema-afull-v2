import { useRef, useState } from 'react';
import { ErrorApi } from '../lib/api.js';
import { ModalMotivoRemoto } from '../components/campo/ModalMotivoRemoto.js';

/**
 * Loop 16: manda la marcación; si la API responde FUERA_DE_ZONA, pide el motivo y la reenvía (misma clave).
 * Devuelve null si la persona canceló.
 */
export function useMotivoRemoto() {
  const [aviso, setAviso] = useState<string | null>(null);
  const resolver = useRef<((m: string | null) => void) | null>(null);
  const pedir = (texto: string) => new Promise<string | null>((r) => { resolver.current = r; setAviso(texto); });
  async function conMotivo<T>(enviar: (motivo?: string) => Promise<T>): Promise<T | null> {
    try {
      return await enviar();
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.codigo !== 'FUERA_DE_ZONA') throw e;
      const motivo = await pedir(e.mensaje);
      return motivo ? enviar(motivo) : null;
    }
  }
  const modal = <ModalMotivoRemoto aviso={aviso} onListo={(m) => { setAviso(null); resolver.current?.(m); resolver.current = null; }} />;
  return { conMotivo, modal };
}
