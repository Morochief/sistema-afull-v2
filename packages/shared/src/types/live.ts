export interface LiveIntervaloAbierto {
  id: string;
  hora_inicio: string;
  minutos_transcurridos: number;
  tarea: {
    id: string;
    tipo: string;
    descripcion: string;
    orden_trabajo: {
      id: string;
      codigo_ot: string;
      titulo: string;
      cliente_nombre: string;
    };
  };
}

export interface LivePersonaItem {
  persona_id: string;
  nombre: string;
  en_curso: boolean;
  minutos_hoy: number;
  intervalo_abierto: LiveIntervaloAbierto | null;
}

export interface LiveEstadoRespuesta {
  servidor_ahora: string;
  personas: LivePersonaItem[];
}

export const CLAVES_LIVE_ESTADO_RESPUESTA = ['servidor_ahora', 'personas'] as const;
export const CLAVES_LIVE_PERSONA_ITEM = ['persona_id', 'nombre', 'en_curso', 'minutos_hoy', 'intervalo_abierto'] as const;
