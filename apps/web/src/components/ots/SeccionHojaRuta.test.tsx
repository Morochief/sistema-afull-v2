import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TareaFila } from '@afull/shared';

const m = vi.hoisted(() => ({ tareas: vi.fn(), accion: vi.fn(), notas: vi.fn(), whatsapp: vi.fn() }));
vi.mock('../../lib/api-tareas.js', () => ({ obtenerTareasOT: m.tareas, accionHojaOT: m.accion, notasHojaOT: m.notas, whatsappHojaOT: m.whatsapp }));
vi.mock('./MuestrasTarea.js', () => ({ MuestrasTarea: () => null }));
vi.mock('./ModalTareaHoja.js', () => ({ ModalTareaHoja: () => null }));
vi.mock('../modals/ModalReasignarTarea.js', () => ({ ModalReasignarTarea: () => null }));
vi.mock('../modals/ModalCancelarTarea.js', () => ({ ModalCancelarTarea: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SeccionHojaRuta } from './SeccionHojaRuta.js';

const tarea = (x: Partial<TareaFila>): TareaFila => ({
  id: crypto.randomUUID(), orden_trabajo_id: 'ot1', persona_asignada_id: null, persona_asignada_nombre: null, tipo: 'TALLER_IMPRESION',
  descripcion: 'x', orden_secuencia: 1, estado: 'PENDIENTE', minutos_trabajados: 0, fecha_trabajo: null, cantidad: null, unidad: null,
  minutos_estimados: null, creado_por: 'u', created_at: '', updated_at: '', ...x,
} as TareaFila);

function montar(estado: 'BORRADOR' | 'ACTIVA' | 'CERRADA', onCambioOT = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SeccionHojaRuta ot={{ id: 'ot1', hoja_estado: estado, hoja_notas: 'Portón de atrás' }} otFinalizada={false} onCambioOT={onCambioOT} /></QueryClientProvider>);
  return onCambioOT;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.tareas.mockResolvedValue([
    tarea({ persona_asignada_nombre: 'Eduardo', descripcion: 'Imprimir lona', cantidad: 3, unidad: 'm2', fecha_trabajo: '2030-03-05', minutos_estimados: 90 }),
    tarea({ descripcion: 'Colocar en el frente' }),
    tarea({ persona_asignada_nombre: 'Carlos', descripcion: 'Llevar escalera' }),
  ]);
});

describe('SeccionHojaRuta (Loop 11)', () => {
  it('agrupa por operario (alfabético, "Sin asignar" al final) y muestra el plan de cada tarea', async () => {
    montar('ACTIVA');
    await screen.findByText('Imprimir lona');
    const grupos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(grupos).toEqual(['⛔ Carlos', '⛔ Eduardo', '⛔ Sin asignar']);
    expect(screen.getByText('3 m2 · 05/03 · ~1 h 30 min')).toBeTruthy();
  });

  it('en BORRADOR avisa que los operarios no la ven y ofrece Activar; no ofrece Cerrar', async () => {
    m.accion.mockResolvedValue({ hoja_estado: 'ACTIVA' });
    const onCambio = montar('BORRADOR');
    await screen.findByText('Imprimir lona');
    expect(screen.getByTestId('estado-hoja').textContent).toMatch(/Borrador · los operarios todavía no la ven/);
    expect(screen.queryByRole('button', { name: /Cerrar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Activar/ }));
    await waitFor(() => expect(m.accion).toHaveBeenCalledWith('ot1', 'ACTIVAR', 'BORRADOR'));
    expect(onCambio).toHaveBeenCalled();
  });

  it('Enviar por WhatsApp muestra el mensaje armado para copiar o abrir', async () => {
    m.whatsapp.mockResolvedValue({ mensaje: '*Hoja de Ruta — Cliente*\n⛔Eduardo⛔\nImprimir lona', estado: 'ACTIVA' });
    montar('BORRADOR');
    await screen.findByText('Imprimir lona');
    fireEvent.click(screen.getByRole('button', { name: /Enviar por WhatsApp/ }));
    const pre = await screen.findByTestId('mensaje-whatsapp');
    expect(pre.textContent).toContain('⛔Eduardo⛔');
    const abrir = screen.getByRole('link', { name: 'Abrir WhatsApp' });
    expect(abrir.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent('*Hoja de Ruta — Cliente*\n⛔Eduardo⛔\nImprimir lona')}`);
  });

  it('ACTIVA permite cerrar y no ofrece Activar', async () => {
    montar('ACTIVA');
    await screen.findByText('Imprimir lona');
    expect(screen.getByRole('button', { name: /Cerrar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Activar/ })).toBeNull();
  });

  it('CERRADA: solo Reabrir, sin Agregar ni editar tareas', async () => {
    m.accion.mockResolvedValue({ hoja_estado: 'ACTIVA' });
    montar('CERRADA');
    await screen.findByText('Imprimir lona');
    expect(screen.queryByRole('button', { name: /Agregar Tarea/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }));
    await waitFor(() => expect(m.accion).toHaveBeenCalledWith('ot1', 'REABRIR', 'CERRADA'));
  });

  it('las notas para el equipo se guardan', async () => {
    m.notas.mockResolvedValue({ hoja_notas: 'Portón de atrás, timbre 2' });
    montar('ACTIVA');
    const caja = await screen.findByLabelText('Notas para el equipo');
    fireEvent.change(caja, { target: { value: 'Portón de atrás, timbre 2' } });
    fireEvent.click(within(caja.parentElement!).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.notas).toHaveBeenCalledWith('ot1', 'Portón de atrás, timbre 2'));
  });
});
