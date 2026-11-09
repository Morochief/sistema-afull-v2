import type { LucideIcon } from 'lucide-react';
import { Users, FileText, Clock, Radio, UserCheck, Calculator, FolderKanban, Palette, Truck, Route, MapPinned, ListChecks, Package, TrendingUp, CalendarCheck, FileSignature, Inbox } from 'lucide-react';

export type ItemMenu = { titulo: string; ruta: string; icono: LucideIcon; visible: boolean };

/** Secciones del menú según las capacidades del usuario (la API igual valida cada pedido). */
export function itemsDeMenu(tieneCapacidad: (c: string) => boolean): ItemMenu[] {
  return [
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
    { titulo: 'Pedidos', ruta: '/pedidos', icono: Inbox, visible: tieneCapacidad('comercial') },
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
}
