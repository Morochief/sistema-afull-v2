/**
 * Acepta formato paraguayo ("150.000", "2,5") y punto decimal ("2.5"); máximo 4 decimales (como la base).
 * Con coma, los puntos son de miles; sin coma, solo son de miles si agrupan de a 3 ("1.500.000").
 */
export const numero = (s: string) => {
  let t = s.trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^\d+(\.\d{1,4})?$/.test(t) ? Number(t) : NaN;
};
