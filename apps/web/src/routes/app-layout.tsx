import { useEffect } from 'react';
import { Outlet, Link, Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import { rutaInicialSegunCapacidades } from '../lib/rutas.js';
import { useSesion } from '../hooks/useSesion.js';
import { Users, FileText, LogOut, Clock, Radio, UserCheck, Calculator, FolderKanban, Palette, Truck, Route, MapPinned, ListChecks, Package, TrendingUp, CalendarCheck, FileSignature } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';

export function AppLayout() {
  const { usuario, cargando, error, refetch, tieneCapacidad, logout } = useSesion();
  const navigate = useNavigate();
  const routerState = useRouterState();

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

  const todosLosItems = [
    {
      titulo: 'Mi Trabajo',
      ruta: '/mi-trabajo',
      icono: Clock,
      visible: tieneCapacidad('taller') || tieneCapacidad('montaje') || tieneCapacidad('diseno') || tieneCapacidad('comercial'),
    },
    {
      titulo: 'En la calle',
      ruta: '/calle',
      icono: MapPinned,
      visible: tieneCapacidad('montaje') || tieneCapacidad('taller'),
    },
    {
      titulo: 'Clientes',
      ruta: '/clientes',
      icono: Users,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Órdenes de Trabajo',
      ruta: '/ots',
      icono: FileText,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Presupuestos',
      ruta: '/presupuestos',
      icono: Calculator,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Proyectos',
      ruta: '/proyectos',
      icono: FolderKanban,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Diseños',
      ruta: '/disenos',
      icono: Palette,
      visible: tieneCapacidad('comercial') || tieneCapacidad('taller'),
    },
    {
      titulo: 'Rentabilidad',
      ruta: '/rentabilidad',
      icono: TrendingUp,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Hojas de ruta',
      ruta: '/hojas-ruta',
      icono: Route,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Flota y sedes',
      ruta: '/flota',
      icono: Truck,
      visible: tieneCapacidad('admin'),
    },
    {
      titulo: 'Insumos',
      ruta: '/insumos',
      icono: Package,
      visible: tieneCapacidad('admin'),
    },
    {
      titulo: 'Procesos',
      ruta: '/procesos',
      icono: ListChecks,
      visible: tieneCapacidad('admin'),
    },
    {
      titulo: 'Control en Vivo',
      ruta: '/en-vivo',
      icono: Radio,
      visible: tieneCapacidad('comercial'),
    },
    {
      titulo: 'Asistencia',
      ruta: '/asistencia',
      icono: CalendarCheck,
      visible: tieneCapacidad('rrhh'),
    },
    // Todos piden permisos (cada uno ve los suyos; RR.HH. y el jefe, todos).
    { titulo: 'Permisos', ruta: '/permisos', icono: FileSignature, visible: true },
    {
      titulo: 'Personas',
      ruta: '/personas',
      icono: UserCheck,
      visible: tieneCapacidad('rrhh'),
    },
  ];
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
      {/* Barra lateral */}
      <aside className="w-60 border-r border-[#1f2937] bg-[#111318] flex flex-col shrink-0">
        <div className="flex h-14 items-center gap-2.5 border-b border-[#1f2937] px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#ea580c] text-white font-bold text-sm">
            aF
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">Sistema aFull</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {itemsNavegacion.map((item) => {
            const Icono = item.icono;
            const activo = routerState.location.pathname.startsWith(item.ruta);
            return (
              <Link
                key={item.ruta}
                to={item.ruta}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  activo
                    ? 'bg-[#ea580c]/15 text-[#ea580c]'
                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                <Icono className="h-4 w-4" />
                <span>{item.titulo}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#1f2937] p-3 text-xs text-neutral-500">
          v3.0 · aFull Cartelería
        </div>
      </aside>

      {/* Contenido Principal */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-[#1f2937] bg-[#111318] px-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-400">Usuario:</span>
            <span className="text-xs font-semibold text-white">{usuario.username}</span>
            <div className="flex gap-1 ml-2">
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

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
