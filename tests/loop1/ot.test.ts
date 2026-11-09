import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario } from '../loop0/auth-helpers.js';
import { crearOT, transicionar, listarOTs, obtenerDetalleOT } from '../../apps/api/src/modules/comercial/ot.service.js';

afterAll(cerrarConexiones);

async function clienteTest(nombre = 'zz_test_cliente') {
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre)
    VALUES (${'ZZ-' + crypto.randomUUID().slice(0, 8)}, ${nombre}) RETURNING id
  `;
  return c.id as string;
}

describe('CA-1.5: Concurrencia en códigos de OT', () => {
  // Se saltea solo en tests-dev.yml (runner en EE. UU., base en São Paulo): ver el comentario ahí.
  it.skipIf(process.env.LATENCIA_ALTA === '1')('20 creaciones simultáneas generan 20 códigos únicos y correlativos sin huecos', async () => {
    const u = await crearUsuario(['comercial']);
    const clienteId = await clienteTest();
    const ots = await Promise.all(
      Array.from({ length: 20 }, () => crearOT({ usuarioId: u.id }, { clienteId, titulo: 'ot_concurrente' })),
    );
    const nums = ots.map((o) => Number(o!.codigo_ot.split('-')[2])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(20);
    expect(nums[19] - nums[0]).toBe(19);
  });
});

describe('CA-1.4 / CA-1.8: Transiciones y detección de stale data (409)', () => {
  it('dos cambios simultáneos sobre la misma OT: uno gana y el otro recibe 409', async () => {
    const u = await crearUsuario(['comercial']);
    const ctx = { usuarioId: u.id };
    const ot = (await crearOT(ctx, { clienteId: await clienteTest(), titulo: 'ot_carrera' }))!;

    const r = await Promise.allSettled([
      transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'EN_TALLER' }),
      transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'EN_DISENO' }),
    ]);
    const mal = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(mal).toHaveLength(1);
    expect(mal[0].reason).toMatchObject({ status: 409 });

    const ev = await admin`SELECT estado_nuevo FROM ot_evento WHERE orden_trabajo_id = ${ot.id} ORDER BY created_at, id`;
    const [{ estado }] = await admin`SELECT estado FROM orden_trabajo WHERE id = ${ot.id}`;
    expect(ev).toHaveLength(2);
    expect(ev.at(-1)!.estado_nuevo).toBe(estado);
  });

  it('salto inválido rechaza con 400 y cancelar exige motivo', async () => {
    const u = await crearUsuario(['comercial']);
    const ctx = { usuarioId: u.id };
    const ot = (await crearOT(ctx, { clienteId: await clienteTest(), titulo: 'ot_rechazo' }))!;
    await expect(transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'TERMINADO' })).rejects.toMatchObject({ status: 400 });
    await expect(transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'CANCELADO' })).rejects.toMatchObject({ status: 400 });
  });

  it('la base también exige motivo al cancelar (CHECK en ot_evento)', async () => {
    const u = await crearUsuario(['comercial']);
    const ot = (await crearOT({ usuarioId: u.id }, { clienteId: await clienteTest(), titulo: 'ot_check' }))!;
    await expect(admin`
      INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id)
      VALUES (${ot.id}, 'PENDIENTE', 'CANCELADO', ${u.id})
    `).rejects.toMatchObject({ code: '23514' });
  });
});

describe('CA-1.6: Pertenencia de sucursal forzada por la base', () => {
  it('la base rechaza una OT con sucursal de otro cliente con error 23503', async () => {
    const a = await clienteTest('cli_a');
    const b = await clienteTest('cli_b');
    const [s] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng)
      VALUES (${b}, ${'suc_' + Date.now()}, -25.3, -57.6) RETURNING id
    `;
    const u = await crearUsuario();
    await expect(admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, creado_por)
      VALUES (${'OT-FK-' + Date.now()}, ${a}, ${s.id}, 'test_fk', ${u.id})
    `).rejects.toMatchObject({ code: '23503' });
  });
});

describe('CA-1.3: Validación de coordenadas de Paraguay', () => {
  it('la base rechaza coordenadas fuera del polígono paraguayo (error 23514)', async () => {
    const c = await clienteTest();
    await expect(admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng)
      VALUES (${c}, 'suc_invalida', -57.6, -25.3)
    `).rejects.toMatchObject({ code: '23514' });
  });
});

describe('E3.1: Nombres en OTs y búsqueda por nombre de cliente', () => {
  it('buscar por nombre de cliente devuelve sus OTs, el total coincide, escaparLike protege % y trae cliente_nombre', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = Date.now().toString(36);
    const nombreUnico = `zz_test_cli_busq_${tag}`;
    const clienteId = await clienteTest(nombreUnico);

    const [suc] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng, activo)
      VALUES (${clienteId}, ${'suc_' + tag}, -25.3, -57.6, true) RETURNING id
    `;

    const ot = (await crearOT(
      { usuarioId: u.id },
      { clienteId, sucursalId: suc.id, titulo: `Titulo_${tag}` }
    ))!;

    try {
      // (a) Buscar por parte del nombre de cliente devuelve la OT y total coincide
      const res = await listarOTs({ pagina: 1, q: `cli_busq_${tag}` });
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe(ot.id);

      // (c) El ítem trae cliente_nombre y sucursal_nombre
      expect(res.items[0].cliente_nombre).toBe(nombreUnico);
      expect(res.items[0].sucursal_nombre).toBe(`suc_${tag}`);

      // Detalle también trae los nombres
      const det = await obtenerDetalleOT(ot.id);
      expect(det.cliente_nombre).toBe(nombreUnico);
      expect(det.sucursal_nombre).toBe(`suc_${tag}`);

      // (b) Buscar '%' literal no devuelve todo (escaparLike)
      const resPct = await listarOTs({ pagina: 1, q: '%' });
      expect(resPct.total).toBe(0);
    } finally {
      await admin`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    }
  });
});
