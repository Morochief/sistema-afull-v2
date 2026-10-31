import { hash, verify } from '@node-rs/argon2';

const OPCIONES_OWASP = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const hashearPassword = (pass: string): Promise<string> => hash(pass, OPCIONES_OWASP);

export const verificarPassword = (pass: string, passHash: string): Promise<boolean> =>
  verify(passHash, pass);

// Hash real, generado una vez, para igualar tiempos cuando el usuario no existe.
let dummyHash: Promise<string> | undefined;

export async function verificarDummy(): Promise<void> {
  dummyHash ??= hashearPassword('dummy_password_para_igualar_tiempos');
  try {
    await verify(await dummyHash, 'otra_clave');
  } catch {
    // ignorado a propósito
  }
}
