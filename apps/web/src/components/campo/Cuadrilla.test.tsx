import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorApi } from '../../lib/api.js';

const api = { cuadrilla: vi.fn(), enviar: vi.fn() };
vi.mock('../../lib/api-cuadrilla.js', async (orig) => ({ ...(await orig<object>()), obtenerCuadrilla: () => api.cuadrilla() }));
vi.mock('../../lib/cola-offline.js', () => ({ enviarOEncolar: (...a: unknown[]) => api.enviar(...a) }));
vi.mock('../../lib/dispositivo.js', () => ({ leerGps: async () => ({ lat: -25.27, lng: -57.49, precision: 12 }), huellaDispositivo: () => 'ab'.repeat(16) }));
const avisos = { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast: { success: (m: string) => avisos.success(m), warning: (m: string) => avisos.warning(m), info: (m: string) => avisos.info(m), error: (m: string) => avisos.error(m) } }));

import { CuadrillaCard } from './CuadrillaCard.js';

const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);
const salida = { hoja_ruta_id: 'h1', descripcion: null, vehiculo: 'AAA 001', personas: [
  { persona_id: 'pc', nombre: 'Carlos', rol: 'CONDUCTOR', ultima_tipo: null, ultima_at: null },
  { persona_id: 'p1', nombre: 'Kevin', rol: 'AYUDANTE', ultima_tipo: null, ultima_at: null },
  { persona_id: 'p2', nombre: 'Lucas', rol: 'AYUDANTE', ultima_tipo: 'ENTRADA', ultima_at: '2026-11-17T11:05:00.000Z' },
] };
type Body = { tipo: string; personas: { personaId: string; claveIdempotencia: string }[]; motivoRemoto?: string };

describe('Loop 16 — cuadrilla (En la calle)', () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); Object.values(avisos).forEach((f) => f.mockReset()); });

  it('sin salidas como conductor no muestra nada', async () => {
    api.cuadrilla.mockResolvedValue({ salidas: [] });
    const { container } = conQuery(<CuadrillaCard onMarcado={() => {}} />);
    await waitFor(() => expect(api.cuadrilla).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('entrada: tilda a los que no entraron, Lucas (ya entró) en gris; manda una clave por persona y avisa los rechazos', async () => {
    api.cuadrilla.mockResolvedValue({ salidas: [salida] });
    api.enviar.mockResolvedValue({ encolada: false, respuesta: { marcadas: [{ personaId: 'pc' }, { personaId: 'p1' }], rechazadas: [{ personaId: 'p1', motivo: 'no está en esta salida' }] } });
    conQuery(<CuadrillaCard onMarcado={() => {}} />);
    const lucas = (await screen.findByLabelText(/Lucas/)) as HTMLInputElement;
    expect([lucas.disabled, lucas.checked]).toEqual([true, true]);
    expect((screen.getByLabelText(/Kevin/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar entrada de 2' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalled());
    const [, url, body] = api.enviar.mock.calls[0] as [string, string, Body];
    expect(url).toBe('/api/asistencia/cuadrilla');
    expect([body.tipo, body.personas.map((p) => p.personaId)]).toEqual(['ENTRADA', ['pc', 'p1']]);
    expect(new Set(body.personas.map((p) => p.claveIdempotencia)).size).toBe(2);
    await waitFor(() => expect(avisos.warning).toHaveBeenCalledWith('Kevin: no está en esta salida.'));
  });

  it('si la mayoría ya entró, sugiere la salida', async () => {
    api.cuadrilla.mockResolvedValue({ salidas: [{ ...salida, personas: salida.personas.map((p) => ({ ...p, ultima_tipo: 'ENTRADA', ultima_at: '2026-11-17T11:05:00.000Z' })) }] });
    conQuery(<CuadrillaCard onMarcado={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Marcar salida de 3' })).toBeTruthy();
  });

  it('salida: solo se puede tildar a quien entró', async () => {
    api.cuadrilla.mockResolvedValue({ salidas: [salida] });
    conQuery(<CuadrillaCard onMarcado={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Salida' }));
    expect((screen.getByLabelText(/Kevin/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Marcar salida de 1' })).toBeTruthy();
  });

  it('fuera de zona: pide el motivo y reenvía lo mismo (mismas claves) con el motivo', async () => {
    api.cuadrilla.mockResolvedValue({ salidas: [salida] });
    api.enviar
      .mockRejectedValueOnce(new ErrorApi(400, 'Estás fuera de la zona (a 15000 m de Fábrica)', undefined, 'FUERA_DE_ZONA'))
      .mockResolvedValueOnce({ encolada: false, respuesta: { marcadas: [{ personaId: 'pc' }, { personaId: 'p1' }], rechazadas: [] } });
    conQuery(<CuadrillaCard onMarcado={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar entrada de 2' }));
    expect(await screen.findByText('Estás fuera de la zona (a 15000 m de Fábrica)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salí desde casa con el camión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar igual' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalledTimes(2));
    const [a, b] = api.enviar.mock.calls.map((c) => c[2] as Body);
    expect(b).toEqual({ ...a, motivoRemoto: 'Salí desde casa con el camión' });
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith('Entrada marcada para 2 de la cuadrilla.'));
  });
});
