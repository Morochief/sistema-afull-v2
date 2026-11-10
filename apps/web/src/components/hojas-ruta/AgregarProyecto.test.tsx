import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ obtenerProyectos: vi.fn(), agregarProyectoHoja: vi.fn(), ok: vi.fn(), error: vi.fn() }));
vi.mock('../../lib/api-presupuestos.js', () => ({ obtenerProyectos: m.obtenerProyectos }));
vi.mock('../../lib/api-campo.js', () => ({ agregarProyectoHoja: m.agregarProyectoHoja }));
vi.mock('sonner', () => ({ toast: { success: m.ok, error: m.error } }));

import { AgregarProyecto, resumenAgregado } from './AgregarProyecto.js';

const montar = (motivoExtra?: string, onAgregado = vi.fn()) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AgregarProyecto hojaId="h1" motivoExtra={motivoExtra} onAgregado={onAgregado} /></QueryClientProvider>);
  return onAgregado;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.obtenerProyectos.mockResolvedValue({ items: [{ id: 'py1', codigo: 'PRY-2026-0001', nombre: 'Renovación 3 locales', cliente_nombre: 'Farmacia' }], total: 1, pagina: 1, tamPagina: 25, totalPaginas: 1 });
});

describe('AgregarProyecto (L4.E5)', () => {
  it('pide solo los proyectos abiertos y agrega el elegido a la hoja', async () => {
    m.agregarProyectoHoja.mockResolvedValue({ agregadas: [{ id: 'a', codigo_ot: 'OT-1' }, { id: 'b', codigo_ot: 'OT-3' }], salteadas: [{ codigo_ot: 'OT-2', motivo: 'cerrada' }] });
    const onAgregado = montar();
    fireEvent.change(await screen.findByLabelText('Proyecto'), { target: { value: 'py1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar proyecto' }));
    await waitFor(() => expect(onAgregado).toHaveBeenCalled());
    expect(m.obtenerProyectos).toHaveBeenCalledWith({ estado: 'ABIERTO', pagina: 1 });
    expect(m.agregarProyectoHoja).toHaveBeenCalledWith('h1', { proyectoId: 'py1', motivoExtra: undefined });
    expect(m.ok).toHaveBeenCalledWith('Se agregaron 2 paradas. Cerradas, no se agregan: OT-2.');
  });

  it('con la hoja en curso manda el motivo de la parada extra', async () => {
    m.agregarProyectoHoja.mockResolvedValue({ agregadas: [{ id: 'a', codigo_ot: 'OT-1' }], salteadas: [] });
    montar('  se sumaron  ');
    fireEvent.change(await screen.findByLabelText('Proyecto'), { target: { value: 'py1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar proyecto' }));
    await waitFor(() => expect(m.agregarProyectoHoja).toHaveBeenCalledWith('h1', { proyectoId: 'py1', motivoExtra: 'se sumaron' }));
  });

  it('sin proyecto elegido el botón está apagado; si la API rechaza, muestra el error', async () => {
    m.agregarProyectoHoja.mockRejectedValue(new Error('Ese proyecto no tiene OTs abiertas que falten en la hoja'));
    const onAgregado = montar();
    const boton = await screen.findByRole('button', { name: 'Agregar proyecto' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'py1' } });
    fireEvent.click(boton);
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(onAgregado).not.toHaveBeenCalled();
  });

  it('el resumen nombra las que ya estaban', () => {
    expect(resumenAgregado({ agregadas: [{ id: 'a', codigo_ot: 'OT-1' }], salteadas: [{ codigo_ot: 'OT-4', motivo: 'ya_esta' }] })).toBe('Se agregó 1 parada. Ya estaban: OT-4.');
  });
});
