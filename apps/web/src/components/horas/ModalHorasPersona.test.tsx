import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = { horasDePersona: vi.fn(), cerrarConHora: vi.fn(), corregirFin: vi.fn(), cargarHorasManual: vi.fn(), tareasParaHoras: vi.fn() };
vi.mock('../../lib/api-horas.js', async (orig) => ({
  ...(await orig<object>()),
  horasDePersona: (...a: unknown[]) => api.horasDePersona(...a),
  cerrarConHora: (...a: unknown[]) => api.cerrarConHora(...a),
  corregirFin: (...a: unknown[]) => api.corregirFin(...a),
  cargarHorasManual: (...a: unknown[]) => api.cargarHorasManual(...a),
  tareasParaHoras: (...a: unknown[]) => api.tareasParaHoras(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ModalHorasPersona } from './ModalHorasPersona.js';

const fila = (extra: object) => ({
  id: 'i1', hora_inicio: '2026-11-16T11:00:00Z', hora_fin: '2026-11-16T15:00:00Z', hora_fin_original: '2026-11-16T15:00:00Z', abierto: false,
  segundos: 14400, origen: 'RELOJ', motivo_manual: null, cargado_por: null, motivo_correccion: null, corregido_por: null,
  tarea_id: 't1', tarea: 'Imprimir lona', ot_codigo: 'OT-2026-0010', cliente: 'Farmacia', en_tanda: false, ...extra,
});
const montar = () => render(<QueryClientProvider client={new QueryClient()}><ModalHorasPersona persona={{ id: 'p1', nombre: 'Eduardo' }} onCerrar={() => undefined} /></QueryClientProvider>);

describe('Loop 13 — horas de una persona (oficina)', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset().mockResolvedValue({ id: 'x' }));
    api.tareasParaHoras.mockResolvedValue([{ id: 't1', descripcion: 'Imprimir lona', estado: 'PAUSADA', codigo_ot: 'OT-2026-0010', cliente: 'Farmacia' }]);
  });

  it('lista los tramos con su OT y su duración; muestra lo corregido y lo cargado a mano', async () => {
    api.horasDePersona.mockResolvedValue({ total: 3, pagina: 1, segundos_periodo: 30600, items: [
      fila({}),
      fila({ id: 'i2', hora_fin: '2026-11-15T13:00:00Z', hora_fin_original: '2026-11-15T15:00:00Z', segundos: 7200, motivo_correccion: 'Paró a las 10', corregido_por: 'sofi' }),
      fila({ id: 'i3', origen: 'MANUAL', segundos: 9000, motivo_manual: 'Sin celular', cargado_por: 'gerardo' }),
    ] });
    montar();
    expect(await screen.findByText('Total del período: 8 h 30 min')).toBeTruthy();
    expect(screen.getAllByText(/OT-2026-0010 · Farmacia/).length).toBe(3);
    expect(screen.getByText(/Corregido por sofi: Paró a las 10/)).toBeTruthy();
    expect(screen.getByText(/A mano \(gerardo\): Sin celular/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Corregir fin' }).length).toBe(2); // el ya corregido no se corrige otra vez
  });

  it('un reloj abierto se cierra con la hora real y un motivo', async () => {
    api.horasDePersona.mockResolvedValue({ total: 1, pagina: 1, segundos_periodo: 3600, items: [fila({ abierto: true, hora_fin: null, hora_fin_original: null, segundos: 3600 })] });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar con hora' }));
    fireEvent.change(screen.getByLabelText('Hora real de fin'), { target: { value: '2026-11-16T10:30' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se olvidó de pausar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.cerrarConHora).toHaveBeenCalledWith('i1', new Date('2026-11-16T10:30').toISOString(), 'Se olvidó de pausar'));
  });

  it('cargar horas a mano: tarea de la persona, inicio, fin y motivo', async () => {
    api.horasDePersona.mockResolvedValue({ total: 0, pagina: 1, segundos_periodo: 0, items: [] });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Cargar horas a mano/ }));
    await screen.findByRole('option', { name: /OT-2026-0010 · Farmacia · Imprimir lona/ });
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: '2026-11-16T14:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-11-16T16:00' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Trabajó sin celular' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar' }));
    await waitFor(() => expect(api.cargarHorasManual).toHaveBeenCalledWith(expect.objectContaining({
      tareaId: 't1', personaId: 'p1', horaInicio: new Date('2026-11-16T14:00').toISOString(), horaFin: new Date('2026-11-16T16:00').toISOString(), motivo: 'Trabajó sin celular',
    })));
  });
});
