import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = { terminadas: vi.fn() };
vi.mock('../../lib/api-terminadas.js', async (orig) => ({ ...(await orig<object>()), obtenerTerminadas: (...a: unknown[]) => api.terminadas(...a) }));

import { TerminadasMiTrabajo } from './TerminadasMiTrabajo.js';
import { duracionLarga, rangoPeriodo } from '../../lib/api-terminadas.js';

const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);
const item = (extra: object) => ({ tarea_id: 't1', ot_id: 'o1', ot_codigo: 'OT-2026-0010', cliente_nombre: 'Marilan', descripcion: 'Imprimir lona', tipo: 'TALLER_IMPRESION',
  terminada_at: '2026-11-17T14:30:00.000Z', segundos: 3600, cantidad: 2.5, unidad: 'm2', ...extra });
const pagina = (items: object[], extra: object = {}) => ({ items, total: items.length, pagina: 1, tamPagina: 25, totalPaginas: 1, horas_periodo_segundos: 116100, ...extra });

describe('Loop 15 — Terminadas (Mi trabajo)', () => {
  beforeEach(() => api.terminadas.mockReset());

  it('rangos en hora de Asunción: la semana arranca el lunes; el domingo 23:30 de Asunción sigue siendo domingo', () => {
    const domingoNoche = new Date('2026-11-23T02:30:00Z'); // domingo 22/11 23:30 en Asunción
    expect(rangoPeriodo('semana', domingoNoche)).toEqual({ desde: '2026-11-16', hasta: '2026-11-22' });
    expect(rangoPeriodo('semana_pasada', domingoNoche)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(rangoPeriodo('mes', domingoNoche)).toEqual({ desde: '2026-11-01', hasta: '2026-11-22' });
    expect(rangoPeriodo('semana', new Date('2026-11-16T12:00:00Z'))).toEqual({ desde: '2026-11-16', hasta: '2026-11-16' });
    expect([duracionLarga(116100), duracionLarga(2700)]).toEqual(['32 h 15 min', '45 min']);
  });

  it('muestra lo terminado con su tiempo, cantidad y las horas del período; sin montos', async () => {
    api.terminadas.mockResolvedValue(pagina([item({}), item({ tarea_id: 't2', descripcion: 'Laminar', segundos: 1800, cantidad: null, unidad: null })]));
    conQuery(<TerminadasMiTrabajo />);
    expect((await screen.findByTestId('horas-periodo')).textContent).toBe('Esta semana trabajaste 32 h 15 min');
    expect(screen.getByText('Imprimir lona')).toBeTruthy();
    expect(screen.getByText('1 h 00 min')).toBeTruthy();
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText(/2,5 m2/)).toBeTruthy();
    expect(screen.queryByText(/Gs\./)).toBeNull();
  });

  it('cambiar a "Semana pasada" pide ese rango desde la página 1; paginado', async () => {
    api.terminadas.mockResolvedValue(pagina([item({})], { total: 30, totalPaginas: 2 }));
    conQuery(<TerminadasMiTrabajo />);
    fireEvent.click(await screen.findByRole('button', { name: 'Siguientes' }));
    await waitFor(() => expect(api.terminadas).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 2));
    fireEvent.click(screen.getByRole('button', { name: 'Semana pasada' }));
    const { desde, hasta } = rangoPeriodo('semana_pasada');
    await waitFor(() => expect(api.terminadas).toHaveBeenLastCalledWith(desde, hasta, 1));
    expect((await screen.findByTestId('horas-periodo')).textContent).toContain('La semana pasada trabajaste');
  });

  it('al volver a la pestaña vuelve a pedir, aunque lo anterior sea reciente (recién terminó algo)', async () => {
    api.terminadas.mockResolvedValue(pagina([], { horas_periodo_segundos: 0 }));
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    const vista = render(<QueryClientProvider client={qc}><TerminadasMiTrabajo /></QueryClientProvider>);
    await screen.findByText('No terminaste tareas en este período.');
    vista.unmount();
    api.terminadas.mockResolvedValue(pagina([item({})]));
    render(<QueryClientProvider client={qc}><TerminadasMiTrabajo /></QueryClientProvider>);
    expect(await screen.findByText('Imprimir lona')).toBeTruthy();
    expect(api.terminadas).toHaveBeenCalledTimes(2);
  });

  it('vacío: lo dice', async () => {
    api.terminadas.mockResolvedValue(pagina([], { horas_periodo_segundos: 0 }));
    conQuery(<TerminadasMiTrabajo />);
    expect(await screen.findByText('No terminaste tareas en este período.')).toBeTruthy();
  });
});
