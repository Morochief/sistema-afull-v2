import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MiTrabajoTarea, Proceso } from '@afull/shared';

const api = { areas: vi.fn(), procesos: vi.fn(), editar: vi.fn(), crear: vi.fn() };
vi.mock('../../lib/api-reportes.js', async (orig) => ({ ...(await orig<object>()), obtenerAreas: (f: unknown) => api.areas(f) }));
vi.mock('../../lib/api-procesos.js', () => ({
  listarProcesos: () => api.procesos(),
  editarProceso: (c: string, d: unknown) => api.editar(c, d),
  crearProceso: (d: unknown) => api.crear(d),
}));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('./SelectorBuscar.js', () => ({ SelectorBuscar: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../cronometro/ModalTanda.js', () => ({ ModalTanda: () => null }));
vi.mock('./ModalCargarMaterial.js', () => ({ ModalCargarMaterial: () => null }));

import { TabAreas } from './TabAreas.js';
import { ProcesosPage } from '../../routes/procesos.js';
import { AccionesMaterial } from '../insumos/AccionesMaterial.js';

const conQuery = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const proc = (codigo: string, nombre: string, area: Proceso['area'], con_medidas = false): Proceso => ({ codigo, nombre, area, orden: 1, activo: true, con_medidas });

describe('Loop 22 — áreas de trabajo (pantallas)', () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); });

  it('Horas por área: una columna por área, cada OT con sus horas, totales y el área con más horas resaltada', async () => {
    api.areas.mockResolvedValue({
      areas: [{ codigo: 'CARPINTERIA', nombre: 'Carpintería', segundos: 7200 }, { codigo: 'PINTURA', nombre: 'Pintura', segundos: 1800 }],
      filas: [
        { ot_id: 'a', ot_codigo: 'OT-2026-0001', cliente: 'Farmacia', titulo: 'Cartel', por_area: { CARPINTERIA: 5400, PINTURA: 1800 }, segundos: 7200 },
        { ot_id: 'b', ot_codigo: 'OT-2026-0002', cliente: 'Café', titulo: 'Menú', por_area: { CARPINTERIA: 1800 }, segundos: 1800 },
      ],
    });
    conQuery(<TabAreas />);
    const fila = (await screen.findByText('OT-2026-0001')).closest('tr')!;
    expect(within(fila).getByText('01:30')).toBeTruthy();
    expect(within(fila).getByText('00:30')).toBeTruthy();
    expect(within(fila).getByText('02:00')).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['OT', 'Cliente · trabajo', 'Carpintería', 'Pintura', 'Total']);
    const resumen = screen.getByLabelText('Total por área');
    expect(within(resumen).getByText('Carpintería').parentElement!.className).toMatch(/border-\[#ea580c\]/);
    expect(within(resumen).getByText('80 %')).toBeTruthy();
    expect(screen.getByText('02:30')).toBeTruthy();
  });

  it('Procesos: agrupados por área de aFull, y el interruptor "Medidas en cm" lo cambia', async () => {
    api.procesos.mockResolvedValue([proc('CORTE_MDF', 'Corte MDF', 'CARPINTERIA', true), proc('LIJADO', 'Lijado', 'CARPINTERIA'), proc('LIJADO_PINTURA', 'Lijado', 'PINTURA')]);
    api.editar.mockResolvedValue({});
    conQuery(<ProcesosPage />);
    const carp = await screen.findByRole('region', { name: 'Carpintería' });
    expect(within(carp).getByText('Corte MDF')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Pintura' })).getByText('Lijado')).toBeTruthy();
    fireEvent.click(within(carp).getAllByRole('button', { name: 'Sin medidas' })[0]);
    await waitFor(() => expect(api.editar).toHaveBeenCalledWith('LIJADO', { conMedidas: true }));
    expect(screen.getByRole('option', { name: 'Herrería' })).toBeTruthy();
  });

  it('Mi trabajo: el botón "Medidas (cm)" aparece según el proceso, no por una lista fija', () => {
    const tarea = (tipo: string, con_medidas: boolean) => ({ id: tipo, tipo, con_medidas, estado: 'PENDIENTE', tanda: null } as unknown as MiTrabajoTarea);
    const { unmount } = conQuery(<AccionesMaterial tarea={tarea('CORTE_MDF', true)} />);
    expect(screen.getByRole('button', { name: /Medidas \(cm\)/ })).toBeTruthy();
    unmount();
    conQuery(<AccionesMaterial tarea={tarea('TALLER_IMPRESION', false)} />);
    expect(screen.queryByRole('button', { name: /Medidas \(cm\)/ })).toBeNull();
  });
});
