export function rutaInicialSegunCapacidades(capacidades?: string[]): string {
  const caps = capacidades ?? [];
  const esAdmin = caps.includes('admin');
  const todas = esAdmin
    ? ['admin', 'comercial', 'rrhh', 'taller', 'montaje']
    : caps;

  if (todas.includes('taller') || todas.includes('montaje')) {
    if (!todas.includes('comercial')) {
      return '/mi-trabajo';
    }
  }
  if (todas.includes('rrhh') && !todas.includes('comercial') && !esAdmin) {
    return '/personas';
  }
  return '/clientes';
}

export function sanitizarDestinoVolver(volver?: string, capacidades?: string[]): string {
  if (volver && volver.startsWith('/') && !volver.startsWith('//') && !volver.includes('\\')) {
    return volver;
  }
  return rutaInicialSegunCapacidades(capacidades);
}
