/**
 * Utilidades del celular para el trabajo de campo.
 * - Huella de dispositivo: un identificador aleatorio guardado en este navegador (32 hex). No identifica a la
 *   persona: solo permite ver si alguien marca desde varios celulares. Si el almacenamiento falla, se genera uno nuevo.
 * - GPS: una lectura con alta precisión y tiempo límite; si el usuario no da permiso, el error dice cómo seguir.
 */
const CLAVE = 'afull_dispositivo';

export function huellaDispositivo(): string {
  try {
    const guardada = window.localStorage.getItem(CLAVE);
    if (guardada && /^[0-9a-f]{32}$/.test(guardada)) return guardada;
    const nueva = crypto.randomUUID().replace(/-/g, '');
    window.localStorage.setItem(CLAVE, nueva);
    return nueva;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

export type Posicion = { lat: number; lng: number; precision: number };

export function leerGps(timeoutMs = 15000): Promise<Posicion> {
  return new Promise((resolver, rechazar) => {
    if (!('geolocation' in navigator)) {
      rechazar(new Error('Este navegador no tiene GPS disponible.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      (e) =>
        rechazar(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Sin permiso de ubicación: activalo en el navegador para marcar.'
              : 'No se pudo obtener la ubicación. Probá de nuevo al aire libre.'
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Enlace a Google Maps con las coordenadas (o la dirección si no hay GPS cargado). */
export function enlaceMapa(lat: number | null, lng: number | null, direccion?: string | null): string | null {
  if (lat !== null && lng !== null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
  return null;
}
