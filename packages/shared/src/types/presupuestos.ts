import type { EstadoPresupuesto, ConceptoItemPresupuesto, EstadoProyecto } from '../machines/presupuesto.js';

export type ProyectoFila = {
  id: string;
  codigo: string;
  cliente_id: string;
  cliente_nombre?: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  creado_por: string;
  created_at: string;
  updated_at: string;
};

export type PresupuestoFila = {
  id: string;
  numero: string;
  version: number;
  cliente_id: string;
  cliente_nombre: string;
  titulo: string;
  notas: string | null;
  margen_pct: number;
  validez_dias: number;
  estado: EstadoPresupuesto;
  total_gs: number | null; // precio sin IVA
  iva_gs: number | null; // IVA 10 % aparte
  precio_final_gs: number | null; // precio sin IVA redondeado a mano (borrador)
  enviado_at: string | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
};

export type PresupuestoItemFila = {
  id: string;
  presupuesto_id: string;
  cliente_id: string;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  orden: number;
  concepto: ConceptoItemPresupuesto;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario_gs: number;
  subtotal_gs?: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type PresupuestoEventoFila = {
  id: string;
  presupuesto_id: string;
  estado_anterior: EstadoPresupuesto | null;
  estado_nuevo: EstadoPresupuesto;
  autor_id: string;
  autor_nombre?: string;
  comentario: string | null;
  created_at: string;
};

export type PresupuestoDetalle = PresupuestoFila & {
  items: PresupuestoItemFila[];
  eventos: PresupuestoEventoFila[];
  versiones: {
    id: string;
    version: number;
    estado: EstadoPresupuesto;
    total_gs: number | null;
    created_at: string;
  }[];
};

export type ProyectoDetalle = ProyectoFila & {
  ordenes_trabajo: {
    id: string;
    codigo_ot: string;
    titulo: string;
    estado: string;
    monto_presupuestado_gs: number | null;
    sucursal_id: string | null;
    sucursal_nombre: string | null;
  }[];
  total_presupuestado_gs: number;
};

export const CLAVES_PRESUPUESTO_FILA = [
  'id',
  'numero',
  'version',
  'cliente_id',
  'cliente_nombre',
  'titulo',
  'notas',
  'margen_pct',
  'validez_dias',
  'estado',
  'total_gs',
  'iva_gs',
  'precio_final_gs',
  'enviado_at',
  'creado_por',
  'created_at',
  'updated_at',
] as const;

export const CLAVES_PROYECTO_FILA = [
  'id',
  'codigo',
  'cliente_id',
  'nombre',
  'descripcion',
  'estado',
  'creado_por',
  'created_at',
  'updated_at',
] as const;

export const CLAVES_PRESUPUESTO_ITEM_FILA = [
  'id',
  'presupuesto_id',
  'cliente_id',
  'sucursal_id',
  'orden',
  'concepto',
  'descripcion',
  'cantidad',
  'unidad',
  'precio_unitario_gs',
  'activo',
  'created_at',
  'updated_at',
] as const;
