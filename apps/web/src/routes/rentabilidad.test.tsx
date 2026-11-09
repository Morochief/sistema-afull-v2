import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PaginaRentabilidad } from '../lib/api-costeo.js';

const datos = vi.hoisted(() => ({ actual: undefined as PaginaRentabilidad | undefined }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../hooks/useListadoUrl.js', () => ({
  useListadoUrl: () => ({ datos: datos.actual, estado: { cargando: false, refrescando: false, error: null }, filtros: { pagina: 1 }, setFiltros: vi.fn(), reintentar: vi.fn() }),
}));

import { RentabilidadPage } from './rentabilidad.js';

const pagina = (resumen: PaginaRentabilidad['resumen']): PaginaRentabilidad => ({ items: [], total: 0, pagina: 1, tamPagina: 25, totalPaginas: 0, resumen });

describe('Rentabilidad — resumen (CA-10.6)', () => {
  it('el costo es el de las OTs con venta y el de las OTs sin presupuesto se muestra aparte', () => {
    datos.actual = pagina({ venta_gs: 1_000_000, costo_gs: 200_000, costo_sin_venta_gs: 120_000, margen_pct: 80 });
    render(<RentabilidadPage />);
    const resumen = screen.getByTestId('resumen-rentabilidad');
    expect(within(resumen).getByText(/200\.000/)).toBeTruthy();
    expect(within(resumen).getByText(/\+ .*120\.000 en OTs sin presupuesto/)).toBeTruthy();
  });

  it('sin OTs sin presupuesto no muestra la línea aparte', () => {
    datos.actual = pagina({ venta_gs: 1_000_000, costo_gs: 200_000, costo_sin_venta_gs: 0, margen_pct: 80 });
    render(<RentabilidadPage />);
    expect(screen.queryByText(/en OTs sin presupuesto/)).toBeNull();
  });
});
