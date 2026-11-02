import type React from 'react';
import type { Pagina } from '@afull/shared';
import type { ErrorApi } from '../../lib/api.js';

export type FiltrosTabla = {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
};

export type Columna<T> = {
  id: string;
  encabezado: string;
  celda: (fila: T) => React.ReactNode;
  ancho?: string;
  alinear?: 'izq' | 'der';
};

export type TablaAdminProps<T> = {
  columnas: Columna<T>[];
  datos: Pagina<T> | undefined;
  estado: { cargando: boolean; refrescando: boolean; error: ErrorApi | null };
  filtros: FiltrosTabla;
  onFiltros: (cambio: Partial<FiltrosTabla>) => void;
  opcionesEstado: { valor: string; etiqueta: string }[];
  claveFila: (fila: T) => string;
  onFilaClick?: (fila: T) => void;
  acciones?: React.ReactNode;
  textoBusqueda: string;
  vacio: { titulo: string; descripcion?: string };
  onReintentar: () => void;
};
