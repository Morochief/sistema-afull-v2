import { describe, it, expect, afterAll } from 'vitest';
import { admin, api, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario } from '../loop0/auth-helpers.js';

afterAll(cerrarConexiones);

async function clienteTest(tag: string) {
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre)
    VALUES (${'ZZ-' + tag}, ${'zz_test_cli_' + tag}) RETURNING id
  `;
  return c.id as string;
}

async function sucursalTest(clienteId: string, nombre: string) {
  const [s] = await admin`
    INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng)
    VALUES (${clienteId}, ${nombre}, -25.3, -57.6) RETURNING id
  `;
  return s.id as string;
}

describe('CA-3.1: Congelamiento de ítems en estados no borrador', () => {
  it('la base rechaza INSERT de ítems en presupuesto ENVIADO con 23514', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, total_gs, creado_por)
      VALUES (${'PRE-T1-' + tag}, ${clienteId}, 'Presupuesto Enviado', 'ENVIADO', 100000, ${u.id})
      RETURNING id
    `;

    await expect(
      api`
        INSERT INTO presupuesto_item (
          presupuesto_id, cliente_id, orden, concepto, descripcion, cantidad, precio_unitario_gs
        ) VALUES (
          ${pre.id}, ${clienteId}, 1, 'MATERIAL', 'Lona Front', 1, 50000
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('la base rechaza UPDATE de ítems cuando el presupuesto pasó a APROBADO', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, creado_por)
      VALUES (${'PRE-T2-' + tag}, ${clienteId}, 'Presupuesto Borrador', 'BORRADOR', ${u.id})
      RETURNING id
    `;

    const [item] = await api`
      INSERT INTO presupuesto_item (
        presupuesto_id, cliente_id, orden, concepto, descripcion, cantidad, precio_unitario_gs
      ) VALUES (
        ${pre.id}, ${clienteId}, 1, 'MATERIAL', 'Vinilo de corte', 2, 25000
      ) RETURNING id
    `;

    await admin`
      UPDATE presupuesto SET estado = 'APROBADO', total_gs = 50000 WHERE id = ${pre.id}
    `;

    await expect(
      api`
        UPDATE presupuesto_item SET descripcion = 'Vinilo modificado' WHERE id = ${item.id}
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('la base rechaza DELETE físico sobre presupuesto_item (inmutable)', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, creado_por)
      VALUES (${'PRE-T3-' + tag}, ${clienteId}, 'Presupuesto Borrador', 'BORRADOR', ${u.id})
      RETURNING id
    `;

    const [item] = await api`
      INSERT INTO presupuesto_item (
        presupuesto_id, cliente_id, orden, concepto, descripcion, cantidad, precio_unitario_gs
      ) VALUES (
        ${pre.id}, ${clienteId}, 1, 'OTRO', 'Flete inicial', 1, 10000
      ) RETURNING id
    `;

    await expect(api`DELETE FROM presupuesto_item WHERE id = ${item.id}`).rejects.toThrow();
  });
});

describe('CA-3.2: Coherencia de cliente en sucursales de ítem (FK compuesta)', () => {
  it('rechaza con 23503 ítem con sucursal de otro cliente', async () => {
    const u = await crearUsuario(['comercial']);
    const tagA = crypto.randomUUID().slice(0, 8);
    const tagB = crypto.randomUUID().slice(0, 8);

    const cliA = await clienteTest(tagA);
    const sucA = await sucursalTest(cliA, 'Sucursal A');

    const cliB = await clienteTest(tagB);
    const [preB] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, creado_por)
      VALUES (${'PRE-T4-' + tagB}, ${cliB}, 'Presupuesto Cliente B', 'BORRADOR', ${u.id})
      RETURNING id
    `;

    await expect(
      api`
        INSERT INTO presupuesto_item (
          presupuesto_id, cliente_id, sucursal_id, orden, concepto, descripcion, cantidad, precio_unitario_gs
        ) VALUES (
          ${preB.id}, ${cliB}, ${sucA}, 1, 'MATERIAL', 'Letras corpóreas', 1, 120000
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('CA-3.3: Índice parcial de versión viva', () => {
  it('dos versiones vivas del mismo número fallan con 23505', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);
    const numero = 'PRE-VIV-' + tag;

    await admin`
      INSERT INTO presupuesto (numero, version, cliente_id, titulo, estado, creado_por)
      VALUES (${numero}, 1, ${clienteId}, 'Versión 1', 'BORRADOR', ${u.id})
    `;

    await expect(
      admin`
        INSERT INTO presupuesto (numero, version, cliente_id, titulo, estado, total_gs, creado_por)
        VALUES (${numero}, 2, ${clienteId}, 'Versión 2', 'ENVIADO', 150000, ${u.id})
      `,
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('permite nueva versión viva si la anterior pasa a REEMPLAZADO', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);
    const numero = 'PRE-REP-' + tag;

    const [v1] = await admin`
      INSERT INTO presupuesto (numero, version, cliente_id, titulo, estado, total_gs, creado_por)
      VALUES (${numero}, 1, ${clienteId}, 'Versión 1', 'ENVIADO', 200000, ${u.id})
      RETURNING id
    `;

    await admin`UPDATE presupuesto SET estado = 'REEMPLAZADO' WHERE id = ${v1.id}`;

    const [v2] = await admin`
      INSERT INTO presupuesto (numero, version, cliente_id, titulo, estado, creado_por)
      VALUES (${numero}, 2, ${clienteId}, 'Versión 2', 'BORRADOR', ${u.id})
      RETURNING id
    `;
    expect(v2.id).toBeDefined();
  });
});
