import type { EstadoOT } from '../machines/ot.js';
import type { TipoTarea, EstadoTarea } from '../machines/tarea.js';

export type Pagina<T> = {
  items: T[];
  total: number;
  pagina: number;
  tamPagina: number;
  totalPaginas: number;
};

export type UsuarioSesion = {
  id: string;
  username: string;
  capacidades: string[];
};

export type ClienteFila = {
  id: string;
  codigo: string;
  nombre: string;
  razon_social: string | null;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type SucursalFila = {
  id: string;
  cliente_id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  gps_lat: string;
  gps_lng: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactoFila = {
  id: string;
  cliente_id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  es_principal: boolean;
  activo: boolean;
  created_at: string;
};

export type MarcaFila = {
  id: string;
  cliente_id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
};

export type ClienteDetalle = ClienteFila & {
  sucursales: SucursalFila[];
  contactos: ContactoFila[];
  marcas: MarcaFila[];
};

export type OTFila = {
  id: string;
  codigo_ot: string;
  cliente_id: string;
  cliente_nombre: string;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoOT;
  fecha_prometida: string | null;
  created_at: string;
  updated_at: string;
};

export type OTEvento = {
  id: string;
  orden_trabajo_id: string;
  estado_anterior: EstadoOT | null;
  estado_nuevo: EstadoOT;
  autor_id: string;
  comentario: string | null;
  created_at: string;
};

export type OTDetalle = OTFila & {
  creado_por: string;
  creado_por_nombre: string;
  presupuesto_id: string | null; presupuesto_numero: string | null; presupuesto_version: number | null;
  proyecto_id: string | null; proyecto_codigo: string | null;
  monto_presupuestado_gs: number | null;
  /** Hoja de ruta de la OT (Loop 11). */
  hoja_estado: 'BORRADOR' | 'ACTIVA' | 'CERRADA';
  hoja_notas: string | null;
  hoja_activada_at: string | null;
  hoja_whatsapp_at: string | null;
  hoja_cerrada_at: string | null;
  eventos: OTEvento[];
};

export const CLAVES_CLIENTE_FILA = [
  'id', 'codigo', 'nombre', 'razon_social', 'ruc', 'telefono', 'email', 'activo', 'created_at', 'updated_at'
] as const;

export const CLAVES_SUCURSAL_FILA = [
  'id', 'cliente_id', 'nombre', 'ciudad', 'direccion', 'gps_lat', 'gps_lng', 'activo', 'created_at', 'updated_at'
] as const;

export const CLAVES_CONTACTO_FILA = [
  'id', 'cliente_id', 'nombre', 'cargo', 'telefono', 'email', 'es_principal', 'activo', 'created_at'
] as const;

export const CLAVES_MARCA_FILA = [
  'id', 'cliente_id', 'nombre', 'activo', 'created_at'
] as const;

export const CLAVES_CLIENTE_DETALLE = [
  ...CLAVES_CLIENTE_FILA, 'sucursales', 'contactos', 'marcas'
] as const;

export const CLAVES_OT_FILA = [
  'id', 'codigo_ot', 'cliente_id', 'cliente_nombre', 'sucursal_id', 'sucursal_nombre', 'titulo', 'descripcion', 'estado', 'fecha_prometida', 'created_at', 'updated_at'
] as const;

export const CLAVES_OT_DETALLE = [
  ...CLAVES_OT_FILA, 'creado_por', 'creado_por_nombre', 'presupuesto_id', 'presupuesto_numero',
  'presupuesto_version', 'proyecto_id', 'proyecto_codigo', 'monto_presupuestado_gs', 'eventos',
  'hoja_estado', 'hoja_notas', 'hoja_activada_at', 'hoja_whatsapp_at', 'hoja_cerrada_at',
] as const;

export const CLAVES_OT_EVENTO = [
  'id', 'orden_trabajo_id', 'estado_anterior', 'estado_nuevo', 'autor_id', 'comentario', 'created_at'
] as const;

export type PersonaFila = {
  id: string;
  nombre: string;
  ci: string;
  cargo: string | null;
  departamento: string | null;
  jefe_id: string | null;
  activo: boolean;
  usuario_id: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonaAsignable = {
  id: string;
  nombre: string;
};

export type TarifaFila = {
  id: string;
  persona_id: string;
  tarifa_hora_gs: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  created_at: string;
  updated_at: string;
};

export const CLAVES_PERSONA_FILA = [
  'id', 'nombre', 'ci', 'cargo', 'departamento', 'jefe_id', 'activo', 'usuario_id', 'username', 'created_at', 'updated_at'
] as const;

export const CLAVES_PERSONA_ASIGNABLE = [
  'id', 'nombre'
] as const;

export const CLAVES_TARIFA_FILA = [
  'id', 'persona_id', 'tarifa_hora_gs', 'fecha_inicio', 'fecha_fin', 'created_at', 'updated_at'
] as const;

export type TareaFila = {
  id: string;
  orden_trabajo_id: string;
  persona_asignada_id: string | null;
  persona_asignada_nombre: string | null;
  tipo: TipoTarea;
  descripcion: string;
  orden_secuencia: number;
  estado: EstadoTarea;
  minutos_trabajados: number;
  fecha_trabajo: string | null;
  cantidad: number | null;
  unidad: string | null;
  minutos_estimados: number | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
};

export type TareaEventoFila = {
  id: string;
  tarea_id: string;
  estado_anterior: EstadoTarea | null;
  estado_nuevo: EstadoTarea;
  autor_id: string;
  comentario: string | null;
  created_at: string;
};

export type MiTrabajoTarea = {
  id: string;
  orden_trabajo_id: string;
  codigo_ot: string;
  ot_titulo: string;
  cliente_nombre: string;
  tipo: TipoTarea;
  descripcion: string;
  estado: EstadoTarea;
  minutos_trabajados_hoy: number;
  fecha_trabajo: string | null;
  cantidad: number | null;
  unidad: string | null;
  minutos_estimados: number | null;
  /** Segundos de los tramos CERRADOS de esta persona en esta tarea, de todos los días (L2.E5). */
  segundos_acumulados: number;
  intervalo_abierto: {
    id: string;
    hora_inicio: string;
  } | null;
  /** Loop 12: si es la tarea principal de una tanda abierta, las tareas que reparte (la principal primero). */
  tanda: { id: string; tareas: { tarea_id: string; orden_trabajo_id: string; codigo_ot: string; cliente_nombre: string; m2: number }[] } | null;
  updated_at: string;
};

export type MiTrabajoRespuesta = {
  servidor_ahora: string;
  persona: {
    id: string;
    nombre: string;
  };
  intervalo_abierto_actual: {
    tarea_id: string;
    intervalo_id: string;
    hora_inicio: string;
  } | null;
  minutos_hoy_total: number;
  tareas: MiTrabajoTarea[];
};

export const CLAVES_TAREA_FILA = [
  'id',
  'orden_trabajo_id',
  'persona_asignada_id',
  'persona_asignada_nombre',
  'tipo',
  'descripcion',
  'orden_secuencia',
  'estado',
  'minutos_trabajados',
  'fecha_trabajo',
  'cantidad',
  'unidad',
  'minutos_estimados',
  'creado_por',
  'created_at',
  'updated_at',
] as const;
