import postgres from 'postgres';

if (process.env.TEST_ENV !== 'dev') {
  throw new Error('Tests de seguridad solo corren en dev (TEST_ENV=dev).');
}

export const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 2, prepare: false });
export const api = postgres(process.env.DATABASE_URL_API!, { max: 15, prepare: false });
export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Usuarios creados con crearUsuario() en el archivo de test actual. Al cerrar se desactivan
// y se borran sus sesiones, para que en `dev` no queden cuentas activas con la clave de prueba.
const usuariosDePrueba = new Set<string>();

export function registrarUsuarioDePrueba(id: string) {
  usuariosDePrueba.add(id);
}

export async function desactivarUsuariosDePrueba() {
  const ids = [...usuariosDePrueba];
  if (ids.length === 0) return;
  await admin`UPDATE usuario SET activo = false WHERE id = ANY(${ids}::uuid[])`;
  await admin`DELETE FROM sesion WHERE usuario_id = ANY(${ids}::uuid[])`;
  usuariosDePrueba.clear();
}

export async function cerrarConexiones() {
  try {
    await desactivarUsuariosDePrueba();
  } finally {
    await Promise.all([admin.end(), api.end()]);
  }
}
