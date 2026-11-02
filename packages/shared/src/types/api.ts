import type { EstadoOT } from '../machines/ot.js';

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
  direccion: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  activo: boolean;
  created_at: string;
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
  cliente_nombre?: string;
  sucursal_id: string | null;
  sucursal_nombre?: string | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoOT;
  fecha_prometida: string | null;
  created_at: string;
  updated_at: string;
};

export type OTEvento = {
  id: string;
  ot_id: string;
  estado_anterior: EstadoOT | null;
  estado_nuevo: EstadoOT;
  usuario_id: string;
  comentario: string | null;
  created_at: string;
};

export type OTDetalle = OTFila & {
  creado_por: string;
  eventos: OTEvento[];
};
