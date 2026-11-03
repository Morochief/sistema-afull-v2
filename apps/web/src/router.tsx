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
import { OTsDetallePage } from './routes/ots/detalle.js';
import { MiTrabajoPage } from './routes/mi-trabajo.js';
import { EnVivoPage } from './routes/en-vivo.js';
import { PersonasPage } from './routes/personas.js';
import { PresupuestosListaPage } from './routes/presupuestos/lista.js';
import { PresupuestoDetallePage } from './routes/presupuestos/detalle.js';
import { PresupuestoImprimirPage } from './routes/presupuestos/imprimir.js';
import { ProyectosListaPage } from './routes/proyectos/lista.js';
import { ProyectoDetallePage } from './routes/proyectos/detalle.js';
import { DisenosPage } from './routes/disenos.js';
import { CallePage } from './routes/calle.js';
import { HojasRutaListaPage } from './routes/hojas-ruta/lista.js';
import { HojaRutaDetallePage } from './routes/hojas-ruta/detalle.js';
import { FlotaPage } from './routes/flota.js';
import { ProcesosPage } from './routes/procesos.js';
import { InsumosPage } from './routes/insumos.js';
import { useSesion } from './hooks/useSesion.js';
import { rutaInicialSegunCapacidades } from './lib/rutas.js';

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

function RedireccionRaiz() {
  const { usuario } = useSesion();
  const destino = rutaInicialSegunCapacidades(usuario?.capacidades);
  return <Navigate to={destino} replace />;
}

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: RedireccionRaiz,
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

const otsSearchSchema = z.object({
  q: z.string().optional(),
  estado: z.string().optional(),
  clienteId: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

const otsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/ots',
  validateSearch: (search) => otsSearchSchema.parse(search),
  component: OTsListaPage,
});

const otsDetalleRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/ots/$id',
  component: OTsDetallePage,
});

const miTrabajoRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/mi-trabajo',
  component: MiTrabajoPage,
});

const enVivoRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/en-vivo',
  component: EnVivoPage,
});

const personasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/personas',
  component: PersonasPage,
});

const listadoSearchSchema = z.object({
  q: z.string().optional(),
  estado: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

const presupuestosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/presupuestos',
  validateSearch: (search) => listadoSearchSchema.parse(search),
  component: PresupuestosListaPage,
});

const presupuestoDetalleRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/presupuestos/$id',
  component: PresupuestoDetallePage,
});

// Fuera del AppLayout: hoja limpia para imprimir, sin menú.
const presupuestoImprimirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/presupuestos/$id/imprimir',
  component: PresupuestoImprimirPage,
});

const proyectosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/proyectos',
  validateSearch: (search) => listadoSearchSchema.parse(search),
  component: ProyectosListaPage,
});

const proyectoDetalleRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/proyectos/$id',
  component: ProyectoDetallePage,
});

const disenosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/disenos',
  component: DisenosPage,
});

const calleRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/calle', component: CallePage });
const hojasRutaRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/hojas-ruta', component: HojasRutaListaPage });
const hojaRutaDetalleRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/hojas-ruta/$id', component: HojaRutaDetallePage });
const flotaRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/flota', component: FlotaPage });
const procesosRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/procesos', component: ProcesosPage });
const insumosRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/insumos', component: InsumosPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  presupuestoImprimirRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    clientesRoute,
    clientesDetalleRoute,
    otsRoute,
    otsDetalleRoute,
    miTrabajoRoute,
    enVivoRoute,
    personasRoute,
    presupuestosRoute,
    presupuestoDetalleRoute,
    proyectosRoute,
    proyectoDetalleRoute,
    disenosRoute,
    calleRoute,
    hojasRutaRoute,
    hojaRutaDetalleRoute,
    flotaRoute,
    procesosRoute,
    insumosRoute,
  ]),
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
