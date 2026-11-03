export type UsuarioVinculable = {
  id: string;
  username: string;
  persona_id: string | null;
  capacidades: string[];
};

export const CLAVES_USUARIO_VINCULABLE = [
  'id',
  'username',
  'persona_id',
  'capacidades',
] as const;
