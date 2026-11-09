import { MAX_BYTES_IMAGEN, MAX_BYTES_PDF, MIME_PDF, MIMES_IMAGEN } from '@afull/shared';

/** Lado mayor de las fotos que se suben: alcanza para leer un odómetro o ver un montaje, y pesa ~200-400 KB. */
export const LADO_MAX = 1600;
const CALIDAD = 0.8;

/** Medidas para achicar sin deformar; nunca agranda. */
export function medidasReducidas(ancho: number, alto: number, max = LADO_MAX) {
  const f = Math.min(1, max / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}

const esImagenAceptada = (t: string) => (MIMES_IMAGEN as readonly string[]).includes(t);

/**
 * Deja el archivo listo para subir: las fotos se achican y pasan a JPEG (el plan gratis trae 1 GB);
 * un PDF va tal cual (solo para comprobantes). Si el navegador no puede achicar, va la original si entra en el tope.
 */
export async function prepararArchivo(archivo: Blob, permitirPdf = false): Promise<{ blob: Blob; mime: string }> {
  if (archivo.type === MIME_PDF) {
    if (!permitirPdf) throw new Error('Acá solo van fotos');
    if (archivo.size > MAX_BYTES_PDF) throw new Error('El PDF supera los 10 MB');
    return { blob: archivo, mime: MIME_PDF };
  }
  if (!archivo.type.startsWith('image/')) throw new Error(permitirPdf ? 'Solo fotos o PDF' : 'Solo fotos');
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const { ancho, alto } = medidasReducidas(bmp.width, bmp.height);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext('2d')!.drawImage(bmp, 0, 0, ancho, alto);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', CALIDAD));
    if (blob) return { blob, mime: 'image/jpeg' };
  } catch {
    /* navegador viejo o formato raro: se intenta con la original */
  }
  if (esImagenAceptada(archivo.type) && archivo.size <= MAX_BYTES_IMAGEN) return { blob: archivo, mime: archivo.type };
  throw new Error('No se pudo preparar la foto: probá sacarla de nuevo');
}
