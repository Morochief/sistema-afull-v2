// Desactiva los usuarios de prueba que los tests y las pruebas manuales dejaron activos en `dev`
// y borra sus sesiones. No borra usuarios: tienen auditoría asociada (ON DELETE RESTRICT).
//
// Uso:  pnpm tsx scripts/limpiar-usuarios-prueba.ts            -> solo muestra qué haría (simulación)
//       pnpm tsx scripts/limpiar-usuarios-prueba.ts --aplicar  -> aplica los cambios en una transacción
//
// Alcance (acotado a nombres de prueba, nunca a usuarios reales):
//   - test_xxxxxxxx      helper crearUsuario() anterior a la corrección y pruebas manuales de E1
//   - zz_test_%          convención actual de los tests
//   - u_<n> / u_act_<n>  tests de usuarios.test.ts (password_hash inválido, no pueden entrar)
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: ['.env', '.env.test'] });

const FILTRO = `(
  username ~ '^test_[0-9a-f]{8}$'
  OR username LIKE 'zz\\_test\\_%'
  OR username ~ '^u_(act_)?[0-9]+$'
)`;

async function main() {
  if (process.env.TEST_ENV !== 'dev') {
    throw new Error('Solo se ejecuta contra dev (TEST_ENV=dev). Nunca contra prod.');
  }
  const dbUrl = process.env.DATABASE_URL_ADMIN;
  if (!dbUrl) throw new Error('Falta DATABASE_URL_ADMIN.');
  const aplicar = process.argv.includes('--aplicar');
  console.log(`[limpiar-usuarios-prueba] host=${new URL(dbUrl).host} | modo=${aplicar ? 'APLICAR' : 'simulación'}`);

  const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const resumen = () => sql.unsafe(`
      SELECT count(*)::int AS usuarios,
             count(*) FILTER (WHERE activo)::int AS activos,
             (SELECT count(*)::int FROM sesion s JOIN usuario u2 ON u2.id = s.usuario_id
               WHERE ${FILTRO.replaceAll('username', 'u2.username')}) AS sesiones
      FROM usuario WHERE ${FILTRO}
    `);
    console.log('ANTES  :', JSON.stringify((await resumen())[0]));

    const otros = await sql.unsafe(`
      SELECT username, activo FROM usuario WHERE NOT ${FILTRO} ORDER BY username
    `);
    console.log('No se tocan (fuera del filtro):', JSON.stringify(otros));

    const nombrados = await sql.unsafe(`
      SELECT username, activo,
             (SELECT count(*)::int FROM sesion s WHERE s.usuario_id = u.id) AS sesiones
      FROM usuario u WHERE username IN ('test_5d569293', 'test_d228ef57') ORDER BY username
    `);
    console.log('Usuarios de las pruebas P3/P4:', JSON.stringify(nombrados));

    if (!aplicar) {
      console.log('Simulación: no se modificó nada. Repetir con --aplicar.');
      return;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM sesion WHERE usuario_id IN (SELECT id FROM usuario WHERE ${FILTRO})`);
      await tx.unsafe(`UPDATE usuario SET activo = false WHERE activo AND ${FILTRO}`);
    });
    console.log('DESPUÉS:', JSON.stringify((await resumen())[0]));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
