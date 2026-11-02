import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers.js';
import { crearUsuario, post } from '../loop0/auth-helpers.js';
import { app } from '../../apps/api/src/index.js';
import {
  CLAVES_CLIENTE_FILA,
  CLAVES_CLIENTE_DETALLE,
  CLAVES_SUCURSAL_FILA,
  CLAVES_CONTACTO_FILA,
  CLAVES_MARCA_FILA,
  CLAVES_OT_FILA,
  CLAVES_OT_DETALLE,
  CLAVES_OT_EVENTO,
} from '../../packages/shared/src/index.js';

afterAll(cerrarConexiones);

const ORIGEN = process.env.APP_ORIGIN || 'http://localhost:3000';

async function sesionComercial() {
  const u = await crearUsuario(['comercial']);
  const res = await post('/api/auth/login', { username: u.username, password: 'Password123!' });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { u, cookie };
}

function req(method: string, path: string, cookie: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN, cookie };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Test de Contrato: Verificación de Claves API vs Tipos TypeScript (Loop 1)', () => {
  it('las claves de GET /api/clientes, /api/clientes/:id y /api/comercial/ot/:id coinciden exactamente con @afull/shared', async () => {
    const { cookie } = await sesionComercial();
    const tag = Date.now().toString(36);
    const nombreCliente = `zz_test_contrato_${tag}`;

    // 1. Crear cliente vía API
    const rucUnico = `800${Math.floor(Math.random() * 89999 + 10000)}-1`;
    const resCrear = await req('POST', '/api/clientes', cookie, {
      nombre: nombreCliente,
      razonSocial: 'Contrato S.A.',
      ruc: rucUnico,
      telefono: '021123456',
      email: `${tag}@afull.test`,
    });
    expect(resCrear.status).toBe(201);
    const clienteCreado = await resCrear.json();
    const clienteId = clienteCreado.id;

    try {
      // 2. Verificar claves de GET /api/clientes (ClienteFila)
      const resLista = await req('GET', `/api/clientes?q=${nombreCliente}`, cookie);
      expect(resLista.status).toBe(200);
      const pagina = await resLista.json();
      expect(pagina.items.length).toBeGreaterThan(0);

      const filaReal = pagina.items[0];
      const clavesFilaReal = Object.keys(filaReal).sort();
      const clavesFilaEsperadas = [...CLAVES_CLIENTE_FILA].sort();
      expect(clavesFilaReal).toEqual(clavesFilaEsperadas);

      // 3. Crear sucursal, contacto y marca para el cliente
      const resSuc = await req('POST', `/api/clientes/${clienteId}/sucursales`, cookie, {
        nombre: 'Casa Central',
        ciudad: 'Asunción',
        direccion: 'Av. España 100',
        gpsLat: -25.28,
        gpsLng: -57.63,
      });
      expect(resSuc.status).toBe(201);
      const sucursalCreada = await resSuc.json();

      const resCont = await req('POST', `/api/clientes/${clienteId}/contactos`, cookie, {
        nombre: 'Juan Pérez',
        cargo: 'Gerente',
        telefono: '0981111222',
        email: 'juan@afull.test',
        esPrincipal: true,
      });
      expect(resCont.status).toBe(201);

      const resMarca = await req('POST', `/api/clientes/${clienteId}/marcas`, cookie, {
        nombre: 'Marca Contrato',
      });
      expect(resMarca.status).toBe(201);

      // 4. Verificar claves de GET /api/clientes/:id (ClienteDetalle)
      const resDetalle = await req('GET', `/api/clientes/${clienteId}`, cookie);
      expect(resDetalle.status).toBe(200);
      const detalle = await resDetalle.json();

      const clavesDetalleReal = Object.keys(detalle).sort();
      const clavesDetalleEsperadas = [...CLAVES_CLIENTE_DETALLE].sort();
      expect(clavesDetalleReal).toEqual(clavesDetalleEsperadas);

      // Sub-recursos
      expect(Object.keys(detalle.sucursales[0]).sort()).toEqual([...CLAVES_SUCURSAL_FILA].sort());
      expect(Object.keys(detalle.contactos[0]).sort()).toEqual([...CLAVES_CONTACTO_FILA].sort());
      expect(Object.keys(detalle.marcas[0]).sort()).toEqual([...CLAVES_MARCA_FILA].sort());

      // 5. Crear OT y verificar claves de GET /api/comercial/ot/:id (OTDetalle)
      const resOT = await req('POST', '/api/comercial/ot', cookie, {
        clienteId,
        sucursalId: sucursalCreada.id,
        titulo: 'Letrero Luminoso Contrato',
        descripcion: 'Verificación de contrato de tipos',
        fechaPrometida: '2026-11-20',
      });
      expect(resOT.status).toBe(201);
      const otCreada = await resOT.json();

      // 5.b Verificar claves de GET /api/comercial/ot (OTFila)
      const resOTLista = await req('GET', `/api/comercial/ot?clienteId=${clienteId}`, cookie);
      expect(resOTLista.status).toBe(200);
      const paginaOT = await resOTLista.json();
      expect(paginaOT.items.length).toBeGreaterThan(0);
      const clavesOTFilaReal = Object.keys(paginaOT.items[0]).sort();
      const clavesOTFilaEsperadas = [...CLAVES_OT_FILA].sort();
      expect(clavesOTFilaReal).toEqual(clavesOTFilaEsperadas);

      const resOTDetalle = await req('GET', `/api/comercial/ot/${otCreada.id}`, cookie);
      expect(resOTDetalle.status).toBe(200);
      const otDetalle = await resOTDetalle.json();

      const clavesOTReal = Object.keys(otDetalle).sort();
      const clavesOTEsperadas = [...CLAVES_OT_DETALLE].sort();
      expect(clavesOTReal).toEqual(clavesOTEsperadas);

      // Eventos
      expect(otDetalle.eventos.length).toBeGreaterThan(0);
      const clavesEventoReal = Object.keys(otDetalle.eventos[0]).sort();
      const clavesEventoEsperadas = [...CLAVES_OT_EVENTO].sort();
      expect(clavesEventoReal).toEqual(clavesEventoEsperadas);
    } finally {
      // Desactivar cliente de prueba de forma limpia (sin violar inmutabilidad de auditoría/ot_evento)
      await admin`UPDATE cliente SET activo = false WHERE id = ${clienteId}`;
    }
  });
});
