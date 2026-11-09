import { useEffect, useState } from 'react';
import { Outlet, Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import { rutaInicialSegunCapacidades } from '../lib/rutas.js';
import { useSesion } from '../hooks/useSesion.js';
import { LogOut, Menu } from 'lucide-react';
import { itemsDeMenu } from '../components/layout/menu.js';
import { MenuLateral } from '../components/layout/MenuLateral.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';

export function AppLayout() {
  const { usuario, cargando, error, refetch, tieneCapacidad, logout } = useSesion();
  const navigate = useNavigate();
  const routerState = useRouterState();
  // Celular: el menú es un panel que se abre con ☰. Se cierra solo al cambiar de pantalla.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const rutaActual = routerState.location.pathname;
  useEffect(() => setMenuAbierto(false), [rutaActual]);

  useEffect(() => {
    if (!cargando && !usuario && !error) {
      const rutaActual = routerState.location.pathname;
      navigate({
        to: '/login',
        search: rutaActual !== '/' ? { volver: rutaActual } : undefined,
      });
    }
  }, [usuario, cargando, error, navigate, routerState.location.pathname]);

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090a0f] text-neutral-400" aria-busy="true">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 animate-pulse items-center justify-center rounded bg-[#ea580c] text-white font-bold text-lg">
            aF
          </div>
          <p className="text-xs">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090a0f] p-4 text-neutral-200">
        <div className="w-full max-w-sm rounded-md border border-[#1f2937] bg-[#111318] p-6 text-center shadow-xl">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded bg-red-950/60 text-red-500 font-bold text-lg">
            !
          </div>
          <h2 className="mb-2 font-semibold text-lg text-white">No se pudo conectar con el servidor</h2>
          <p className="mb-5 text-xs text-neutral-400">
            {error instanceof Error ? error.message : 'Error al verificar la sesión. Verifique su conexión.'}
          </p>
          <Button onClick={() => void refetch()} className="w-full">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return null;
  }

  const todosLosItems = itemsDeMenu(tieneCapacidad);
  const itemsNavegacion = todosLosItems.filter((item) => item.visible);

  // URL escrita a mano hacia una sección sin capacidad: la API igual responde 403,
  // pero no mostramos una pantalla rota; se va a su pantalla de inicio.
  const ruta = routerState.location.pathname;
  const prohibida = todosLosItems.some(
    (i) => !i.visible && (ruta === i.ruta || ruta.startsWith(i.ruta + '/'))
  );
  const inicio = rutaInicialSegunCapacidades(usuario.capacidades);
  if (prohibida && inicio !== ruta) {
    return <Navigate to={inicio} replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate({ to: '/login' });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090a0f] text-neutral-100">
      <MenuLateral items={itemsNavegacion} ruta={routerState.location.pathname} abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />

      {/* Contenido Principal */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-[#1f2937] bg-[#111318] px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              aria-controls="menu-lateral"
              className="rounded p-2 text-neutral-300 hover:bg-[#1f2937] hover:text-white md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="hidden text-xs font-medium text-neutral-400 sm:inline">Usuario:</span>
            <span className="truncate text-xs font-semibold text-white">{usuario.username}</span>
            <div className="ml-2 hidden gap-1 sm:flex">
              {usuario.capacidades.map((cap) => (
                <Badge key={cap} variant={cap === 'admin' ? 'default' : 'neutral'}>
                  {cap}
                </Badge>
              ))}
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-xs text-neutral-400 hover:text-red-400">
            <LogOut className="h-3.5 w-3.5" />
            <span>Salir</span>
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
