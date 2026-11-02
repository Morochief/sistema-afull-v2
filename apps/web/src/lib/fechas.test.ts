import { describe, it, expect } from 'vitest';
import { formatearFechaDate, aFechaInput, formatearFechaHora } from './fechas.js';

describe('fechas — formato seguro sin desfase horario (D7 / CA-1.16)', () => {
  // Respuesta real capturada directamente de GET /api/comercial/ot/:id contra Supabase afull-dev
  // Creada con fechaPrometida = "2026-11-05" (serializada por postgres-js / Hono como "2026-11-05T00:00:00.000Z")
  const otRespuestaRealApi = {
    id: '11240829-c806-4c6d-846f-6027ad18dde7',
    codigo_ot: 'OT-2026-0247',
    cliente_id: '962b148f-c561-4331-b714-7130614fc30d',
    sucursal_id: null,
    titulo: 'OT Fecha Real Test',
    descripcion: null,
    estado: 'PENDIENTE',
    fecha_prometida: '2026-11-05T00:00:00.000Z',
    creado_por: '19fbee79-c521-456b-a2f1-bfacbf0fc4ec',
    created_at: '2026-11-02T18:09:16.851Z',
    updated_at: '2026-11-02T18:09:16.851Z',
    eventos: [
      {
        id: '641b608f-0f23-4e66-90d7-87335a8c0964',
        orden_trabajo_id: '11240829-c806-4c6d-846f-6027ad18dde7',
        estado_anterior: null,
        estado_nuevo: 'PENDIENTE',
        autor_id: '19fbee79-c521-456b-a2f1-bfacbf0fc4ec',
        comentario: null,
        created_at: '2026-11-02T18:09:16.851Z',
      },
    ],
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
