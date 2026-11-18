import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReciboDetalle } from '@afull/shared';

const api = { conSaldo: vi.fn(), crear: vi.fn() };
vi.mock('../../lib/api-cobranzas.js', async (orig) => ({
  ...(await orig<object>()),
  facturasConSaldo: (id: string) => api.conSaldo(id),
  crearRecibo: (d: unknown) => api.crear(d),
}));
vi.mock('../forms/SelectorClienteOT.js', () => ({ SelectorClienteOT: () => <div>selector</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HojaRecibo } from './HojaRecibo.js';
import { ModalNuevoRecibo } from './ModalNuevoRecibo.js';

const recibo: ReciboDetalle = {
  id: 'r1', numero: 'REC-2026-0007', cliente_id: 'c1', cliente_nombre: 'Cliente Demo', fecha: '2026-11-05', importe_gs: 321499, retenciones_gs: 0,
  medio: 'DEBITO_AUTOMATICO', anulado_at: null, retencion_numero: null, banco: 'Itaú', referencia: 'Y36UBBR11A', cobrador_nombre: 'Gerardo Demo',
  created_at: '2026-11-05T12:00:00Z', motivo_anulacion: null, monto_letras: 'trescientos veintiún mil cuatrocientos noventa y nueve guaraníes',
  cliente: { nombre: 'Cliente Demo', ruc: '2178911-8' },
  empresa: { razon_social: 'aFull Demo S.A.', ruc: '80000000-1', direccion: null, ciudad: 'Asunción', telefono: null, email: null },
  aplicaciones: [{ factura_id: 'f1', numero: '001-001-0236175', fecha: '2026-11-01', monto_factura_gs: 321499, monto_gs: 321499 }],
};

describe('Loop 21 — recibo de dinero (pantallas)', () => {
  beforeEach(() => { api.conSaldo.mockReset(); api.crear.mockReset(); });

  it('la hoja tiene lo del recibo de Prosegur: número, RUC, recibimos de, importe en letras, facturas, total y cobrador', () => {
    render(<HojaRecibo r={recibo} />);
    for (const t of ['RECIBO DE DINERO', 'Nº REC-2026-0007', 'RUC: 80000000-1', 'Cliente Demo', '2178911-8', 'Gs. 321.499',
      'trescientos veintiún mil cuatrocientos noventa y nueve guaraníes', '001-001-0236175', 'TOTAL', 'Gerardo Demo', 'Cobrador Autorizado', 'Asunción 05/11/2026']) {
      expect(screen.getAllByText((_, el) => el?.textContent?.trim() === t).length, t).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Débito automático · c\/Banco Itaú · Ref\. Y36UBBR11A/)).toBeTruthy();
    expect(screen.queryByLabelText('Recibo anulado')).toBeNull();
  });

  it('un recibo anulado sale con la marca ANULADO y el motivo', () => {
    render(<HojaRecibo r={{ ...recibo, anulado_at: '2026-11-06T10:00:00Z', motivo_anulacion: 'cheque rechazado' }} />);
    expect(screen.getByLabelText('Recibo anulado')).toBeTruthy();
    expect(screen.getByText(/Motivo: cheque rechazado/)).toBeTruthy();
  });

  it('cobrar desde una factura: trae su saldo, descuenta la retención, muestra letras y no deja pasar el saldo', async () => {
    api.conSaldo.mockResolvedValue([
      { id: 'f1', numero: '001-001-0000001', cliente_id: 'c1', cliente_nombre: 'X', fecha: '2026-11-01', monto_gs: 500000, cobrado_gs: 0, saldo_gs: 500000, estado: 'PENDIENTE', nota: null, motivo_anulacion: null },
      { id: 'f2', numero: '001-001-0000002', cliente_id: 'c1', cliente_nombre: 'X', fecha: '2026-11-02', monto_gs: 300000, cobrado_gs: 100000, saldo_gs: 200000, estado: 'PARCIAL', nota: null, motivo_anulacion: null },
    ]);
    api.crear.mockResolvedValue({ id: 'r9', numero: 'REC-2026-0009' });
    const onCreado = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <ModalNuevoRecibo abierto onCerrar={() => {}} onCreado={onCreado} clienteInicial={{ id: 'c1', nombre: 'X' }} facturaInicial="f1" />
    </QueryClientProvider>);
    await waitFor(() => expect((screen.getByLabelText('Monto 001-001-0000001') as HTMLInputElement).value).toBe('500.000'));
    fireEvent.click(screen.getByLabelText('Cobrar 001-001-0000002'));
    fireEvent.change(screen.getByLabelText('Monto 001-001-0000002'), { target: { value: '250.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir recibo' }));
    expect(await screen.findByText(/le quedan/)).toBeTruthy();
    expect(api.crear).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Monto 001-001-0000002'), { target: { value: '200000' } });
    fireEvent.change(screen.getByLabelText('Retenciones (Gs.)'), { target: { value: '21.000' } });
    expect(screen.getByText('seiscientos setenta y nueve mil guaraníes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir recibo' }));
    await waitFor(() => expect(onCreado).toHaveBeenCalledWith('r9'));
    expect(api.crear.mock.calls[0][0]).toMatchObject({
      clienteId: 'c1', medio: 'TRANSFERENCIA', retencionesGs: 21000,
      aplicaciones: [{ facturaId: 'f1', montoGs: 500000 }, { facturaId: 'f2', montoGs: 200000 }],
    });
  });
});
