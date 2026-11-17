import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MiTrabajoTarea } from '@afull/shared';

const cargarCorte = vi.fn();
vi.mock('../../lib/api-insumos.js', async (orig) => ({ ...(await orig<object>()), cargarCorte: (...a: unknown[]) => cargarCorte(...a) }));
vi.mock('./BuscadorInsumo.js', () => ({
  BuscadorInsumo: ({ onElegir, placeholder }: { onElegir: (i: unknown) => void; placeholder: string }) =>
    placeholder.startsWith('Material') ? <button type="button" onClick={() => onElegir({ id: 'adh', nombre: 'Adhesivo', unidad: 'M2' })}>elegir adhesivo</button> : null,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ModalCorte } from './ModalCorte.js';

const t = (id: string, extra: Partial<MiTrabajoTarea> = {}): MiTrabajoTarea => ({
  id, orden_trabajo_id: 'ot-' + id, codigo_ot: 'OT-' + id, ot_titulo: 'x', cliente_nombre: 'Cliente ' + id, tipo: 'TALLER_IMPRESION',
  descripcion: 'Imprimir', estado: 'EN_CURSO', minutos_trabajados_hoy: 0, segundos_acumulados: 0, intervalo_abierto: null, tanda: null,
  fecha_trabajo: null, cantidad: null, unidad: null, minutos_estimados: null, updated_at: '', ...extra,
} as MiTrabajoTarea);
const escribir = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const montar = (origen: MiTrabajoTarea, tareas: MiTrabajoTarea[]) =>
  render(<QueryClientProvider client={new QueryClient()}><ModalCorte origen={origen} tareas={tareas} onCerrar={() => undefined} /></QueryClientProvider>);

describe('Loop 18 — Medidas en cm (pantalla de Edu)', () => {
  beforeEach(() => cargarCorte.mockReset().mockResolvedValue({ m2Piezas: 5.598, m2Desperdicio: 3.8687, aprovechamientoPct: 59.1 }));

  it('el ejemplo de la reunión: 137 × 691 cm para dos OTs; muestra el desperdicio y su reparto, y manda cm', async () => {
    montar(t('10'), [t('10'), t('11', { estado: 'PENDIENTE' })]);
    fireEvent.click(screen.getByText('elegir adhesivo'));
    fireEvent.click(screen.getByRole('button', { name: '137' }));
    escribir('Largo usado (cm)', '691');
    escribir('Ancho pieza 1 de OT-10', '87');
    escribir('Alto pieza 1 de OT-10', '330');
    fireEvent.change(screen.getByLabelText('Agregar otro trabajo'), { target: { value: 'ot-11' } });
    escribir('Ancho pieza 1 de OT-11', '90');
    escribir('Alto pieza 1 de OT-11', '303');
    const res = screen.getByTestId('resumen-corte');
    expect(res.textContent).toContain('9,4667 m²');
    expect(res.textContent).toContain('3,8687 m²');
    expect(res.textContent).toContain('59,1 %');
    expect(screen.getByTestId('parte-OT-10').textContent).toBe('2,871 m² + 1,9841 m² desperdicio');
    expect(screen.getByTestId('parte-OT-11').textContent).toBe('2,727 m² + 1,8846 m² desperdicio');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar' }));
    await waitFor(() => expect(cargarCorte).toHaveBeenCalledTimes(1));
    expect(cargarCorte.mock.calls[0][0]).toMatchObject({
      insumoId: 'adh', anchoCm: 137, largoCm: 691,
      trabajos: [
        { otId: 'ot-10', tareaId: '10', piezas: [{ anchoCm: 87, altoCm: 330, cantidad: 1 }] },
        { otId: 'ot-11', tareaId: '11', piezas: [{ anchoCm: 90, altoCm: 303, cantidad: 1 }] },
      ],
    });
  });

  it('piezas que suman más que el material: aviso y no deja cargar', () => {
    montar(t('10'), [t('10')]);
    fireEvent.click(screen.getByText('elegir adhesivo'));
    escribir('Ancho del material (cm)', '100');
    escribir('Largo usado (cm)', '10');
    escribir('Ancho pieza 1 de OT-10', '100');
    escribir('Alto pieza 1 de OT-10', '20');
    expect(screen.getByText(/Las piezas suman 0,2 m² y el material 0,1 m²/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Cargar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('desde una tanda arranca con todas sus OTs', () => {
    const tanda = { id: 'x', tareas: [
      { tarea_id: '10', orden_trabajo_id: 'ot-10', codigo_ot: 'OT-10', cliente_nombre: 'Farmacia', m2: 2 },
      { tarea_id: '11', orden_trabajo_id: 'ot-11', codigo_ot: 'OT-11', cliente_nombre: 'Super', m2: 1.5 },
    ] };
    montar(t('10', { tanda }), [t('10', { tanda })]);
    expect(screen.getByText('OT-10 · Farmacia')).toBeTruthy();
    expect(screen.getByText('OT-11 · Super')).toBeTruthy();
  });

  it('L18.E2: un trabajo que sale del desperdicio de otro no suma m² y se manda con su OT de origen', async () => {
    montar(t('bob'), [t('bob'), t('mogul', { estado: 'PENDIENTE' })]);
    fireEvent.click(screen.getByText('elegir adhesivo'));
    escribir('Ancho del material (cm)', '50');
    escribir('Largo usado (cm)', '700');
    escribir('Ancho pieza 1 de OT-bob', '46');
    escribir('Alto pieza 1 de OT-bob', '686');
    fireEvent.change(screen.getByLabelText('Agregar otro trabajo'), { target: { value: 'ot-mogul' } });
    escribir('Ancho pieza 1 de OT-mogul', '25');
    escribir('Alto pieza 1 de OT-mogul', '386');
    fireEvent.change(screen.getByLabelText('Material de OT-mogul'), { target: { value: 'ot-bob' } });
    expect(screen.getByTestId('resumen-corte').textContent).toContain('3,1556 m²');
    expect(screen.getByTestId('parte-OT-mogul').textContent).toBe('0,965 m² del desperdicio de OT-bob (sin costo)');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar' }));
    await waitFor(() => expect(cargarCorte).toHaveBeenCalledTimes(1));
    expect(cargarCorte.mock.calls[0][0].trabajos[1]).toMatchObject({ otId: 'ot-mogul', aprovechaDesperdicioDe: 'ot-bob' });
    expect(cargarCorte.mock.calls[0][0].trabajos[0].aprovechaDesperdicioDe).toBeUndefined();
  });
});
