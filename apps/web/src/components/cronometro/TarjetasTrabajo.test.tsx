import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MiTrabajoTarea } from '@afull/shared';

vi.mock('../disenos/BotonSubirDiseno.js', () => ({ BotonSubirDiseno: () => null }));
vi.mock('../insumos/AccionesMaterial.js', () => ({ AccionesMaterial: () => null }));
vi.mock('../ots/MuestrasTarea.js', () => ({ MuestrasTarea: () => null }));

import { TarjetaTareaActiva, TarjetaTareaAsignada } from './TarjetasTrabajo.js';

const tarea = (extra: Partial<MiTrabajoTarea>): MiTrabajoTarea => ({
  id: 't1', orden_trabajo_id: 'ot1', codigo_ot: 'OT-2026-0002', ot_titulo: 'Lona', cliente_nombre: 'Farmacia', tipo: 'TALLER_IMPRESION',
  descripcion: 'Imprimir lona', estado: 'EN_CURSO', minutos_trabajados_hoy: 0, segundos_acumulados: 0, intervalo_abierto: null, updated_at: '', ...extra,
} as MiTrabajoTarea);
const nada = () => undefined;

describe('Reloj de la tarea (L2.E5)', () => {
  it('CA-2.21: en curso muestra lo acumulado MÁS el tramo actual, no solo el tramo', () => {
    render(<TarjetaTareaActiva tarea={tarea({ segundos_acumulados: 725 })} segundosTramo={5} cargando={false} onPausar={nada} onFinalizar={nada} />);
    expect(screen.getByText('12:10')).toBeTruthy();
    expect(screen.getByText('Total en esta tarea')).toBeTruthy();
    expect(screen.getByText('Este tramo: 00:05')).toBeTruthy();
  });

  it('la primera vez (sin acumulado) no muestra el tramo aparte', () => {
    render(<TarjetaTareaActiva tarea={tarea({})} segundosTramo={42} cargando={false} onPausar={nada} onFinalizar={nada} />);
    expect(screen.getByText('00:42')).toBeTruthy();
    expect(screen.queryByText(/Este tramo/)).toBeNull();
  });

  it('CA-2.22: la tarjeta pausada muestra lo que lleva; la nueva no', () => {
    const { unmount } = render(<TarjetaTareaAsignada tarea={tarea({ estado: 'PAUSADA', segundos_acumulados: 3725 })} cargando={false} onIniciar={nada} />);
    expect(screen.getByText('Llevás 01:02:05')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reanudar Trabajo/ })).toBeTruthy();
    unmount();
    render(<TarjetaTareaAsignada tarea={tarea({ estado: 'PENDIENTE' })} cargando={false} onIniciar={nada} />);
    expect(screen.queryByText(/Llevás/)).toBeNull();
  });
});
