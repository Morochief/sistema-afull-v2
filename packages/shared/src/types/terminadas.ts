/** Loop 15 — lo que ya terminó el operario (Mi trabajo → Terminadas). Sin montos. */
export interface MiTrabajoTerminada {
  tarea_id: string;
  ot_id: string;
  ot_codigo: string;
  cliente_nombre: string;
  descripcion: string;
  tipo: string;
  terminada_at: string;
  /** Su tiempo en la tarea (con su fracción de tanda y la hora corregida). */
  segundos: number;
  cantidad: number | null;
  unidad: string | null;
}
export interface MiTrabajoTerminadas {
  items: MiTrabajoTerminada[];
  total: number;
  pagina: number;
  tamPagina: number;
  totalPaginas: number;
  /** Todas sus horas del período (terminadas o no). */
  horas_periodo_segundos: number;
}
