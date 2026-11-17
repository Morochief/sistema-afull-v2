import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = { enviar: vi.fn(), guardar: vi.fn(), entregas: vi.fn(), archivos: vi.fn() };
let pendientes: { tipo: string }[] = [];
vi.mock('../../lib/cola-offline.js', () => ({ enviarOEncolar: (...a: unknown[]) => api.enviar(...a) }));
vi.mock('../../lib/fotos-pendientes.js', () => ({ guardarFoto: (...a: unknown[]) => api.guardar(...a) }));
vi.mock('../../hooks/useFotosPendientes.js', () => ({ useFotosPendientes: () => ({ porSubir: pendientes, fotos: pendientes, conError: [] }) }));
vi.mock('../archivos/BotonFoto.js', () => ({
  BotonFoto: ({ etiqueta, onArchivo }: { etiqueta: string; onArchivo: (a: { blob: Blob; mime: string }) => void }) =>
    <button type="button" onClick={() => onArchivo({ blob: new Blob(['x']), mime: 'image/jpeg' })}>{etiqueta}</button>,
}));
vi.mock('../../lib/api-entrega.js', () => ({ obtenerEntregas: () => api.entregas(), fijarRemision: vi.fn() }));
vi.mock('../../lib/api-archivos.js', async (orig) => ({ ...(await orig<object>()), listarArchivos: () => api.archivos() }));
const avisos = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
vi.mock('sonner', () => ({ toast: { error: (m: string) => avisos.error(m), success: (m: string) => avisos.success(m), info: (m: string) => avisos.info(m) } }));

import { ModalEntregaParada } from './ModalEntregaParada.js';
import { SeccionEntregaOT } from '../ots/SeccionEntregaOT.js';
import { ListaTrabajos } from '../portal/ListasPortal.js';

const parada = { id: 'pa1', orden: 1, tipo: 'PLANIFICADA', estado: 'PENDIENTE', hora_estimada: null, orden_trabajo_id: 'o1', codigo_ot: 'OT-2026-0030', titulo: 'Letrero',
  cliente: 'Farmacia', sucursal: 'Luque', direccion: null, gps_lat: null, gps_lng: null, lleva_remision: true, receptor_nombre: null };
const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);

describe('Loop 17 — constancia de entrega (pantallas)', () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); Object.values(avisos).forEach((f) => f.mockReset()); pendientes = []; });

  it('pide el nombre y la foto de la remisión; manda receptor y cargo, avisando que la foto sigue en el celular', async () => {
    api.enviar.mockResolvedValue({ encolada: false, respuesta: { hoja_finalizada: false } });
    const onHecha = vi.fn();
    const { rerender } = render(<ModalEntregaParada parada={parada} onCerrar={() => {}} onHecha={onHecha} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    expect(avisos.error).toHaveBeenLastCalledWith('Escribí el nombre de quien recibió');
    fireEvent.change(screen.getByLabelText(/Recibió/), { target: { value: 'María Gómez' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'encargada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    expect(avisos.error).toHaveBeenLastCalledWith('Sacale una foto a la remisión firmada');
    fireEvent.click(screen.getByRole('button', { name: 'Foto de la remisión firmada' }));
    await waitFor(() => expect(api.guardar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'REMISION_PARADA', ref: { paradaId: 'pa1' } })));
    pendientes = [{ tipo: 'REMISION_PARADA' }];
    rerender(<ModalEntregaParada parada={parada} onCerrar={() => {}} onHecha={onHecha} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalledWith('Parada hecha: OT-2026-0030', '/api/campo/paradas/pa1/completar',
      { receptorNombre: 'María Gómez', receptorCargo: 'encargada', remisionEnCelular: true }));
    await waitFor(() => expect(onHecha).toHaveBeenCalledWith(false));
  });

  it('OT sin remisión: alcanza el nombre', async () => {
    api.enviar.mockResolvedValue({ encolada: true });
    render(<ModalEntregaParada parada={{ ...parada, lleva_remision: false }} onCerrar={() => {}} onHecha={() => {}} />);
    expect(screen.getByText('Esta OT no lleva remisión.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Recibió/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalledWith(expect.any(String), expect.any(String), { receptorNombre: 'Ana', remisionEnCelular: false }));
    expect(avisos.info).toHaveBeenCalledWith(expect.stringMatching(/sin señal/));
  });

  it('la OT muestra quién recibió, la foto o "todavía no llegó", y lo cargado sin señal', async () => {
    api.entregas.mockResolvedValue({ lleva_remision: true, entregas: [
      { parada_id: 'pa1', hoja_ruta_id: 'h', fecha: '2026-11-17', receptor_nombre: 'María', receptor_cargo: 'encargada', entregada_at: '2026-11-17T13:40:00.000Z',
        sin_senal: false, completada_por: 'Carlos', remision_archivo_id: 'ar1', remision_por_llegar: false },
      { parada_id: 'pa2', hoja_ruta_id: 'h', fecha: '2026-11-17', receptor_nombre: 'Ana', receptor_cargo: null, entregada_at: '2026-11-17T15:00:00.000Z',
        sin_senal: true, completada_por: 'Carlos', remision_archivo_id: null, remision_por_llegar: true },
    ] });
    api.archivos.mockResolvedValue([{ id: 'ar1', url: 'https://x/remision.jpg' }]);
    conQuery(<SeccionEntregaOT otId="o1" />);
    expect(await screen.findByText('María')).toBeTruthy();
    expect((await screen.findByAltText('Remisión firmada')).getAttribute('src')).toBe('https://x/remision.jpg');
    expect(screen.getByText(/todavía no llegó/)).toBeTruthy();
    expect(screen.getByText(/Cargada sin señal/)).toBeTruthy();
    expect((screen.getByLabelText('Esta OT no lleva remisión') as HTMLInputElement).checked).toBe(false);
  });

  it('el portal muestra la entrega (sin foto)', () => {
    render(<ListaTrabajos ots={[{ id: 'o1', codigo_ot: 'OT-2026-0030', titulo: 'Letrero', sucursal: 'Luque', estado: 'TERMINADO', fecha_prometida: null, created_at: '',
      entrega: { entregada_at: '2026-11-17T13:40:00.000Z', receptor_nombre: 'María', receptor_cargo: 'encargada' } }]} />);
    expect(screen.getByText(/Recibió: María \(encargada\)/)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
