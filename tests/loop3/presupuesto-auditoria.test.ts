import { describe, it, expect, afterAll } from 'vitest';
import { admin, api, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario } from '../loop0/auth-helpers.js';

// Auditoría Claude Code de L3.E1: agujeros del motor que los tests de la entrega no cubrían.
afterAll(cerrarConexiones);

async function base(estado = 'BORRADOR') {
  const u = await crearUsuario(['comercial']);
  const tag = crypto.randomUUID().slice(0, 8);
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre) VALUES (${'ZZ-' + tag}, ${'zz_test_cli_' + tag}) RETURNING id
  `;
  const nuevo = async (numero: string, est: string) => {
    const [p] = await admin`
      INSERT INTO presupuesto (numero, cliente_id, titulo, creado_por)
      VALUES (${numero}, ${c.id}, 'zz_test', ${u.id}) RETURNING id
    `;
    await admin`
      INSERT INTO presupuesto_item (presupuesto_id, cliente_id, concepto, descripcion, cantidad, precio_unitario_gs)
      VALUES (${p.id}, ${c.id}, 'MATERIAL', 'Lona', 1, 100000)
    `;
    if (est !== 'BORRADOR') await admin`UPDATE presupuesto SET estado = ${est}, total_gs = 135000 WHERE id = ${p.id}`;
    return p.id as string;
  };
  const pre = await nuevo('PRE-AUD-' + tag, estado);
  return { u, tag, cliente: c.id as string, pre, nuevo };
}

describe('L3.E1 (auditoría Claude Code) — motor del circuito comercial', () => {
  it('no se puede vaciar presupuesto_id ni monto_presupuestado_gs de una OT (NULL esquivaba el trigger)', async () => {
    const { u, tag, cliente, pre } = await base('APROBADO');
    const [ot] = await admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, titulo, creado_por, presupuesto_id, monto_presupuestado_gs)
      VALUES (${'OT-AUD-' + tag}, ${cliente}, 'zz_test', ${u.id}, ${pre}, 135000) RETURNING id
    `;
    await expect(api`UPDATE orden_trabajo SET presupuesto_id = NULL WHERE id = ${ot.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(api`UPDATE orden_trabajo SET monto_presupuestado_gs = NULL WHERE id = ${ot.id}`).rejects.toMatchObject({ code: '23514' });
  });

  it('un ítem de un presupuesto ENVIADO no se puede mover a un BORRADOR', async () => {
    const { tag, pre, nuevo } = await base('ENVIADO');
    const borrador = await nuevo('PRE-AUD2-' + tag, 'BORRADOR');
    const [item] = await admin`SELECT id FROM presupuesto_item WHERE presupuesto_id = ${pre}`;
    await expect(
      api`UPDATE presupuesto_item SET presupuesto_id = ${borrador}, cantidad = 99 WHERE id = ${item.id}`
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('la cabecera de un presupuesto ENVIADO está congelada (margen, total, título)', async () => {
    const { pre } = await base('ENVIADO');
    await expect(api`UPDATE presupuesto SET margen_pct = 50 WHERE id = ${pre}`).rejects.toMatchObject({ code: '23514' });
    await expect(api`UPDATE presupuesto SET total_gs = 1 WHERE id = ${pre}`).rejects.toMatchObject({ code: '23514' });
    await expect(api`UPDATE presupuesto SET titulo = 'otro' WHERE id = ${pre}`).rejects.toMatchObject({ code: '23514' });
    // La transición de estado sí está permitida.
    await api`UPDATE presupuesto SET estado = 'RECHAZADO' WHERE id = ${pre}`;
  });

  it('un presupuesto en estado final no cambia más (ni de estado)', async () => {
    const { pre } = await base('APROBADO');
    await expect(api`UPDATE presupuesto SET estado = 'ENVIADO' WHERE id = ${pre}`).rejects.toMatchObject({ code: '23514' });
  });

  it('total_gs no puede ser negativo', async () => {
    const { pre } = await base('BORRADOR');
    await expect(api`UPDATE presupuesto SET total_gs = -1 WHERE id = ${pre}`).rejects.toMatchObject({ code: '23514' });
  });

  it('un ítem agregado en paralelo con el envío no queda fuera del total (lock del trigger)', async () => {
    const { cliente, pre } = await base('BORRADOR');
    // El envío toma la cabecera FOR UPDATE y espera; el insert concurrente debe esperar o fallar, nunca colarse.
    const envio = api.begin(async (tx) => {
      await tx`SELECT id FROM presupuesto WHERE id = ${pre} FOR UPDATE`;
      await new Promise((r) => setTimeout(r, 300));
      await tx`UPDATE presupuesto SET estado = 'ENVIADO', total_gs = 135000 WHERE id = ${pre}`;
    });
    await new Promise((r) => setTimeout(r, 50));
    const insercion = api`
      INSERT INTO presupuesto_item (presupuesto_id, cliente_id, concepto, descripcion, cantidad, precio_unitario_gs)
      VALUES (${pre}, ${cliente}, 'MATERIAL', 'tardío', 1, 5)
    `.then(() => null, (e: unknown) => e); // .then dispara la consulta ya (postgres-js es perezoso)
    await envio;
    expect(await insercion).toMatchObject({ code: '23514' });
  });
});
