export type HttpStatusError = 400 | 401 | 403 | 404 | 409 | 429;

export class ErrorApp extends Error {
  constructor(public status: HttpStatusError, message: string) {
    super(message);
    this.name = 'ErrorApp';
  }
}

export function traducirErrorPg(e: unknown): never {
  const code = (e as { code?: string }).code;
  if (code === '23505') throw new ErrorApp(409, 'Ya existe un registro con ese valor único');
  if (code === '23503') throw new ErrorApp(400, 'Referencia foránea inválida o inexistente');
  if (code === '23514') throw new ErrorApp(400, 'Un valor no cumple las restricciones válidas');
  if (code === '22P02') throw new ErrorApp(400, 'Identificador o parámetro con formato inválido');
  if (code === '22001') throw new ErrorApp(400, 'El valor ingresado excede el largo máximo admitido');
  throw e;
}
