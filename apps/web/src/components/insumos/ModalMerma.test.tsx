import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalMerma } from './ModalMerma.js';

function envolver() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(<QueryClientProvider client={qc}><ModalMerma otId="ot-1" onCerrar={() => undefined} /></QueryClientProvider>);
}
const escribir = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe('ModalMerma', () => {
  it('muestra la vista previa con coma decimal: 1,52 × 2 m y 2 piezas de 1 × 1 → 65,8 % aprovechado', () => {
    envolver();
    escribir('Ancho del material (m)', '1,52');
    escribir('Largo usado (m)', '2');
    escribir('Ancho pieza 1', '1');
    escribir('Alto pieza 1', '1');
    escribir('Cantidad pieza 1', '2');
    const r = screen.getByTestId('resultado-merma');
    expect(r.textContent).toContain('3.04 m²');
    expect(r.textContent).toContain('1.04 m²');
    expect(r.textContent).toContain('65.8 %');
  });

  it('avisa si las piezas superan el material', () => {
    envolver();
    escribir('Ancho del material (m)', '1');
    escribir('Largo usado (m)', '1');
    escribir('Ancho pieza 1', '2');
    escribir('Alto pieza 1', '1');
    expect(screen.getByText(/más superficie que el material/)).toBeTruthy();
    expect(screen.queryByTestId('resultado-merma')).toBeNull();
  });
});
