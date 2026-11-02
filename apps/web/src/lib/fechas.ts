/**
 * Formatea una columna tipo DATE (como fecha_prometida) sin desfase de zona horaria (D7).
 * Extrae directamente los primeros 10 caracteres (YYYY-MM-DD) y los convierte a DD/MM/YYYY.
 */
export function formatearFechaDate(fechaStr: string | null | undefined): string {
  if (!fechaStr) return '-';
  const iso = fechaStr.slice(0, 10);
  const partes = iso.split('-');
  if (partes.length !== 3) return fechaStr;
  const [año, mes, dia] = partes;
  return `${dia}/${mes}/${año}`;
}

/**
 * Devuelve el valor en formato YYYY-MM-DD apto para <input type="date">.
 */
export function aFechaInput(fechaStr: string | null | undefined): string {
  if (!fechaStr) return '';
  return fechaStr.slice(0, 10);
}

/**
 * Formatea una fecha y hora completa (TIMESTAMPTZ) en zona horaria de Paraguay (America/Asuncion).
 */
export function formatearFechaHora(timestampStr: string | null | undefined): string {
  if (!timestampStr) return '-';
  try {
    const d = new Date(timestampStr);
    if (isNaN(d.getTime())) return timestampStr;
    return new Intl.DateTimeFormat('es-PY', {
      timeZone: 'America/Asuncion',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return timestampStr;
  }
}
