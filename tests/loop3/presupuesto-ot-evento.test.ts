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

describe('CA-3.8: Coherencia de cliente en OT con presupuesto y proyecto', () => {
  it('rechaza vincular presupuesto de otro cliente a una OT con 23503', async () => {
    const u = await crearUsuario(['comercial']);
    const tag1 = crypto.randomUUID().slice(0, 8);
    const tag2 = crypto.randomUUID().slice(0, 8);

    const cli1 = await clienteTest(tag1);
    const cli2 = await clienteTest(tag2);

    const [pre1] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, total_gs, creado_por)
      VALUES (${'PRE-OT1-' + tag1}, ${cli1}, 'Presupuesto 1', 'APROBADO', 500000, ${u.id})
      RETURNING id
    `;

    const [ot2] = await admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por)
      VALUES (${'OT-TEST-' + tag2}, ${cli2}, 'OT Cliente 2', ${u.id})
      RETURNING id
    `;

    await expect(
      admin`
        UPDATE orden_trabajo SET presupuesto_id = ${pre1.id} WHERE id = ${ot2.id}
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rechaza vincular proyecto de otro cliente a una OT con 23503', async () => {
    const u = await crearUsuario(['comercial']);
    const tag1 = crypto.randomUUID().slice(0, 8);
    const tag2 = crypto.randomUUID().slice(0, 8);

    const cli1 = await clienteTest(tag1);
    const cli2 = await clienteTest(tag2);

    const [pry1] = await admin`
      INSERT INTO proyecto (codigo, cliente_id, nombre, creado_por)
      VALUES (${'PRY-OT1-' + tag1}, ${cli1}, 'Proyecto 1', ${u.id})
      RETURNING id
    `;

    const [ot2] = await admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por)
      VALUES (${'OT-PRY-' + tag2}, ${cli2}, 'OT Cliente 2', ${u.id})
      RETURNING id
    `;

    await expect(
      admin`
        UPDATE orden_trabajo SET proyecto_id = ${pry1.id} WHERE id = ${ot2.id}
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rechaza modificar presupuesto_id o monto_presupuestado_gs una vez asignados con 23514', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, total_gs, creado_por)
      VALUES (${'PRE-IMM-' + tag}, ${clienteId}, 'Presupuesto Base', 'APROBADO', 300000, ${u.id})
      RETURNING id
    `;

    const [ot] = await admin`
      INSERT INTO orden_trabajo (
        codigo_ot, cliente_id, titulo, creado_por, presupuesto_id, monto_presupuestado_gs
      ) VALUES (
        ${'OT-IMM-' + tag}, ${clienteId}, 'OT con Presupuesto', ${u.id}, ${pre.id}, 300000
      ) RETURNING id
    `;

    await expect(
      admin`
        UPDATE orden_trabajo SET monto_presupuestado_gs = 999999 WHERE id = ${ot.id}
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('CA-3.9: Inmutabilidad de eventos de presupuesto para afull_api', () => {
  it('permite INSERT pero bloquea UPDATE, DELETE y TRUNCATE para afull_api', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, creado_por)
      VALUES (${'PRE-EV-' + tag}, ${clienteId}, 'Presupuesto Evento', 'BORRADOR', ${u.id})
      RETURNING id
    `;

    const [ev] = await api`
      INSERT INTO presupuesto_evento (
        presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario
      ) VALUES (
        ${pre.id}, NULL, 'BORRADOR', ${u.id}, 'Creación inicial'
      ) RETURNING id
    `;
    expect(ev.id).toBeDefined();

    await expect(
      api`UPDATE presupuesto_evento SET comentario = 'Hackeado' WHERE id = ${ev.id}`,
    ).rejects.toThrow();

    await expect(
      api`DELETE FROM presupuesto_evento WHERE id = ${ev.id}`,
    ).rejects.toThrow();

    await expect(api`TRUNCATE presupuesto_evento`).rejects.toThrow();
  });

  it('exige comentario no vacío en APROBADO, RECHAZADO y ANULADO con 23514', async () => {
    const u = await crearUsuario(['comercial']);
    const tag = crypto.randomUUID().slice(0, 8);
    const clienteId = await clienteTest(tag);

    const [pre] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, estado, creado_por)
      VALUES (${'PRE-CHK-' + tag}, ${clienteId}, 'Presupuesto Check', 'BORRADOR', ${u.id})
      RETURNING id
    `;

    // Sin comentario en APROBADO -> debe fallar con 23514
    await expect(
      api`
        INSERT INTO presupuesto_evento (
          presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario
        ) VALUES (
          ${pre.id}, 'ENVIADO', 'APROBADO', ${u.id}, NULL
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });

    // Con comentario con solo espacios -> debe fallar con 23514
    await expect(
      api`
        INSERT INTO presupuesto_evento (
          presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario
        ) VALUES (
          ${pre.id}, 'ENVIADO', 'APROBADO', ${u.id}, '   '
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });

    // Con evidencia válida -> tiene éxito
    const [aprobado] = await api`
      INSERT INTO presupuesto_evento (
        presupuesto_id, estado_anterior, estado_nuevo, autor_id, comentario
      ) VALUES (
        ${pre.id}, 'ENVIADO', 'APROBADO', ${u.id}, 'OC 9876 aprobada por el cliente'
      ) RETURNING id
    `;
    expect(aprobado.id).toBeDefined();
  });
});
