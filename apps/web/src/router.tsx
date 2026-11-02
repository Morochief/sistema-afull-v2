import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
} from '@tanstack/react-router';
import { AppLayout } from './routes/app-layout.js';
import { LoginPage } from './routes/login.js';
import { ClientesListaPage } from './routes/clientes/lista.js';
import { OTsListaPage } from './routes/ots/lista.js';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
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

const clientesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/clientes',
  component: ClientesListaPage,
});

const otsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/ots',
  component: OTsListaPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([indexRoute, clientesRoute, otsRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
