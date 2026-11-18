/**
 * Loop 21: el monto del recibo en letras, en guaraníes enteros ("trescientos veintiún mil … guaraníes").
 * Antes de "mil", "millones" y "guaraníes" el uno se apocopa: un, veintiún, treinta y un.
 */
const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const ESPECIALES = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 1 a 999. */
function hastaMil(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto = '';
  if (r >= 10 && r < 30) resto = ESPECIALES[r - 10];
  else if (r >= 30) resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : '');
  else resto = UNIDADES[r];
  return [CENTENAS[c], resto].filter(Boolean).join(' ');
}

/** 1 a 999.999. */
function hastaMillon(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMiles = miles === 0 ? '' : miles === 1 ? 'mil' : `${hastaMil(miles)} mil`;
  return [parteMiles, resto ? hastaMil(resto) : ''].filter(Boolean).join(' ');
}

export function montoEnLetras(monto: number): string {
  if (!Number.isInteger(monto) || monto <= 0 || monto >= 1e15) throw new Error('El monto tiene que ser un entero mayor a 0');
  if (monto === 1) return 'un guaraní';
  const millones = Math.floor(monto / 1e6);
  const resto = monto % 1e6;
  const parteMillones = millones === 0 ? '' : millones === 1 ? 'un millón' : `${hastaMillon(millones)} millones`;
  const texto = [parteMillones, resto ? hastaMillon(resto) : ''].filter(Boolean).join(' ');
  return `${texto}${millones > 0 && resto === 0 ? ' de' : ''} guaraníes`;
}
