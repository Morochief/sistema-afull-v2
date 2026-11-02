import { config } from 'dotenv';
import postgres from 'postgres';
import { hashearPassword } from '../apps/api/src/modules/auth/password.js';
import { formatearFechaDate } from '../apps/web/src/lib/fechas.js';
type OTFilaHumo = { id: string; cliente_nombre: string };

config({ path: ['.env', '.env.test'] });
const URL_BASE = 'https://sistema-afull-v2-api.vercel.app';

async function main() {
  if (process.env.TEST_ENV !== 'dev') throw new Error('Solo dev (TEST_ENV=dev).');
  const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 2, prepare: false });
  let uId = '';

  console.log(`=== PRUEBA DE HUMO (9 PUNTOS) EN VERCEL ===\nDestino: ${URL_BASE}`);

  try {
    // 1. Login
    const username = 'zz_test_u_' + crypto.randomUUID().slice(0, 8);
    const passHash = await hashearPassword('Password123!');
    const [u] = await sql`INSERT INTO usuario (username, password_hash, activo) VALUES (${username}, ${passHash}, true) RETURNING id`;
    uId = u.id;
    await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'comercial'), (${u.id}, 'admin')`;

    const rLogin = await fetch(`${URL_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: URL_BASE },
      body: JSON.stringify({ username, password: 'Password123!' }),
    });
    if (rLogin.status !== 200) throw new Error('Login falló');
    const cookie = rLogin.headers.get('set-cookie')?.split(';')[0] || '';
    const h = { 'content-type': 'application/json', origin: URL_BASE, cookie };
    console.log(`[P1 OK] Login exitoso: ${username}`);

    // 2. Crear cliente
    const cliNom = `zz_test_cli_smoke_${crypto.randomUUID().slice(0, 6)}`;
    const rCli = await fetch(`${URL_BASE}/api/clientes`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ nombre: cliNom, razonSocial: 'Smoke S.A.', ruc: `800${Math.floor(100000 + Math.random() * 900000)}-1` }),
    });
    const c = await rCli.json();
    console.log(`[P2 OK] Cliente creado: ${c.codigo} (${c.nombre})`);

    // 3. Editar cliente y 409
    const rE1 = await fetch(`${URL_BASE}/api/clientes/${c.id}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ nombre: `${cliNom}_edit1`, updatedAt: c.updated_at }),
    });
    const cE1 = await rE1.json();
    const rE2 = await fetch(`${URL_BASE}/api/clientes/${c.id}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ nombre: `${cliNom}_edit2`, updatedAt: c.updated_at }),
    });
    if (rE2.status !== 409) throw new Error(`Esperaba 409 pero obtuve ${rE2.status}`);
    console.log('[P3 OK] 409 detectado con éxito ante updatedAt desactualizado.');

    // 4. Desactivar con OT abierta
    await fetch(`${URL_BASE}/api/comercial/ot`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clienteId: c.id, titulo: 'zz_test_ot_abierta' }),
    });
    const rDes = await fetch(`${URL_BASE}/api/clientes/${c.id}/estado`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ activo: false, updatedAt: cE1.updated_at }),
    });
    const dJson = await rDes.json();
    if (!dJson.advertencia?.includes('abierta')) throw new Error('Falta advertencia');
    console.log(`[P4 OK] Advertencia recibida: "${dJson.advertencia}"`);
    await fetch(`${URL_BASE}/api/clientes/${c.id}/estado`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ activo: true, updatedAt: dJson.updated_at }),
    });

    // 5. Crear sucursal con GPS
    const rSuc = await fetch(`${URL_BASE}/api/clientes/${c.id}/sucursales`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ nombre: 'zz_test_suc_asu', ciudad: 'Asunción', gpsLat: -25.2867, gpsLng: -57.647 }),
    });
    const suc = await rSuc.json();
    console.log(`[P5 OK] Sucursal creada con GPS: (${suc.gps_lat}, ${suc.gps_lng})`);

    // 6. Crear OT y buscarla por nombre de cliente
    const rOT = await fetch(`${URL_BASE}/api/comercial/ot`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clienteId: c.id, sucursalId: suc.id, titulo: 'zz_test_letrero_humo', fechaPrometida: '2026-11-05' }),
    });
    const ot = await rOT.json();
    const rBusq = await fetch(`${URL_BASE}/api/comercial/ot?q=${encodeURIComponent(cliNom.slice(0, 16))}`, { headers: h });
    const bJson = await rBusq.json();
    const enc = bJson.items.find((item: OTFilaHumo) => item.id === ot.id);
    if (!enc) throw new Error('OT no encontrada por cliente');
    console.log(`[P6 OK] OT encontrada por cliente: "${enc.cliente_nombre}"`);

    // 7. Transiciones y cancelación
    await fetch(`${URL_BASE}/api/comercial/ot/${ot.id}/transicionar`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ desde: 'PENDIENTE', a: 'EN_DISENO', comentario: 'Diseño' }),
    });
    const rT2 = await fetch(`${URL_BASE}/api/comercial/ot/${ot.id}/transicionar`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ desde: 'EN_DISENO', a: 'EN_TALLER', comentario: 'Taller' }),
    });
    const otT2 = await rT2.json();
    if (otT2.estado !== 'EN_TALLER') throw new Error('Falló a EN_TALLER');

    const rOT2 = await fetch(`${URL_BASE}/api/comercial/ot`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clienteId: c.id, titulo: 'zz_test_para_cancelar' }),
    });
    const ot2 = await rOT2.json();
    const rCSin = await fetch(`${URL_BASE}/api/comercial/ot/${ot2.id}/transicionar`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ desde: 'PENDIENTE', a: 'CANCELADO' }),
    });
    if (rCSin.status !== 400) throw new Error('Esperaba 400 sin motivo');
    const rCCon = await fetch(`${URL_BASE}/api/comercial/ot/${ot2.id}/transicionar`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ desde: 'PENDIENTE', a: 'CANCELADO', comentario: 'Cancelado por presupuesto' }),
    });
    const ot2C = await rCCon.json();
    if (ot2C.estado !== 'CANCELADO') throw new Error('Falló cancelación');
    console.log('[P7 OK] Transiciones PENDIENTE -> EN_DISENO -> EN_TALLER y cancelaciones verificadas.');

    // 8. Rewrite SPA
    const rSPA = await fetch(`${URL_BASE}/ots/${ot.id}`, { headers: { accept: 'text/html' } });
    const html = await rSPA.text();
    if (rSPA.status !== 200 || (!html.includes('id="root"') && !html.includes('vite'))) throw new Error('SPA 404');
    console.log('[P8 OK] Rewrite SPA functional: GET /ots/:id devuelve 200 HTML.');

    // 9. Fecha prometida
    const rDet = await fetch(`${URL_BASE}/api/comercial/ot/${ot.id}`, { headers: h });
    const det = await rDet.json();
    const fFormateada = formatearFechaDate(det.fecha_prometida);
    if (fFormateada !== '05/11/2026') throw new Error(`Fecha incorrecta: ${fFormateada}`);
    console.log(`[P9 OK] Fecha prometida renderizada exactamente como ${fFormateada} sin desfase.`);

    console.log('\n=== LOS 9 PUNTOS PASARON EXITOSAMENTE ===');
  } finally {
    if (uId) {
      await sql`UPDATE usuario SET activo = false WHERE id = ${uId}`;
      await sql`DELETE FROM sesion WHERE usuario_id = ${uId}`;
    }
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
