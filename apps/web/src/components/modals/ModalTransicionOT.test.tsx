import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalTransicionOT } from './ModalTransicionOT.js';
import type { OTFila } from '@afull/shared';

const otMock: OTFila = {
  id: 'ot-100',
  codigo_ot: 'OT-0001',
  cliente_id: 'cli-1',
  cliente_nombre: 'Cliente Test',
  sucursal_id: null,
  sucursal_nombre: null,
  titulo: 'Letrero Frontlight',
  descripcion: 'Prueba',
  estado: 'PENDIENTE',
  fecha_prometida: '2026-11-05',
  created_at: '2026-11-02T12:00:00.000Z',
  updated_at: '2026-11-02T12:00:00.000Z',
};

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function envolver(elemento: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{elemento}</QueryClientProvider>);
}

describe('ModalTransicionOT', () => {
  it('ofrece solo las transiciones válidas desde el estado actual', () => {
    // Desde PENDIENTE: EN_DISENO, EN_TALLER, CANCELADO
    envolver(
      <ModalTransicionOT
        ot={otMock}
        abierto={true}
        onCerrar={vi.fn()}
      />
    );

    expect(screen.getByTestId('estado-opcion-EN_DISENO')).toBeDefined();
    expect(screen.getByTestId('estado-opcion-EN_TALLER')).toBeDefined();
    expect(screen.getByTestId('estado-opcion-CANCELADO')).toBeDefined();

    expect(screen.queryByTestId('estado-opcion-EN_MONTAJE')).toBeNull();
    expect(screen.queryByTestId('estado-opcion-TERMINADO')).toBeNull();
  });

  it('bloquea la cancelación si no se ingresa comentario obligatorio', async () => {
    const fn = vi.fn();
    globalThis.fetch = fn;

    envolver(
      <ModalTransicionOT
        ot={otMock}
        abierto={true}
        onCerrar={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('estado-opcion-CANCELADO'));
    fireEvent.click(screen.getByText('Confirmar Transición'));

    expect(screen.getByTestId('error-comentario')).toBeDefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('permite cancelar cuando se ingresa un comentario válido', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ...otMock, estado: 'CANCELADO' }),
    });
    globalThis.fetch = fn;

    envolver(
      <ModalTransicionOT
        ot={otMock}
        abierto={true}
        onCerrar={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('estado-opcion-CANCELADO'));
    const textarea = screen.getByPlaceholderText(/Explique el motivo por el cual se cancela/i);
    fireEvent.change(textarea, { target: { value: 'Cliente desistió del trabajo' } });

    fireEvent.click(screen.getByText('Confirmar Transición'));

    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledWith(
        '/api/comercial/ot/ot-100/transicionar',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            desde: 'PENDIENTE',
            a: 'CANCELADO',
            comentario: 'Cliente desistió del trabajo',
          }),
        })
      );
    });
  });

  it('muestra aviso de sin transiciones cuando la OT está en estado final', () => {
    const otTerminada: OTFila = { ...otMock, estado: 'TERMINADO' };
    envolver(
      <ModalTransicionOT
        ot={otTerminada}
        abierto={true}
        onCerrar={vi.fn()}
      />
    );

    expect(screen.getByText('Sin transiciones disponibles')).toBeDefined();
    expect(screen.queryByText('Confirmar Transición')).toBeNull();
  });
});
