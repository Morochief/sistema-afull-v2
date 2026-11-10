import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MiTrabajoTarea } from '@afull/shared';

const iniciarTanda = vi.fn();
vi.mock('../../lib/api-cronometro.js', () => ({ iniciarTanda: (...a: unknown[]) => iniciarTanda(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ModalTanda } from './ModalTanda.js';
import { EtiquetaTanda } from './EtiquetaTanda.js';

const t = (id: string, extra: Partial<MiTrabajoTarea>): MiTrabajoTarea => ({
  id, orden_trabajo_id: 'ot-' + id, codigo_ot: 'OT-' + id, ot_titulo: 'Lona', cliente_nombre: 'Cliente ' + id, tipo: 'TALLER_IMPRESION',
  descripcion: 'Imprimir', estado: 'PENDIENTE', minutos_trabajados_hoy: 0, segundos_acumulados: 0, intervalo_abierto: null, tanda: null,
  fecha_trabajo: null, cantidad: null, unidad: null, minutos_estimados: null, updated_at: '', ...extra,
} as MiTrabajoTarea);

const tareas = [
  t('10', { cantidad: 2, unidad: 'm2' }),
  t('11', { cantidad: 1.5, unidad: 'm2', estado: 'PAUSADA' }),
  t('12', { tipo: 'MONTAJE_CALLE' }),
  t('13', { estado: 'EN_CURSO' }),
];
const montar = () =>
  render(<QueryClientProvider client={new QueryClient()}><ModalTanda origen={tareas[0]} tareas={tareas} onCerrar={() => undefined} /></QueryClientProvider>);

describe('Loop 12 — Tanda compartida (pantalla)', () => {
  beforeEach(() => iniciarTanda.mockReset().mockResolvedValue({ tandaId: 'x', tareaId: '10' }));

  it('lista solo impresiones pendientes o pausadas, con la OT y el cliente, y propone los m² de cada una', () => {
    montar();
    expect(screen.getByText('OT-10 · Cliente 10')).toBeTruthy();
    expect(screen.getByText('OT-11 · Cliente 11')).toBeTruthy();
    expect(screen.queryByText(/OT-12/)).toBeNull();
    expect(screen.queryByText(/OT-13/)).toBeNull();
    expect((screen.getByLabelText('m² OT-10') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('m² OT-11') as HTMLInputElement).value).toBe('1,5');
  });

  it('manda la tarea de origen primero, con los m² de cada una', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar tanda' }));
    await waitFor(() => expect(iniciarTanda).toHaveBeenCalledWith([{ tareaId: '10', m2Piezas: 2 }, { tareaId: '11', m2Piezas: 1.5 }]));
  });

  it('con una sola tarea no deja iniciar', () => {
    montar();
    fireEvent.change(screen.getByLabelText('m² OT-11'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar tanda' }));
    expect(iniciarTanda).not.toHaveBeenCalled();
  });

  it('la tarjeta de la tanda dice entre qué OTs se reparte', () => {
    render(<EtiquetaTanda tarea={t('10', { tanda: { id: 'x', tareas: [
      { tarea_id: '10', orden_trabajo_id: 'ot-10', codigo_ot: 'OT-10', cliente_nombre: 'Farmacia', m2: 2 },
      { tarea_id: '11', orden_trabajo_id: 'ot-11', codigo_ot: 'OT-11', cliente_nombre: 'Super', m2: 1.5 },
    ] } })} />);
    expect(screen.getByText('Tanda compartida')).toBeTruthy();
    expect(screen.getByText('OT-10 · Farmacia (2 m²)')).toBeTruthy();
    expect(screen.getByText('OT-11 · Super (1,5 m²)')).toBeTruthy();
  });
});
