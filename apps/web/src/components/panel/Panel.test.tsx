import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = { panel: vi.fn(), ots: vi.fn(), ot: vi.fn(), crear: vi.fn(), hoja: vi.fn() };
vi.mock('../../lib/api-panel.js', async (orig) => ({ ...(await orig<object>()), obtenerPanel: () => api.panel() }));
vi.mock('../../lib/api-ots.js', () => ({ obtenerOTs: (...a: unknown[]) => api.ots(...a), obtenerOT: (...a: unknown[]) => api.ot(...a) }));
vi.mock('../../lib/api-tareas.js', () => ({ crearTareaOT: (...a: unknown[]) => api.crear(...a), accionHojaOT: (...a: unknown[]) => api.hoja(...a) }));
vi.mock('../procesos/OpcionesProceso.js', () => ({ OpcionesProceso: () => <option value="TALLER_IMPRESION">Impresión</option> }));

import { PanelPage } from '../../routes/panel.js';

const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);
const ahora = new Date().toISOString();
const panel = {
  servidor_ahora: ahora,
  trabajando: [{ persona_id: 'p1', nombre: 'Edu', marcada_at: null, tarea_id: 't1', tarea_descripcion: 'Imprimir lona', ot_id: 'o1', ot_codigo: 'OT-2026-0010',
    cliente_nombre: 'Marilan', desde: new Date(Date.now() - 65 * 60_000).toISOString(), salio: true }],
  en_pausa: [{ persona_id: 'p2', nombre: 'Kevin', marcada_at: ahora, tarea_id: 't2', tarea_descripcion: 'Laminar', ot_codigo: 'OT-2026-0011', cliente_nombre: 'Marilan',
    motivo: 'FALTA_MATERIAL', desde: ahora }],
  sin_tarea: [{ persona_id: 'p3', nombre: 'Carlos', marcada_at: ahora, pendientes_hoy: 0 }, { persona_id: 'p4', nombre: 'Lucas', marcada_at: ahora, pendientes_hoy: 2 }],
  sin_marcar: [{ persona_id: 'p5', nombre: 'Gerardo', marcada_at: null }],
};

describe('Loop 14 — Panel de Gerardo (pantalla)', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('muestra las tres columnas, el reloj, el aviso de salida, el motivo de pausa y resalta a quien no tiene nada', async () => {
    api.panel.mockResolvedValue(panel);
    conQuery(<PanelPage />);
    const edu = await screen.findByTestId('trabajando-p1');
    expect(edu.textContent).toContain('1 h 05 min');
    expect(edu.textContent).toContain('¿se olvidó de pausar?');
    expect(screen.getByTestId('pausa-p2').textContent).toContain('Falta material');
    expect(screen.getByTestId('sintarea-p3').textContent).toContain('No tiene nada para hoy');
    expect(screen.getByTestId('sintarea-p4').textContent).toContain('2 tareas para hoy sin empezar');
    expect(screen.getByText('No marcaron entrada (1)')).toBeTruthy();
    expect(screen.queryByText(/Gs\./)).toBeNull();
  });

  it('asignar con la hoja en borrador: crea la tarea para esa persona y activa la hoja', async () => {
    api.panel.mockResolvedValue(panel);
    api.ots.mockResolvedValue({ items: [
      { id: 'o9', codigo_ot: 'OT-2026-0020', cliente_nombre: 'Marilan', titulo: 'Casetas', estado: 'EN_TALLER' },
      { id: 'o8', codigo_ot: 'OT-2026-0019', cliente_nombre: 'Marilan', titulo: 'Vieja', estado: 'TERMINADO' },
    ] });
    api.ot.mockResolvedValue({ id: 'o9', hoja_estado: 'BORRADOR' });
    api.crear.mockResolvedValue({ id: 't9' });
    api.hoja.mockResolvedValue({ hoja_estado: 'ACTIVA' });
    conQuery(<PanelPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar tarea a Carlos' }));
    fireEvent.change(screen.getByLabelText('OT'), { target: { value: 'Casetas' } });
    fireEvent.click(await screen.findByRole('button', { name: /OT-2026-0020/ }));
    expect(screen.queryByRole('button', { name: /OT-2026-0019/ })).toBeNull();
    const activar = (await screen.findByLabelText(/activarla para que la vea ya/)) as HTMLInputElement;
    expect(activar.checked).toBe(true);
    fireEvent.change(screen.getByLabelText(/Qué hay que hacer/), { target: { value: 'Cortar vinilo' } });
    fireEvent.change(screen.getByLabelText(/Tiempo estimado/), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    await waitFor(() => expect(api.hoja).toHaveBeenCalledWith('o9', 'ACTIVAR', 'BORRADOR'));
    expect(api.crear).toHaveBeenCalledWith('o9', expect.objectContaining({ personaAsignadaId: 'p3', descripcion: 'Cortar vinilo', minutosEstimados: 45,
      fechaTrabajo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
  });

  it('hoja cerrada: avisa y no deja asignar', async () => {
    api.panel.mockResolvedValue(panel);
    api.ots.mockResolvedValue({ items: [{ id: 'o9', codigo_ot: 'OT-2026-0020', cliente_nombre: 'Marilan', titulo: 'Casetas', estado: 'EN_TALLER' }] });
    api.ot.mockResolvedValue({ id: 'o9', hoja_estado: 'CERRADA' });
    conQuery(<PanelPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar tarea a Gerardo' }));
    fireEvent.change(screen.getByLabelText('OT'), { target: { value: 'Casetas' } });
    fireEvent.click(await screen.findByRole('button', { name: /OT-2026-0020/ }));
    expect(await screen.findByText(/está cerrada/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Asignar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
