/** Loop 14 — panel de Gerardo. Sin montos ni tarifas. */
interface PanelBase {
  persona_id: string;
  nombre: string;
  /** Hora de la última marcación de hoy (entrada o salida), si hubo. */
  marcada_at: string | null;
}
export interface PanelTrabajando extends PanelBase {
  tarea_id: string;
  tarea_descripcion: string;
  ot_id: string;
  ot_codigo: string;
  cliente_nombre: string;
  /** Inicio del tramo abierto (el reloj corre en el navegador). */
  desde: string;
  /** Marcó salida con el reloj todavía abierto. */
  salio: boolean;
}
export interface PanelEnPausa extends PanelBase {
  tarea_id: string;
  tarea_descripcion: string;
  ot_codigo: string;
  cliente_nombre: string;
  motivo: string;
  desde: string;
}
export interface PanelSinTarea extends PanelBase {
  pendientes_hoy: number;
}
export type PanelSinMarcar = PanelBase;
export interface PanelRespuesta {
  servidor_ahora: string;
  trabajando: PanelTrabajando[];
  en_pausa: PanelEnPausa[];
  sin_tarea: PanelSinTarea[];
  sin_marcar: PanelSinMarcar[];
}

