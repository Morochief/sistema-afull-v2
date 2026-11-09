import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ViajeCard } from './ViajeCard.js';
import type { MiDiaCampo } from '../../lib/api-campo.js';
import { almacenMemoria, usarAlmacenFotos, fijarUsuarioFotos, type AlmacenFotos } from '../../lib/fotos-pendientes.js';
import { fijarUsuarioCola } from '../../lib/cola-offline.js';

vi.mock('../../lib/dispositivo.js', () => ({ leerGps: () => Promise.reject(new Error('sin gps')) }));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }));

const fetchOriginal = globalThis.fetch;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: '', headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const dia: MiDiaCampo = {
  fecha: '2026-11-09', persona: { id: 'p1', nombre: 'Edu' }, viaje_abierto: null, ultima_marcacion: null,
  hojas: [{ id: 'h1', fecha: '2026-11-09', descripcion: null, estado: 'PLANIFICADA', vehiculo_id: 'v1', chapa: 'AAA111', rol: 'CONDUCTOR', paradas: [] }],
};
let almacen: AlmacenFotos;

/** La lista de vehículos se pide al montar; lo demás lo decide cada test. */
function simular(otro: (url: string, init?: RequestInit) => unknown) {
  const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) =>
    url === '/api/flota/vehiculos' ? json([{ id: 'v1', chapa: 'AAA111', marca_modelo: 'Hilux', activo: true }]) : otro(url, init));
  globalThis.fetch = f;
  return f;
}
const llamadasA = (f: ReturnType<typeof vi.fn>, url: string) => f.mock.calls.filter((c) => c[0] === url);

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(<QueryClientProvider client={qc}><ViajeCard dia={dia} onCambio={() => undefined} /></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  almacen = almacenMemoria();
  usarAlmacenFotos(almacen);
  fijarUsuarioCola('edu');
  fijarUsuarioFotos(null);
  toastError.mockReset();
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe('ViajeCard — foto del odómetro obligatoria (L4.E3)', () => {
  it('sin foto no inicia el viaje', async () => {
    const f = simular(() => json({}));
    montar();
    fireEvent.change(screen.getByLabelText('Odómetro al salir (km)'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar viaje' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Sacale una foto al odómetro'));
    expect(llamadasA(f, '/api/campo/viajes/iniciar')).toHaveLength(0);
  });

  it('con foto inicia y deja la foto guardada, atada a la clave con que se inició el viaje', async () => {
    const f = simular(() => json({ id: 'viaje-1', repetido: false }, 201));
    montar();
    fireEvent.change(screen.getByLabelText('Odómetro al salir (km)'), { target: { value: '1200' } });
    const jpg = new File([new Uint8Array(50)], 'odo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Foto del odómetro'), { target: { files: [jpg] } });
    await screen.findByTestId('foto-odometro-lista');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar viaje' }));
    await waitFor(async () => expect(await almacen.todas()).toHaveLength(1));
    const cuerpo = JSON.parse(String(llamadasA(f, '/api/campo/viajes/iniciar')[0][1].body));
    const [foto] = await almacen.todas();
    expect(foto).toMatchObject({ tipo: 'ODOMETRO_INICIO', ref: { claveViaje: cuerpo.claveIdempotencia }, mime: 'image/jpeg' });
  });
});
