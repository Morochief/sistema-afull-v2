import { config } from 'dotenv';
import postgres from 'postgres';
import { hashearPassword } from '../apps/api/src/modules/auth/password.js';
import { formatearFechaDate } from '../apps/web/src/lib/fechas.js';

config({ path: ['.env', '.env.test'] });

const VERCEL_URL = 'https://sistema-afull-v2-api.vercel.app';

async function main() {
  if (process.env.TEST_ENV !== 'dev') {
    throw new Error('Solo corre en dev (TEST_ENV=dev).');
  }

  const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 2, prepare: false });
  let usuarioId = '';
  let cookieSession = '';

  console.log('================================================================');
  console.log('INICIANDO PRUEBA DE HUMO (9 PUNTOS) EN VERCEL (ENTREGA E3)');
  console.log(`Destino: ${VERCEL_URL}`);
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------
    // PUNTO 1: Login
    // -------------------------------------------------------------
    console.log('--- PUNTO 1: Login en Vercel ---');
    const username = 'zz_test_u_' + crypto.randomUUID().slice(0, 8);
    const passHash = await hashearPassword('Password123!');
    const [u] = await sql`
      INSERT INTO usuario (username, password_hash, activo)
      VALUES (${username}, ${passHash}, true)
      RETURNING id, username
    `;
    usuarioId = u.id;
    await sql`INSERT INTO permiso_capacidad (usuario_id, capacidad) VALUES (${u.id}, 'comercial'), (${u.id}, 'admin')`;

    const resLogin = await fetch(`${VERCEL_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: VERCEL_URL,
      },
      body: JSON.stringify({ username, password: 'Password123!' }),
    });

    console.log(`Status login: ${resLogin.status}`);
    if (resLogin.status !== 200) {
      throw new Error(`Login falló con status ${resLogin.status}: ${await resLogin.text()}`);
    }

    const setCookie = resLogin.headers.get('set-cookie');
    if (!setCookie || !setCookie.includes('afull_session=')) {
      throw new Error('Cookie afull_session no encontrada en headers.');
    }
    cookieSession = setCookie.split(';')[0];
    console.log(`[P1 OK] Usuario "${username}" autenticado. Cookie obtenida.`);

    const headersAutenticado = {
      'content-type': 'application/json',
      origin: VERCEL_URL,
      cookie: cookieSession,
    };

    // -------------------------------------------------------------
    // PUNTO 2: Crear cliente
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 2: Crear cliente comercial ---');
    const sufijo = crypto.randomUUID().slice(0, 6);
    const cliNombre = `zz_test_cli_smoke_${sufijo}`;
    const rucRandom = `800${Math.floor(100000 + Math.random() * 900000)}-1`;

    const resCrearCli = await fetch(`${VERCEL_URL}/api/clientes`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        nombre: cliNombre,
        razonSocial: 'Smoke Test S.A.',
        ruc: rucRandom,
      }),
    });

    console.log(`Status crear cliente: ${resCrearCli.status}`);
    if (resCrearCli.status !== 201) {
      throw new Error(`Crear cliente falló: ${await resCrearCli.text()}`);
    }
    const clienteCreado = await resCrearCli.json();
    console.log(`[P2 OK] Cliente creado: ID=${clienteCreado.id}, Código=${clienteCreado.codigo}, Nombre=${clienteCreado.nombre}`);

    // -------------------------------------------------------------
    // PUNTO 3: Editar cliente y provocar 409 visible con dos peticiones
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 3: Edición de cliente y detección de 409 (concurrencia) ---');
    const updatedAtOriginal = clienteCreado.updated_at;

    // Pestaña 1 edita con éxito
    const resEdit1 = await fetch(`${VERCEL_URL}/api/clientes/${clienteCreado.id}`, {
      method: 'PATCH',
      headers: headersAutenticado,
      body: JSON.stringify({
        nombre: `${cliNombre}_edit1`,
        updatedAt: updatedAtOriginal,
      }),
    });
    console.log(`Status Pestaña 1 (editar OK): ${resEdit1.status}`);
    const clienteEdit1 = await resEdit1.json();
    console.log(`Nuevo updatedAt del servidor: ${clienteEdit1.updated_at}`);

    // Pestaña 2 intenta editar con el updatedAt viejo (stale)
    const resEdit2 = await fetch(`${VERCEL_URL}/api/clientes/${clienteCreado.id}`, {
      method: 'PATCH',
      headers: headersAutenticado,
      body: JSON.stringify({
        nombre: `${cliNombre}_edit2`,
        updatedAt: updatedAtOriginal,
      }),
    });
    console.log(`Status Pestaña 2 (concurrencia 409): ${resEdit2.status}`);
    const cuerpo409 = await resEdit2.json();
    console.log(`Cuerpo respuesta 409: ${JSON.stringify(cuerpo409)}`);
    if (resEdit2.status !== 409) {
      throw new Error(`Esperaba 409 pero obtuve ${resEdit2.status}`);
    }
    console.log('[P3 OK] Detección de conflicto 409 confirmada en el servidor.');

    // -------------------------------------------------------------
    // PUNTO 4: Desactivar cliente con una OT abierta y ver la advertencia
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 4: Desactivación con advertencia de OT abierta ---');
    // Creamos una OT abierta para este cliente
    const resOTAbierta = await fetch(`${VERCEL_URL}/api/comercial/ot`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        clienteId: clienteCreado.id,
        titulo: 'zz_test_ot_abierta_humo',
      }),
    });
    console.log(`Status crear OT abierta: ${resOTAbierta.status}`);
    const otAbierta = await resOTAbierta.json();
    console.log(`OT abierta creada: ${otAbierta.codigo_ot} (${otAbierta.estado})`);

    // Intentamos desactivar el cliente
    const resDesactivar = await fetch(`${VERCEL_URL}/api/clientes/${clienteCreado.id}/estado`, {
      method: 'PATCH',
      headers: headersAutenticado,
      body: JSON.stringify({
        activo: false,
        updatedAt: clienteEdit1.updated_at,
      }),
    });
    console.log(`Status desactivar cliente: ${resDesactivar.status}`);
    const desactJson = await resDesactivar.json();
    console.log(`Respuesta desactivación: ${JSON.stringify(desactJson)}`);
    if (!desactJson.advertencia || !desactJson.advertencia.includes('abierta')) {
      throw new Error(`Esperaba advertencia de OT abierta pero obtuve: ${desactJson.advertencia}`);
    }
    console.log(`[P4 OK] Advertencia recibida: "${desactJson.advertencia}"`);

    // Reactivamos el cliente para los puntos siguientes
    await fetch(`${VERCEL_URL}/api/clientes/${clienteCreado.id}/estado`, {
      method: 'PATCH',
      headers: headersAutenticado,
      body: JSON.stringify({
        activo: true,
        updatedAt: desactJson.updated_at,
      }),
    });

    // -------------------------------------------------------------
    // PUNTO 5: Crear sucursal con GPS
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 5: Crear sucursal con coordenadas GPS ---');
    const resSuc = await fetch(`${VERCEL_URL}/api/clientes/${clienteCreado.id}/sucursales`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        nombre: 'zz_test_suc_asuncion',
        ciudad: 'Asunción',
        direccion: 'Avda España 123',
        gpsLat: -25.2867,
        gpsLng: -57.647,
      }),
    });
    console.log(`Status crear sucursal: ${resSuc.status}`);
    const sucJson = await resSuc.json();
    console.log(`Sucursal creada: ID=${sucJson.id}, GPS=(${sucJson.gps_lat}, ${sucJson.gps_lng})`);
    if (resSuc.status !== 201) throw new Error('Falló creación de sucursal');
    console.log('[P5 OK] Sucursal creada con GPS válido en Paraguay.');

    // -------------------------------------------------------------
    // PUNTO 6: Crear OT y buscarla por nombre de cliente
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 6: Crear OT y buscar por nombre de cliente ---');
    const resNuevaOT = await fetch(`${VERCEL_URL}/api/comercial/ot`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        clienteId: clienteCreado.id,
        sucursalId: sucJson.id,
        titulo: 'zz_test_letrero_led_humo',
        fechaPrometida: '2026-11-05',
      }),
    });
    console.log(`Status crear OT: ${resNuevaOT.status}`);
    const otCreada = await resNuevaOT.json();
    console.log(`OT creada: ${otCreada.codigo_ot}, cliente_nombre="${otCreada.cliente_nombre}"`);

    // Búsqueda por parte del nombre del cliente
    const fragmentoBusqueda = cliNombre.slice(0, 18);
    const resBusqueda = await fetch(
      `${VERCEL_URL}/api/comercial/ot?q=${encodeURIComponent(fragmentoBusqueda)}`,
      { headers: headersAutenticado }
    );
    console.log(`Status búsqueda: ${resBusqueda.status}`);
    const busquedaJson = await resBusqueda.json();
    console.log(`Resultados encontrados: ${busquedaJson.total}`);
    const encontrada = busquedaJson.items.find((item: any) => item.id === otCreada.id);
    if (!encontrada) {
      throw new Error(`La OT ${otCreada.id} no fue devuelta en la búsqueda por cliente`);
    }
    console.log(`[P6 OK] OT encontrada por nombre de cliente: "${encontrada.cliente_nombre}".`);

    // -------------------------------------------------------------
    // PUNTO 7: Transiciones PENDIENTE -> EN_DISENO -> EN_TALLER y cancelaciones
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 7: Transiciones de OT y validación de cancelación ---');
    // Transición 1: PENDIENTE -> EN_DISENO
    const resT1 = await fetch(`${VERCEL_URL}/api/comercial/ot/${otCreada.id}/transicionar`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        desde: 'PENDIENTE',
        a: 'EN_DISENO',
        comentario: 'Iniciando diseño gráfico',
      }),
    });
    console.log(`Status PENDIENTE -> EN_DISENO: ${resT1.status}`);
    const otT1 = await resT1.json();
    console.log(`Estado actual: ${otT1.estado}`);
    if (otT1.estado !== 'EN_DISENO') throw new Error('Falló transición a EN_DISENO');

    // Transición 2: EN_DISENO -> EN_TALLER
    const resT2 = await fetch(`${VERCEL_URL}/api/comercial/ot/${otCreada.id}/transicionar`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        desde: 'EN_DISENO',
        a: 'EN_TALLER',
        comentario: 'Diseño aprobado, pasa a soldadura',
      }),
    });
    console.log(`Status EN_DISENO -> EN_TALLER: ${resT2.status}`);
    const otT2 = await resT2.json();
    console.log(`Estado actual: ${otT2.estado}`);
    if (otT2.estado !== 'EN_TALLER') throw new Error('Falló transición a EN_TALLER');

    // Creamos segunda OT para probar cancelación
    const resOTParaCancelar = await fetch(`${VERCEL_URL}/api/comercial/ot`, {
      method: 'POST',
      headers: headersAutenticado,
      body: JSON.stringify({
        clienteId: clienteCreado.id,
        titulo: 'zz_test_ot_para_cancelar',
      }),
    });
    const otParaCancelar = await resOTParaCancelar.json();

    // Intentar cancelar sin motivo (debe ser bloqueado por API con 400)
    const resCancelSinMotivo = await fetch(
      `${VERCEL_URL}/api/comercial/ot/${otParaCancelar.id}/transicionar`,
      {
        method: 'POST',
        headers: headersAutenticado,
        body: JSON.stringify({
          desde: 'PENDIENTE',
          a: 'CANCELADO',
        }),
      }
    );
    console.log(`Status cancelar sin motivo: ${resCancelSinMotivo.status}`);
    if (resCancelSinMotivo.status !== 400) {
      throw new Error(`Esperaba 400 al cancelar sin motivo, obtuve: ${resCancelSinMotivo.status}`);
    }
    console.log('Bloqueo verificado: cancelar sin motivo fue rechazado con 400.');

    // Cancelar con motivo (debe tener éxito)
    const resCancelConMotivo = await fetch(
      `${VERCEL_URL}/api/comercial/ot/${otParaCancelar.id}/transicionar`,
      {
        method: 'POST',
        headers: headersAutenticado,
        body: JSON.stringify({
          desde: 'PENDIENTE',
          a: 'CANCELADO',
          comentario: 'Cliente canceló el pedido por presupuesto',
        }),
      }
    );
    console.log(`Status cancelar con motivo: ${resCancelConMotivo.status}`);
    const otCancelada = await resCancelConMotivo.json();
    console.log(`Estado tras cancelación: ${otCancelada.estado}`);
    if (otCancelada.estado !== 'CANCELADO') throw new Error('Falló cancelación con motivo');
    console.log('[P7 OK] Transiciones y validación de cancelación con motivo confirmadas.');

    // -------------------------------------------------------------
    // PUNTO 8: Recargar /ots/<id> (Rewrite SPA en Vercel)
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 8: Recarga directa de ruta SPA /ots/:id ---');
    const resSPA = await fetch(`${VERCEL_URL}/ots/${otCreada.id}`, {
      headers: { accept: 'text/html' },
    });
    console.log(`Status GET /ots/${otCreada.id}: ${resSPA.status}`);
    const contentType = resSPA.headers.get('content-type') || '';
    console.log(`Content-Type: ${contentType}`);
    const htmlSPA = await resSPA.text();
    const contieneRoot = htmlSPA.includes('id="root"') || htmlSPA.includes('vite');
    if (resSPA.status !== 200 || !contieneRoot) {
      throw new Error('La recarga de /ots/:id no devolvió el index.html de la SPA');
    }
    console.log('[P8 OK] Rewrite de SPA funcional en Vercel: /ots/:id sirve index.html con status 200.');

    // -------------------------------------------------------------
    // PUNTO 9: Fecha prometida 05/11/2026 sin desfase
    // -------------------------------------------------------------
    console.log('\n--- PUNTO 9: Verificación de fecha prometida sin desfase (D7) ---');
    const resDetalleOT = await fetch(`${VERCEL_URL}/api/comercial/ot/${otCreada.id}`, {
      headers: headersAutenticado,
    });
    const detalleJson = await resDetalleOT.json();
    console.log(`Valor crudo en JSON: fecha_prometida = "${detalleJson.fecha_prometida}"`);
    const fechaFormateada = formatearFechaDate(detalleJson.fecha_prometida);
    console.log(`Valor formateado en UI (formatearFechaDate): "${fechaFormateada}"`);
    if (fechaFormateada !== '05/11/2026') {
      throw new Error(`Esperaba "05/11/2026" pero obtuve "${fechaFormateada}"`);
    }
    console.log('[P9 OK] Fecha prometida 2026-11-05 se renderiza exactamente como 05/11/2026 sin desfase.');

    console.log('\n================================================================');
    console.log('TODOS LOS 9 PUNTOS DE LA PRUEBA DE HUMO PASARON CON ÉXITO');
    console.log('================================================================\n');
  } finally {
    // Limpieza de datos de prueba
    if (usuarioId) {
      console.log('--- Limpieza final de cuentas y sesiones de prueba ---');
      await sql`UPDATE usuario SET activo = false WHERE id = ${usuarioId}`;
      await sql`DELETE FROM sesion WHERE usuario_id = ${usuarioId}`;
      console.log(`Usuario de prueba ${usuarioId} desactivado y sesiones cerradas.`);
    }
    await sql.end();
  }
}

main().catch((err) => {
  console.error('ERROR EN PRUEBA DE HUMO:', err);
  process.exit(1);
});
