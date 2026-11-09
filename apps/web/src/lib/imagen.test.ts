import { describe, it, expect } from 'vitest';
import { medidasReducidas, prepararArchivo } from './imagen.js';

describe('preparar fotos para subir', () => {
  it('achica al lado mayor sin deformar y nunca agranda', () => {
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasReducidas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('PDF solo donde se permite (comprobantes) y hasta 10 MB; otros tipos se rechazan', async () => {
    const pdf = new Blob([new Uint8Array(100)], { type: 'application/pdf' });
    await expect(prepararArchivo(pdf)).rejects.toThrow(/solo van fotos/);
    expect((await prepararArchivo(pdf, true)).mime).toBe('application/pdf');
    await expect(prepararArchivo(new Blob([new Uint8Array(11 * 1048576)], { type: 'application/pdf' }), true)).rejects.toThrow(/10 MB/);
    await expect(prepararArchivo(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(/Solo fotos/);
  });

  it('si el navegador no puede achicar, va la original si es un formato aceptado y entra en el tope', async () => {
    // jsdom no tiene createImageBitmap: es el caso "navegador que no puede achicar".
    const jpg = new Blob([new Uint8Array(1000)], { type: 'image/jpeg' });
    expect(await prepararArchivo(jpg)).toEqual({ blob: jpg, mime: 'image/jpeg' });
    await expect(prepararArchivo(new Blob([new Uint8Array(10)], { type: 'image/heic' }))).rejects.toThrow(/No se pudo preparar/);
  });
});
