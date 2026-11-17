import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DisenoVersion, MiTrabajoTarea } from '@afull/shared';

const api = { subirDiseno: vi.fn(), verificarDiseno: vi.fn(), observarDiseno: vi.fn(), aprobarDiseno: vi.fn(), versionesDiseno: vi.fn() };
vi.mock('../../lib/api-disenos.js', () => ({
  subirDiseno: (...a: unknown[]) => api.subirDiseno(...a),
  verificarDiseno: (...a: unknown[]) => api.verificarDiseno(...a),
  observarDiseno: (...a: unknown[]) => api.observarDiseno(...a),
  aprobarDiseno: (...a: unknown[]) => api.aprobarDiseno(...a),
  versionesDiseno: (...a: unknown[]) => api.versionesDiseno(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BotonSubirDiseno } from './BotonSubirDiseno.js';
import { SeccionDisenoOT } from './SeccionDisenoOT.js';

const conQuery = (n: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);
const tarea = (ultimo: MiTrabajoTarea['ultimo_diseno']) => ({ id: 't', orden_trabajo_id: 'ot1', tipo: 'DISENO', ultimo_diseno: ultimo } as MiTrabajoTarea);
const URL = 'https://drive.google.com/file/d/abc/view';

describe('Loop 19 — Nachi en Mi trabajo', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset().mockResolvedValue({ id: 'v', version: 1 })));

  it('sin diseño: carga el enlace con "Ya lo verifiqué" y lo manda verificado', async () => {
    conQuery(<BotonSubirDiseno tarea={tarea(null)} />);
    fireEvent.click(screen.getByRole('button', { name: /Cargar enlace del diseño/ }));
    fireEvent.change(screen.getByLabelText(/Enlace de Google Drive/), { target: { value: URL } });
    fireEvent.click(screen.getByLabelText(/Ya lo verifiqué/));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar diseño' }));
    await waitFor(() => expect(api.subirDiseno).toHaveBeenCalledWith('ot1', { origen: 'DISENADORA', driveUrl: URL, notas: undefined, verificada: true, motivoCambio: undefined }));
  });

  it('con una versión pendiente: muestra el estado y "Marcar como verificado"', async () => {
    conQuery(<BotonSubirDiseno tarea={tarea({ id: 'v2', version: 2, estado: 'PENDIENTE', autoverificada: false, observacion: null })} />);
    expect(screen.getByText('v2 · Por verificar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Marcar como verificado/ }));
    await waitFor(() => expect(api.verificarDiseno).toHaveBeenCalledWith('v2'));
  });

  it('observada por la oficina: muestra el motivo y sube una versión corregida con el motivo del cambio', async () => {
    conQuery(<BotonSubirDiseno tarea={tarea({ id: 'v1', version: 1, estado: 'OBSERVADO', autoverificada: true, observacion: 'El teléfono está mal' })} />);
    expect(screen.getByText(/El teléfono está mal/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Subir versión corregida/ }));
    fireEvent.change(screen.getByLabelText(/Enlace de Google Drive/), { target: { value: URL } });
    fireEvent.change(screen.getByLabelText(/Qué cambió/), { target: { value: 'Corregí el teléfono' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar diseño' }));
    await waitFor(() => expect(api.subirDiseno).toHaveBeenCalledWith('ot1', expect.objectContaining({ motivoCambio: 'Corregí el teléfono', verificada: false })));
  });
});

const version = (extra: Partial<DisenoVersion>): DisenoVersion => ({
  id: 'v1', orden_trabajo_id: 'ot1', version: 1, origen: 'DISENADORA', drive_url: URL, notas: null, subido_por_nombre: 'nachi',
  subido_at: '2026-11-17T13:00:00Z', estado: 'APROBADO', revisado_por_nombre: 'nachi', revisado_at: '2026-11-17T13:05:00Z', observacion: null,
  autoverificada: true, motivo_cambio: null, motivo_anulacion: null, anulada_at: null, observado_por_nombre: null, observado_at: null, ...extra,
});

describe('Loop 19 — la oficina en la OT', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('una aprobada por la diseñadora dice quién la verificó y se puede observar', async () => {
    api.versionesDiseno.mockResolvedValue([version({})]);
    api.observarDiseno.mockResolvedValue({ id: 'v1' });
    conQuery(<SeccionDisenoOT otId="ot1" otFinalizada={false} />);
    expect(await screen.findByText(/Verificó la diseñadora nachi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Observar' }));
    fireEvent.change(screen.getByPlaceholderText(/Qué hay que corregir/), { target: { value: 'Falta el logo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Observar' }));
    await waitFor(() => expect(api.observarDiseno).toHaveBeenCalledWith('v1', 'Falta el logo'));
  });

  it('una aprobada por la oficina no ofrece observar; una anulada muestra el motivo', async () => {
    api.versionesDiseno.mockResolvedValue([
      version({ id: 'v2', version: 2, autoverificada: false, revisado_por_nombre: 'sofi', motivo_cambio: 'Edu vio un error' }),
      version({ id: 'v1', estado: 'ANULADA', revisado_por_nombre: null, revisado_at: null, autoverificada: false, motivo_anulacion: 'Edu vio un error', anulada_at: '2026-11-17T13:10:00Z' }),
    ]);
    conQuery(<SeccionDisenoOT otId="ot1" otFinalizada={false} />);
    expect(await screen.findByText('Anulada')).toBeTruthy();
    expect(screen.getByText(/Anulada: Edu vio un error/)).toBeTruthy();
    expect(screen.getByText(/Por qué cambió: Edu vio un error/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Observar' })).toBeNull();
  });
});
