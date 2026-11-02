import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TablaAdmin } from './TablaAdmin.js';
import type { Columna, FiltrosTabla, TablaAdminProps } from './tipos.js';
import { ErrorApi } from '../../lib/api.js';

type FilaPrueba = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
};

const columnas: Columna<FilaPrueba>[] = [
  { id: 'codigo', encabezado: 'Código', celda: (f) => f.codigo },
  { id: 'nombre', encabezado: 'Nombre', celda: (f) => f.nombre },
  { id: 'activo', encabezado: 'Estado', celda: (f) => (f.activo ? 'Activo' : 'Inactivo') },
];

const filasMock: FilaPrueba[] = [
  { id: '1', codigo: 'CLI-01', nombre: 'Cliente Alfa', activo: true },
  { id: '2', codigo: 'CLI-02', nombre: 'Cliente Beta', activo: false },
];

function crearProps(sobrescritas: Partial<TablaAdminProps<FilaPrueba>> = {}): TablaAdminProps<FilaPrueba> {
  const filtros: FiltrosTabla = { pagina: 1, estado: 'todos' };
  return {
    columnas,
    datos: {
      items: filasMock,
      total: 2,
      pagina: 1,
      tamPagina: 25,
      totalPaginas: 1,
    },
    estado: { cargando: false, refrescando: false, error: null },
    filtros,
    onFiltros: vi.fn(),
    opcionesEstado: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'activos', etiqueta: 'Activos' },
      { valor: 'inactivos', etiqueta: 'Inactivos' },
    ],
    claveFila: (f) => f.id,
    textoBusqueda: 'Buscar clientes...',
    vacio: { titulo: 'Sin registros', descripcion: 'No hay clientes' },
    onReintentar: vi.fn(),
    ...sobrescritas,
  };
}

describe('TablaAdmin — Componente de Presentación', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Debounce de 300 ms en el input de búsqueda', () => {
    const onFiltros = vi.fn();
    const props = crearProps({ onFiltros });
    render(<TablaAdmin {...props} />);

    const input = screen.getByLabelText('Buscar en la tabla');

    // Escribir ráfaga rápida
    fireEvent.change(input, { target: { value: 'Alf' } });
    fireEvent.change(input, { target: { value: 'Alfa' } });

    // A los 299 ms no debe haberse llamado
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onFiltros).not.toHaveBeenCalled();

    // A los 300 ms se llama exactamente una vez con pagina: 1
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onFiltros).toHaveBeenCalledTimes(1);
    expect(onFiltros).toHaveBeenCalledWith({ q: 'Alfa', pagina: 1 });

    // Escribir el mismo valor no dispara una llamada redundante
    fireEvent.change(input, { target: { value: 'Alfa' } });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(onFiltros).toHaveBeenCalledTimes(1);

    // Borrar el texto espera también 300 ms
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onFiltros).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFiltros).toHaveBeenCalledTimes(2);
    expect(onFiltros).toHaveBeenLastCalledWith({ q: undefined, pagina: 1 });
  });

  it('2. Cambio de filtro de estado y rango de fechas resetea a pagina 1', () => {
    const onFiltros = vi.fn();
    const props = crearProps({ onFiltros });
    render(<TablaAdmin {...props} />);

    fireEvent.click(screen.getByText('Activos'));
    expect(onFiltros).toHaveBeenCalledWith({ estado: 'activos', pagina: 1 });

    const inputDesde = screen.getByLabelText('Desde fecha');
    fireEvent.change(inputDesde, { target: { value: '2026-01-01' } });
    expect(onFiltros).toHaveBeenCalledWith({ desde: '2026-01-01', pagina: 1 });
  });

  it('3. Estado CARGANDO muestra 8 filas esqueleto con aria-busy', () => {
    const props = crearProps({
      datos: undefined,
      estado: { cargando: true, refrescando: false, error: null },
    });
    render(<TablaAdmin {...props} />);

    const tbody = document.querySelector('tbody[aria-busy="true"]');
    expect(tbody).not.toBeNull();
    const filasEsqueleto = tbody?.querySelectorAll('tr');
    expect(filasEsqueleto?.length).toBe(8);
  });

  it('4. Estado REFRESCANDO mantiene las filas con indicador de actualización', () => {
    const props = crearProps({
      estado: { cargando: false, refrescando: true, error: null },
    });
    render(<TablaAdmin {...props} />);

    expect(screen.getByText('Actualizando...')).toBeDefined();
    expect(screen.getByText('Cliente Alfa')).toBeDefined();
    const tbody = document.querySelector('tbody');
    expect(tbody?.className).toContain('opacity-60');
  });

  it('5. Estado ERROR muestra ErrorApi y botón Reintentar', () => {
    const onReintentar = vi.fn();
    const error = new ErrorApi(500, 'Error interno del servidor de base de datos');
    const props = crearProps({
      estado: { cargando: false, refrescando: false, error },
      onReintentar,
    });
    render(<TablaAdmin {...props} />);

    expect(screen.getByText('Ocurrió un error')).toBeDefined();
    expect(screen.getByText('Error interno del servidor de base de datos')).toBeDefined();

    const btnReintentar = screen.getByRole('button', { name: /reintentar/i });
    fireEvent.click(btnReintentar);
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('6. Estado VACÍO sin filtros vs con filtros', () => {
    // Caso A: Sin filtros
    const propsSinFiltros = crearProps({
      datos: { items: [], total: 0, pagina: 1, tamPagina: 25, totalPaginas: 1 },
      filtros: { pagina: 1, estado: 'todos' },
    });
    const { unmount } = render(<TablaAdmin {...propsSinFiltros} />);
    expect(screen.getByText('Sin registros')).toBeDefined();
    unmount();

    // Caso B: Con filtros activos
    const onFiltros = vi.fn();
    const propsConFiltros = crearProps({
      datos: { items: [], total: 0, pagina: 1, tamPagina: 25, totalPaginas: 1 },
      filtros: { pagina: 1, q: 'Inexistente', estado: 'activos' },
      onFiltros,
    });
    render(<TablaAdmin {...propsConFiltros} />);
    expect(screen.getByText('Sin resultados para estos filtros')).toBeDefined();

    const btnLimpiar = screen.getByRole('button', { name: /limpiar filtros/i });
    fireEvent.click(btnLimpiar);
    expect(onFiltros).toHaveBeenCalledWith({
      q: undefined,
      estado: 'todos',
      desde: undefined,
      hasta: undefined,
      pagina: 1,
    });
  });

  it('7. Paginación: bordes deshabilitados y región aria-live', () => {
    const onFiltros = vi.fn();
    const props = crearProps({
      datos: { items: filasMock, total: 50, pagina: 1, tamPagina: 25, totalPaginas: 2 },
      onFiltros,
    });
    render(<TablaAdmin {...props} />);

    const btnAnterior = screen.getByRole('button', { name: 'Página anterior' });
    const btnSiguiente = screen.getByRole('button', { name: 'Página siguiente' });

    expect(btnAnterior.getAttribute('disabled')).not.toBeNull();
    expect(btnSiguiente.getAttribute('disabled')).toBeNull();

    fireEvent.click(btnSiguiente);
    expect(onFiltros).toHaveBeenCalledWith({ pagina: 2 });

    const regionLive = document.querySelector('[aria-live="polite"]');
    expect(regionLive).not.toBeNull();
    expect(regionLive?.textContent).toContain('50 resultados · página 1 de 2');
  });

  it('8. Página fuera de rango (items vacío con total > 0)', () => {
    const onFiltros = vi.fn();
    const props = crearProps({
      datos: { items: [], total: 30, pagina: 5, tamPagina: 25, totalPaginas: 2 },
      onFiltros,
    });
    render(<TablaAdmin {...props} />);

    expect(screen.getByText(/página fuera de rango/i)).toBeDefined();
    const btnIrUltima = screen.getByRole('button', { name: /ir a la última página/i });
    fireEvent.click(btnIrUltima);
    expect(onFiltros).toHaveBeenCalledWith({ pagina: 2 });
  });

  it('9. Accesibilidad: fila clicable responde a click y tecla Enter', () => {
    const onFilaClick = vi.fn();
    const props = crearProps({ onFilaClick });
    render(<TablaAdmin {...props} />);

    const fila = screen.getByText('Cliente Alfa').closest('tr');
    expect(fila).not.toBeNull();
    expect(fila?.getAttribute('tabIndex')).toBe('0');

    // Click
    fireEvent.click(fila!);
    expect(onFilaClick).toHaveBeenCalledWith(filasMock[0]);

    // Tecla Enter
    fireEvent.keyDown(fila!, { key: 'Enter' });
    expect(onFilaClick).toHaveBeenCalledTimes(2);
  });
});
