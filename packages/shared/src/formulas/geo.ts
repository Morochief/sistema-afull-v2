/**
 * Fórmulas geográficas puras (Loop 4). Se usan en el servidor (verdad) y en el navegador (vista previa).
 * La línea recta subestima las calles: por eso la ruta se multiplica por un factor de tortuosidad
 * y la alerta de desvío es SIEMPRE informativa (TRASPASO §3).
 */
export type Punto = { lat: number; lng: number };

const RADIO_TIERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros entre dos puntos (Haversine). */
export function haversineM(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const FACTOR_TORTUOSIDAD = 1.35;
export const UMBRAL_DESVIO = 0.3;

/** Km estimados recorriendo los puntos en orden, por el factor de tortuosidad; 1 decimal. */
export function distanciaRutaKm(puntos: readonly Punto[], factor = FACTOR_TORTUOSIDAD): number {
  let m = 0;
  for (let i = 1; i < puntos.length; i++) m += haversineM(puntos[i - 1], puntos[i]);
  return Math.round((m / 1000) * factor * 10) / 10;
}

/**
 * Alerta informativa: el odómetro supera lo estimado en más del umbral.
 * Sin estimación (sin paradas con GPS) no hay alerta: no se puede comparar.
 */
export function alertaDesvio(kmOdometro: number, kmEstimado: number | null, umbral = UMBRAL_DESVIO): boolean {
  if (kmEstimado === null || kmEstimado <= 0) return false;
  return kmOdometro > kmEstimado * (1 + umbral);
}

/** Resultado de la geocerca: distancia redondeada a 0,1 m y si cae dentro del radio. */
export function evaluarGeocerca(marca: Punto, sede: Punto, radioM: number) {
  const distancia = Math.round(haversineM(marca, sede) * 10) / 10;
  return { distanciaM: distancia, dentro: distancia <= radioM };
}
