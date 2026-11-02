import { describe, it, expect } from 'vitest';
import { formatearFechaDate, aFechaInput, formatearFechaHora } from './fechas.js';

describe('fechas — formato seguro sin desfase horario (D7 / CA-1.16)', () => {
  // Payload real capturado de la respuesta de GET /api/comercial/ot/:id
  const otRespuestaRealApi = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    codigo_ot: 'OT-2026-0001',
    titulo: 'Cartel Corp Led',
    fecha_prometida: '2026-11-05T00:00:00.000Z',
    created_at: '2026-11-02T16:00:00.000Z',
  };

  it('formatea fecha_prometida DATE como 05/11/2026 sin retrasarse al día 4', () => {
    // Si se hiciera new Date("2026-11-05T00:00:00.000Z"), en Paraguay (UTC-3)
    // la hora sería 21:00 del 04/11/2026.
    const formateada = formatearFechaDate(otRespuestaRealApi.fecha_prometida);
    expect(formateada).toBe('05/11/2026');
  });

  it('soporta también formato ISO plano YYYY-MM-DD', () => {
    expect(formatearFechaDate('2026-11-05')).toBe('05/11/2026');
    expect(formatearFechaDate('2026-01-01')).toBe('01/01/2026');
  });

  it('devuelve guion para fechas nulas o indefinidas', () => {
    expect(formatearFechaDate(null)).toBe('-');
    expect(formatearFechaDate(undefined)).toBe('-');
    expect(formatearFechaDate('')).toBe('-');
  });

  it('extrae el valor para input tipo date (YYYY-MM-DD)', () => {
    expect(aFechaInput(otRespuestaRealApi.fecha_prometida)).toBe('2026-11-05');
    expect(aFechaInput(null)).toBe('');
  });

  it('formatea timestamptz en hora oficial de Paraguay (America/Asuncion)', () => {
    // 2026-11-02 16:00:00 UTC = 13:00:00 en Asunción (UTC-3)
    const fechaHora = formatearFechaHora('2026-11-02T16:00:00.000Z');
    expect(fechaHora).toContain('02/11/2026');
    expect(fechaHora).toContain('13:00');
  });
});
