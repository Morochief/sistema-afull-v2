import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useSesion } from '../hooks/useSesion.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Lock, User } from 'lucide-react';
import { ErrorApi } from '../lib/api.js';

type LoginForm = {
  usuario: string;
  clave: string;
};

export function sanitizarDestinoVolver(volver?: string): string {
  if (!volver) return '/clientes';
  // Debe empezar con '/' pero NO con '//' ni contener '\' (evita open redirect a URLs absolutas o relativas al esquema)
  if (volver.startsWith('/') && !volver.startsWith('//') && !volver.includes('\\')) {
    return volver;
  }
  return '/clientes';
}

export function LoginPage() {
  const { login } = useSesion();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { volver?: string };
  const [errorLogin, setErrorLogin] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<LoginForm>({
    defaultValues: { usuario: '', clave: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setErrorLogin(null);
    try {
      await login({ username: data.usuario.trim(), password: data.clave });
      navigate({ to: sanitizarDestinoVolver(search.volver) });
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErrorLogin(err.mensaje);
      } else {
        setErrorLogin('Error al conectar con el servidor');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0f] p-4">
      <div className="w-full max-w-sm rounded-md border border-[#1f2937] bg-[#111318] p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded bg-[#ea580c] text-white font-bold text-lg">
            aF
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Sistema aFull</h1>
          <p className="mt-1 text-xs text-neutral-400">Ingresá con tu usuario y contraseña</p>
        </div>

        {errorLogin && (
          <div className="mb-4 rounded border border-red-800/50 bg-red-950/30 p-2.5 text-xs text-red-300">
            {errorLogin}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">Usuario</label>
            <div className="relative">
              <User className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
              <Input
                {...register('usuario', { required: 'El usuario es obligatorio' })}
                placeholder="Nombre de usuario"
                className="pl-8"
                autoComplete="username"
                error={errors.usuario?.message}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
              <Input
                {...register('clave', { required: 'La contraseña es obligatoria' })}
                type="password"
                placeholder="••••••••"
                className="pl-8"
                autoComplete="current-password"
                error={errors.clave?.message}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full mt-2" cargando={isSubmitting}>
            Iniciar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
