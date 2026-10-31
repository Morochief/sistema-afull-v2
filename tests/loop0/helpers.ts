import postgres from 'postgres';

if (process.env.TEST_ENV !== 'dev') {
  throw new Error('Tests de seguridad solo corren en dev (TEST_ENV=dev).');
}

export const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 2, prepare: false });
export const api = postgres(process.env.DATABASE_URL_API!, { max: 15, prepare: false });
export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export async function cerrarConexiones() {
  await Promise.all([admin.end(), api.end()]);
}
