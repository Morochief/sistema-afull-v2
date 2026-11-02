import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppLayout } from './routes/app-layout.js';
import { LoginPage } from './routes/login.js';
import { ClientesListaPage } from './routes/clientes/lista.js';
import { ClientesDetallePage } from './routes/clientes/detalle.js';
import { OTsListaPage } from './routes/ots/lista.js';

const rootRoute = createRootRoute();

const loginSearchSchema = z.object({
  volver: z.string().optional(),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: LoginPage,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: () => <Navigate to="/clientes" replace />,
});

const clientesSearchSchema = z.object({
  q: z.string().optional(),
  estado: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

const clientesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/clientes',
  validateSearch: (search) => clientesSearchSchema.parse(search),
  component: ClientesListaPage,
});

const clientesDetalleRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/clientes/$id',
  component: ClientesDetallePage,
});

const otsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/ots',
  component: OTsListaPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([indexRoute, clientesRoute, clientesDetalleRoute, otsRoute]),
]);

function PaginaNoEncontrada() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#090a0f] p-4 text-neutral-200">
      <div className="w-full max-w-sm rounded-md border border-[#1f2937] bg-[#111318] p-6 text-center shadow-xl">
        <h1 className="mb-2 font-bold text-4xl text-[#ea580c]">404</h1>
        <h2 className="mb-2 font-semibold text-base text-white">Página no encontrada</h2>
        <p className="mb-5 text-xs text-neutral-400">La ruta solicitada no existe o fue movida.</p>
        <a
          href="/clientes"
          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-[#ea580c] text-xs font-semibold text-white hover:bg-[#c2410c] transition-colors"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: PaginaNoEncontrada,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
