import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListaPedidos } from './ListasPortal.js';
import type { PortalPedido } from '../../lib/api-portal.js';

vi.mock('./FotosPedidoPortal.js', () => ({ FotosPedidoPortal: () => null }));

const pedido = (extra: Partial<PortalPedido>): PortalPedido => ({
  id: crypto.randomUUID(), numero: 'PED-2026-0001', sucursal: 'Casa central', descripcion: 'Cambiar la lona', foto_url: null,
  estado: 'CONVERTIDO', motivo_descarte: null, created_at: '2026-11-09T12:00:00Z',
  codigo_ot: null, estado_ot: null, presupuesto_numero: null, presupuesto_estado: null, fotos: 0, ...extra,
});

describe('ListaPedidos — el cliente sigue su pedido (L9.E2, CA-9.6 a CA-9.8)', () => {
  it('pedido que pasó por presupuesto aprobado: muestra el estado de la OT, no "Presupuestando"', () => {
    render(<ListaPedidos token="t" onCambio={() => undefined} pedidos={[pedido({ presupuesto_numero: 'PRE-2026-0003', presupuesto_estado: 'APROBADO', codigo_ot: 'OT-2026-0009', estado_ot: 'EN_TALLER' })]} />);
    expect(screen.getByText('En producción')).toBeTruthy();
    expect(screen.getByText('Trabajo OT-2026-0009')).toBeTruthy();
    expect(screen.queryByText('Presupuestando')).toBeNull();
  });

  it('presupuesto todavía sin respuesta: "Presupuestando"', () => {
    render(<ListaPedidos token="t" onCambio={() => undefined} pedidos={[pedido({ presupuesto_numero: 'PRE-2026-0003', presupuesto_estado: 'ENVIADO' })]} />);
    expect(screen.getByText('Presupuestando')).toBeTruthy();
  });

  it('presupuesto rechazado: "No se realizará"', () => {
    render(<ListaPedidos token="t" onCambio={() => undefined} pedidos={[pedido({ presupuesto_numero: 'PRE-2026-0003', presupuesto_estado: 'RECHAZADO' })]} />);
    expect(screen.getByText('No se realizará')).toBeTruthy();
  });

  it('OT directa (sin presupuesto): muestra el estado de la OT', () => {
    render(<ListaPedidos token="t" onCambio={() => undefined} pedidos={[pedido({ codigo_ot: 'OT-2026-0010', estado_ot: 'TERMINADO' })]} />);
    expect(screen.getByText('Terminado')).toBeTruthy();
  });
});
