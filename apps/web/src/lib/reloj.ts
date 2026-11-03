export type SincronizadorReloj = {
  offsetMs: number;
  ahoraCorregidoMs: (ahoraLocalMs?: number) => number;
  segundosTranscurridos: (horaInicioIso: string, ahoraLocalMs?: number) => number;
};

export function crearSincronizadorReloj(
  servidorAhoraIso: string,
  localAlRecibirMs: number = Date.now()
): SincronizadorReloj {
  const servidorMs = new Date(servidorAhoraIso).getTime();
  const offsetMs = servidorMs - localAlRecibirMs;

  const ahoraCorregidoMs = (ahoraLocalMs: number = Date.now()): number => {
    return ahoraLocalMs + offsetMs;
  };

  const segundosTranscurridos = (
    horaInicioIso: string,
    ahoraLocalMs: number = Date.now()
  ): number => {
    const inicioMs = new Date(horaInicioIso).getTime();
    const actualMs = ahoraCorregidoMs(ahoraLocalMs);
    const dif = Math.floor((actualMs - inicioMs) / 1000);
    return Math.max(0, dif);
  };

  return {
    offsetMs,
    ahoraCorregidoMs,
    segundosTranscurridos,
  };
}

export function formatearTiempoTranscurrido(segundosTotales: number): string {
  const segs = Math.max(0, Math.floor(segundosTotales));
  const horas = Math.floor(segs / 3600);
  const minutos = Math.floor((segs % 3600) / 60);
  const segundos = segs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (horas > 0) {
    return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
  }
  return `${pad(minutos)}:${pad(segundos)}`;
}
