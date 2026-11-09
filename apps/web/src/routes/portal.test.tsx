import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalPage } from './portal.js';

const fetchOriginal = globalThis.fetch;
const json = (body: unknown) => ({ ok: true, status: 200, statusText: '', headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
const yo = { cliente: 'Farmacia Demo', para: 'Compras', expira_at: '2027-05-01T00:00:00Z', sucursales: [] };

function montar(pedidos: () => Promise<unknown>) {
  window.location.hash = '#t=' + 'a'.repeat(43);
  globalThis.fetch = vi.fn().mockImplementation((url: string) => (url.includes('/api/portal/yo') ? Promise.resolve(json(yo)) : pedidos())) as typeof fetch;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PortalPage /></QueryClientProvider>);
}

afterEach(() => { globalThis.fetch = fetchOriginal; sessionStorage.clear(); });

describe('Portal del cliente (CA-10.8)', () => {
  it('mientras llegan los pedidos dice "Cargando…" y nunca "Todavía no hiciste pedidos"', async () => {
    montar(() => new Promise(() => undefined)); // la respuesta de pedidos no llega nunca
    expect(await screen.findByText('Farmacia Demo')).toBeTruthy();
    expect(await screen.findByText('Cargando tus pedidos…')).toBeTruthy();
    expect(screen.queryByText('Todavía no hiciste pedidos.')).toBeNull();
  });

  it('cuando llega una lista vacía recién ahí dice "Todavía no hiciste pedidos"', async () => {
    montar(() => Promise.resolve(json({ items: [], total: 0, pagina: 1, tamPagina: 25 })));
    expect(await screen.findByText('Todavía no hiciste pedidos.')).toBeTruthy();
    expect(screen.queryByText('Cargando tus pedidos…')).toBeNull();
  });
});
