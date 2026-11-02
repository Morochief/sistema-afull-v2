> **NOTA IMPORTANTE:** Este es el Documento Maestro original v3.0. Varias decisiones posteriores (Broadcast en lugar de postgres_changes, rol afull_api, CA-0.7 a CA-0.11, sinPipelining en puerto 6543, CA-0.3 movido al Loop 2, etc.) fueron actualizadas en `TRASPASO.md`. **Si hay cualquier diferencia entre este documento y `TRASPASO.md`, gana siempre `TRASPASO.md`.**

# Sistema aFull: Especificación Técnica y Arquitectura Definitiva v3.0

**Fecha de Aprobación:** 28 de Octubre de 2026  
**Autor:** @Moro & Antigravity  
**Estado:** DOCUMENTO MAESTRO DEFINITIVO (Producción Completa, Cero MVP).  
**Modalidad de Despliegue:** **Stack Serverless Gratuito ($0 USD/mes)** en **Vercel + Supabase Free**, con portabilidad garantizada a Fly.io / Supabase Pro.

---

## 1. Principios de Ingeniería y Decisiones de Negocio

1. **Eventos Inmutables, No Contadores:**
   Los tiempos de trabajo, los estados de diseño y los consumos de insumos se registran como filas históricas inmutables con fecha, hora exacta del servidor y autor. Los saldos de stock, las horas totales y los costos se calculan sumando eventos, nunca sobreescribiendo celdas a mano.
2. **Restricciones Duras en PostgreSQL:**
   La integridad la garantiza la base de datos sin importar si el backend corre en serverless:
   - Un operario solo puede tener un cronómetro activo a la vez (`uq_intervalo_abierto`).
   - Un vehículo solo puede tener un viaje activo a la vez (`uq_viaje_abierto`).
   - No se pueden duplicar eventos de campo por reintentos de red (`uq_evento_idem`).
   - Las tarifas de una persona no pueden solaparse en el tiempo (`uq_tarifa_no_solapada` con exclusion constraint `btree_gist`).
3. **Auditoría de Flota Basada en Ruta Planificada (No en Haversine Simple):**
   Un viaje de ida y vuelta al mismo punto inicial daría 0 km en línea recta. Por eso, el sistema audita los km del odómetro comparándolos contra la **distancia rutera estimada** calculada a partir de las coordenadas de las paradas planificadas en la Hoja de Ruta (`hoja_ruta_parada`), aplicando un factor de tortuosidad urbano (1.35x). La alerta por desvío es **informativa** y permite asentar paradas extra con motivo para no bloquear la operación.
4. **Offline Nativo para Cuadrillas de Campo (Con Blobs en Cola):**
   Los montadores en calle operan en zonas con 3G/4G irregular. La aplicación guarda tanto los eventos de tiempo como los **archivos binarios (blobs) de las fotos** en IndexedDB (Dexie) y sincroniza automáticamente en segundo plano con clave de idempotencia al recuperar señal.
5. **Precisión Matemática Alta y Redondeo Final en Guaraníes:**
   Los Guaraníes son una moneda sin centavos (se representan como `BIGINT` en subtotales, totales y prefacturación). Sin embargo, tarifas horarias, costos unitarios de insumos, promedios ponderados y costo por km se almacenan y calculan con alta precisión (`NUMERIC(15,4)`), redondeándose a enteros una sola vez al generar el snapshot de cierre de la OT para evitar deriva por acumulación de redondeos.
6. **Stack Serverless Gratuito ($0/mes) y Portabilidad Total:**
   - La API corre sobre **Vercel Serverless Functions** con Hono.
   - La base de datos y el almacenamiento corren en **Supabase Free** (región São Paulo).
   - Como cada función serverless abre y cierra conexiones efímeras, la API se conecta a través del **Transaction Pooler de Supabase (puerto 6543)**.
   - El tiempo real se delega a **Supabase Realtime Broadcast** (no `postgres_changes`), desacoplado en el cliente tras una interfaz portable (`suscribirseLive()` / `publicarLive()`), donde la API publica un ping mínimo (evento + ID) y el cliente refresca con su sesión propia por la API. Así no se depende de Supabase Auth y se mantiene el desacople total para una futura migración a contenedor dedicado sin reescritura.
   - Se eliminan colas pesadas de fondo (`pg-boss`): los PDFs se generan on-demand, las fotos se comprimen en cliente a 150-300 KB y las tareas programadas (backup diario y ping anti-pausa) corren gratis en **GitHub Actions**.
7. **Regla de Oro de Interfaz: Cero Sábanas Desordenadas:**
   Toda tabla administrativa (clientes, sucursales, OTs, tareas, insumos, flota) tiene obligatoriamente paginación por servidor (25 registros), buscador en tiempo real y filtros reactivos por estado y rango de fechas.
8. **Prohibición Absoluta de Monolitos (Modularidad Atómica Estricta):**
   Queda estrictamente prohibido crear archivos "monstruo" de más de 200-250 líneas.
   - **Frontend:** Ningún componente maneja llamadas API, modales, tablas y lógica de negocio en el mismo archivo. Toda vista se parte en componentes atómicos: vista principal, hook de datos (`useX`), modales independientes (1 archivo por modal) y formularios aislados.
   - **Backend:** Cero archivos gigantes con 100 endpoints inline. El servidor Hono solo monta routers modulares desacoplados por dominio (`/api/clientes`, `/api/comercial`, `/api/preprensa`, `/api/taller`, `/api/montaje`, `/api/flota`, `/api/rrhh`, `/api/stock`, `/api/live`, `/api/costeo`).

---

## 2. Gestión de Riesgos de la Capa Gratuita

| Riesgo del Plan Gratuito | Impacto Real | Mitigación Técnica en el Sistema |
| :--- | :--- | :--- |
| **Pausa de Supabase por inactividad (7 días)** | La base entra en suspensión tras 7 días sin uso. | Durante días hábiles hay uso constante. Para feriados largos, un workflow programado de **GitHub Actions hace un ping diario (`SELECT 1`)** para evitar la pausa. |
| **Sin backups automáticos diarios** | Riesgo de pérdida ante desastre en Supabase Free. | Se programa un workflow diario en **GitHub Actions que ejecuta `pg_dump`** y guarda el respaldo cifrado en un repositorio privado o Google Drive. (Se implementa en el Loop 0). |
| **Tope de 1 GB de archivos (Storage)** | Espacio limitado para fotos de evidencias. | El frontend comprime fotos a **150-300 KB** antes de subirlas (alcanza para más de 3.500 fotos). Política de retención que purga evidencias de OTs cerradas de más de 12 meses. |
| **Tope de 500 MB en Base de Datos** | Espacio limitado de almacenamiento relacional. | No se guardan binarios ni base64 en PostgreSQL; solo rutas textuales de Storage. Sobra para años de operación. |
| **Límite de Supabase Realtime (2M mensajes/mes)** | Exceder la cuota si se transmiten segundos de cronómetro. | El cronómetro corre localmente en el navegador de cada usuario; **solo se emiten eventos en cambios de estado** (Play, Pausa, Fin), consumiendo menos de 10.000 mensajes al mes. |

---

## 3. Depuración de Redundancias (Lo que se Elimina y Unifica)

| Entidad Anterior | Entidad Anterior Redundante | Decisión en v3.0 Definitivo |
| :--- | :--- | :--- |
| `Cliente` | `CarteraCliente` / `CarteraContacto` / `CarteraMarca` | **UNIFICADO:** Una sola tabla `cliente` con tablas dependientes `cliente_contacto` y `cliente_marca`. |
| `Registro` (plano) | `HojaRutaTarea` | **UNIFICADO:** Se elimina la tabla plana `Registro`. Las horas van a `tarea_intervalo`, los consumos a `consumo_insumo` / `movimiento_stock` y los km a `viaje`. |
| `TimerActivo` | `Registro` | **ELIMINADO:** El estado activo se deriva de `tarea_intervalo WHERE hora_fin IS NULL`. |
| `ViajeActivo` | `RegistroVehiculo` | **ELIMINADO:** El viaje activo se deriva de `viaje WHERE km_fin IS NULL`. |
| Factura SIFEN | Facturación Externa | **DELIMITADO:** aFull calcula el **Costeo Real y la Pre-Facturación**; la emisión del comprobante fiscal legal se realiza en el software contable externo de la empresa. |

---

## 4. Stack Tecnológico de Producción ($0 USD / mes)

| Componente | Tecnología | Configuración / Justificación |
| :--- | :--- | :--- |
| **Monorepo** | `pnpm workspaces` | `apps/web` (UI), `apps/api` (Servidor Hono), `packages/shared` (Tipos Zod, Fórmulas, Máquinas de Estado). |
| **Frontend** | React 19 + Vite + TypeScript | Desplegado estático en **Vercel** o **Cloudflare Pages** (gratuito, con CDN y caché PWA). |
| **Gestión de Datos UI** | TanStack Query v5 | Caché reactiva, invalidación atómica y sincronización sin recargas. |
| **Enrutador** | TanStack Router | Enrutamiento tipado y seguro en tiempo de compilación. |
| **Estilos & UI** | Tailwind CSS + shadcn/ui | Estética enterprise oscura (#090a0f, #111318, #ea580c), radios limpios (rounded-md). |
| **Almacenamiento Local** | Dexie.js (IndexedDB) | Cola offline transaccional con blobs de fotos para cuadrillas en calle. |
| **Backend / API** | Hono sobre Vercel Serverless | Desplegado en **Vercel Serverless Functions** (`/api/[[...route]]`). Rápido, ligero y $0 costo. |
| **Base de Datos** | PostgreSQL (Supabase Free São Paulo `gru`) | Conexión a través del **Transaction Pooler (puerto 6543)** para soportar la concurrencia de lambdas. |
| **ORM & Migraciones** | Drizzle ORM | Consultas SQL explícitas, migraciones trazables y compatible con pooler serverless. |
| **Tiempo Real** | Supabase Realtime Broadcast | WebSocket gestionado por Supabase sin depender de Supabase Auth. Publica tipo de evento + ID y el cliente pide el dato con su sesión. Cero necesidad de servidor persistente. |
| **Tareas Programadas** | GitHub Actions Cron Workflows | Backups diarios automáticos vía `pg_dump` y ping anti-inactividad de 7 días. |
| **Almacén de Archivos** | Supabase Storage (Buckets Privados) | URLs firmadas temporales; compresión en cliente a 150-300 KB. |
| **Costo Mensual** | **$0.00 USD / mes** | Operación 100% sobre capas gratuitas. Primera inversión futura: Supabase Pro ($25/mes). |

### Arquitectura Modular Anti-Monolito (Estructura de Directorios)

```
sistema-afull/
├── packages/
│   └── shared/                  # Cero lógica de servidor o DOM
│       ├── src/
│       │   ├── schemas/         # Validaciones Zod (clientes, OTs, tareas, etc.)
│       │   ├── formulas/        # Fórmulas puras (Haversine rutero, costeo, aprovechamiento)
│       │   ├── machines/        # Máquinas de estado formales (transiciones de OT y diseño)
│       │   └── types/           # Tipos TypeScript compartidos
├── apps/
│   ├── api/                     # Backend Hono (Serverless en Vercel)
│   │   └── src/
│   │       ├── index.ts         # Router principal Hono (< 60 líneas)
│   │       ├── db/              # Conexión Drizzle con Supabase Pooler (puerto 6543)
│   │       └── modules/         # Módulos autónomos por dominio
│   │           ├── clientes/    # routes.ts, service.ts, clientes.test.ts
│   │           ├── comercial/   # routes.ts, service.ts (presupuestos, OTs)
│   │           ├── preprensa/   # routes.ts, service.ts (Nachi)
│   │           ├── taller/      # routes.ts, service.ts (Edu, cortes, banco)
│   │           ├── montaje/     # routes.ts, service.ts (cuadrillas calle)
│   │           ├── flota/       # routes.ts, service.ts (vehículos, odómetros)
│   │           ├── rrhh/        # routes.ts, service.ts, pdf.ts (asistencia, permisos)
│   │           ├── stock/       # routes.ts, service.ts (insumos, compras)
│   │           ├── live/        # live.service.ts (interfaz portable de eventos)
│   │           └── costeo/      # routes.ts, service.ts (snapshot SQL)
│   └── web/                     # Frontend React 19 (Componentes Atómicos)
│       └── src/
│           ├── routes/          # Páginas por ruta (< 150 líneas)
│           ├── hooks/           # Custom hooks de datos (useClientes, useTimers)
│           ├── lib/             # Cliente Supabase Realtime y Dexie
│           └── components/      # Componentes pequeños (< 200 líneas)
│               ├── ui/          # Botones, inputs, badges de shadcn
│               ├── forms/       # Formularios aislados (1 por modal)
│               └── modals/      # Modales independientes (1 archivo por modal)
```

---

## 5. Esquema de Base de Datos Maestro (PostgreSQL DDL Definitivo)

```sql
-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- 1. CLIENTES, CONTACTOS, MARCAS Y SUCURSALES (Unificado)
-- ============================================================================
CREATE TABLE cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  razon_social VARCHAR(255),
  ruc VARCHAR(30) UNIQUE,
  telefono VARCHAR(50),
  email VARCHAR(255),
  token_portal VARCHAR(64) UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cliente_contacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  cargo VARCHAR(100),
  telefono VARCHAR(50),
  email VARCHAR(255),
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cliente_marca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  ciudad VARCHAR(100),
  direccion TEXT,
  gps_lat NUMERIC(10,7) NOT NULL, -- Obligatorio para cálculo de ruta de flota
  gps_lng NUMERIC(10,7) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. PERSONAL, TARIFAS, USUARIOS, SESIONES Y CAPACIDADES
-- ============================================================================
CREATE TABLE persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL,
  ci VARCHAR(30) UNIQUE NOT NULL,
  cargo VARCHAR(100),
  departamento VARCHAR(100),
  jefe_id UUID REFERENCES persona(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tarifa_persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
  tarifa_hora_gs NUMERIC(15,4) NOT NULL, -- Precisión alta para costeo exacto
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Evitar solapamiento de tarifas en el tiempo
  CONSTRAINT uq_tarifa_no_solapada EXCLUDE USING gist (
    persona_id WITH =,
    daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[]') WITH &&
  )
);

CREATE TABLE usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID UNIQUE REFERENCES persona(id) ON DELETE SET NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sesion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  ip VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permiso_capacidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  capacidad VARCHAR(50) NOT NULL, -- 'admin', 'diseno', 'taller', 'ver_costos', 'montaje', 'comercial', 'rrhh'
  UNIQUE(usuario_id, capacidad)
);

-- ============================================================================
-- 3. PEDIDOS, PRESUPUESTOS Y ÓRDENES DE TRABAJO (OT)
-- ============================================================================
CREATE TABLE pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id),
  sucursal_id UUID REFERENCES sucursal(id),
  descripcion TEXT NOT NULL,
  medidas_aproximadas VARCHAR(100),
  archivos_adjuntos JSONB DEFAULT '[]',
  estado VARCHAR(30) NOT NULL DEFAULT 'NUEVO', -- NUEVO, EN_COTIZACION, APROBADO, EN_PRODUCCION, RECHAZADO
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE presupuesto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES pedido(id),
  cliente_id UUID NOT NULL REFERENCES cliente(id),
  numero_presupuesto VARCHAR(50) UNIQUE NOT NULL,
  total_materiales_gs BIGINT NOT NULL DEFAULT 0,
  total_mo_estimada_gs BIGINT NOT NULL DEFAULT 0,
  margen_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 35.00,
  precio_final_gs BIGINT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'BORRADOR', -- BORRADOR, ENVIADO, APROBADO, RECHAZADO
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE presupuesto_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id UUID NOT NULL REFERENCES presupuesto(id) ON DELETE CASCADE,
  concepto VARCHAR(50) NOT NULL, -- MATERIAL, MANO_DE_OBRA, TERCERIZADO, MOVILIDAD
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12,4) NOT NULL,
  precio_unitario_gs NUMERIC(15,4) NOT NULL,
  subtotal_gs BIGINT NOT NULL,
  orden_secuencia INT NOT NULL DEFAULT 0
);

CREATE TABLE orden_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id UUID REFERENCES presupuesto(id),
  pedido_id UUID REFERENCES pedido(id),
  cliente_id UUID NOT NULL REFERENCES cliente(id),
  sucursal_id UUID REFERENCES sucursal(id),
  codigo_ot VARCHAR(50) UNIQUE NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  fecha_prometida DATE,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE, EN_DISENO, EN_TALLER, EN_MONTAJE, TERMINADO, CANCELADO
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. DISEÑO PRE-PRENSA (Nachi) Y EVENTOS
-- ============================================================================
CREATE TABLE diseno_preprensa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  ancho_cm NUMERIC(10,2) NOT NULL,
  alto_cm NUMERIC(10,2) NOT NULL,
  material VARCHAR(100) NOT NULL,
  drive_url TEXT NOT NULL, -- Enlace directo a Google Drive (original en alta resolución)
  archivo_preview_url TEXT, -- Preview ligera en Supabase Storage
  estado VARCHAR(40) NOT NULL DEFAULT 'BORRADOR', -- BORRADOR, REVISION_COORDINACION, CORRECCION_SOLICITADA, APROBADO_PRODUCCION
  creado_por UUID NOT NULL REFERENCES usuario(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diseno_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diseno_id UUID NOT NULL REFERENCES diseno_preprensa(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(40) NOT NULL,
  estado_nuevo VARCHAR(40) NOT NULL,
  autor_id UUID NOT NULL REFERENCES usuario(id),
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. PLANIFICACIÓN, CUADRILLAS, PARADAS Y TAREAS OPERATIVAS
-- ============================================================================
CREATE TABLE vehiculo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapa VARCHAR(20) UNIQUE NOT NULL,
  marca_modelo VARCHAR(100) NOT NULL,
  costo_km_gs NUMERIC(12,4) NOT NULL DEFAULT 0, -- Para imputar costo de movilidad a la OT
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE hoja_ruta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  descripcion VARCHAR(255),
  vehiculo_id UUID REFERENCES vehiculo(id),
  estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVA', -- ACTIVA, FINALIZADA
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hoja_ruta_persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_ruta_id UUID NOT NULL REFERENCES hoja_ruta(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES persona(id),
  rol_en_cuadrilla VARCHAR(30) NOT NULL DEFAULT 'MONTADOR', -- CONDUCTOR, MONTADOR, AYUDANTE
  UNIQUE(hoja_ruta_id, persona_id)
);

CREATE TABLE hoja_ruta_parada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_ruta_id UUID NOT NULL REFERENCES hoja_ruta(id) ON DELETE CASCADE,
  sucursal_id UUID REFERENCES sucursal(id),
  orden_trabajo_id UUID REFERENCES orden_trabajo(id),
  orden_secuencia INT NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'PLANIFICADA', -- PLANIFICADA, EXTRA_DESVIO
  motivo_desvio TEXT, -- En caso de parada extra no planificada
  hora_estimada TIME,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE, EN_SITIO, COMPLETADA, OMITIDA
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tarea (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE CASCADE,
  hoja_ruta_id UUID REFERENCES hoja_ruta(id) ON DELETE SET NULL,
  hoja_ruta_parada_id UUID REFERENCES hoja_ruta_parada(id) ON DELETE SET NULL,
  persona_asignada_id UUID REFERENCES persona(id),
  tipo VARCHAR(30) NOT NULL, -- TALLER_IMPRESION, TALLER_CORTE, TALLER_HERRERIA, TALLER_ARMADO, MONTAJE_CALLE
  descripcion TEXT NOT NULL,
  orden_secuencia INT NOT NULL DEFAULT 0,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE, EN_CURSO, PAUSADA, LISTO
  checklist JSONB DEFAULT '[]',
  foto_evidencia_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tarea_intervalo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES persona(id),
  hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_fin TIMESTAMPTZ,
  motivo_pausa VARCHAR(100), -- Almuerzo, Lluvia, Falta de Material, etc.
  clave_idempotencia VARCHAR(100) UNIQUE,
  CHECK (hora_fin IS NULL OR hora_fin > hora_inicio)
);

-- Restricción dura: un operario solo puede tener un cronómetro abierto
CREATE UNIQUE INDEX uq_intervalo_abierto
  ON tarea_intervalo (persona_id) WHERE hora_fin IS NULL;

-- ============================================================================
-- 6. FLOTA VEHICULAR Y AUDITORÍA DE RUTA
-- ============================================================================
CREATE TABLE viaje (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES vehiculo(id),
  conductor_persona_id UUID NOT NULL REFERENCES persona(id),
  hoja_ruta_id UUID REFERENCES hoja_ruta(id),
  km_inicio NUMERIC(10,2) NOT NULL,
  km_fin NUMERIC(10,2),
  km_odometro_total NUMERIC(10,2) GENERATED ALWAYS AS (km_fin - km_inicio) STORED,
  km_estimado_ruta NUMERIC(10,2), -- Suma de distancias entre paradas * factor tortuosidad
  factor_tortuosidad NUMERIC(4,2) DEFAULT 1.35,
  foto_odometro_inicio_url TEXT NOT NULL,
  foto_odometro_fin_url TEXT,
  gps_lat_inicio NUMERIC(10,7),
  gps_lng_inicio NUMERIC(10,7),
  gps_lat_fin NUMERIC(10,7),
  gps_lng_fin NUMERIC(10,7),
  hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_fin TIMESTAMPTZ,
  discrepancia_alerta BOOLEAN DEFAULT false, -- ALERTA INFORMATIVA, NO BLOQUEANTE
  motivo_discrepancia TEXT,
  clave_idempotencia VARCHAR(100) UNIQUE
);

-- Restricción dura: un vehículo solo puede tener un viaje activo
CREATE UNIQUE INDEX uq_viaje_abierto
  ON viaje (vehiculo_id) WHERE km_fin IS NULL;

-- ============================================================================
-- 7. RR.HH. Y ASISTENCIA
-- ============================================================================
CREATE TABLE marcacion_asistencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id),
  tipo VARCHAR(10) NOT NULL, -- ENTRADA, SALIDA
  timestamp_servidor TIMESTAMPTZ NOT NULL DEFAULT now(),
  gps_lat NUMERIC(10,7) NOT NULL,
  gps_lng NUMERIC(10,7) NOT NULL,
  distancia_metros NUMERIC(8,2) NOT NULL, -- Control disuasivo frente a la geocerca de 100 m
  ip VARCHAR(50),
  dispositivo_hash VARCHAR(64) NOT NULL,
  clave_idempotencia VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE permiso_rrhh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES persona(id),
  tipo_permiso VARCHAR(100) NOT NULL, -- Reposo Médico IPS, Asunto Particular, Duelo, etc.
  motivo TEXT NOT NULL,
  modo_tiempo VARCHAR(10) NOT NULL DEFAULT 'horas', -- horas, dias
  fecha_desde TIMESTAMPTZ NOT NULL,
  fecha_hasta TIMESTAMPTZ NOT NULL,
  adjunto_comprobante_url TEXT,
  estado VARCHAR(25) NOT NULL DEFAULT 'Pendiente', -- Pendiente, AprobadoJefe, Aprobado, Rechazado
  jefe_persona_id UUID REFERENCES persona(id),
  jefe_decision VARCHAR(20),
  jefe_comentario TEXT,
  jefe_fecha TIMESTAMPTZ,
  rrhh_decision VARCHAR(20),
  rrhh_comentario TEXT,
  rrhh_descontar_salario BOOLEAN DEFAULT false,
  rrhh_fecha TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. INSUMOS, STOCK Y CONSUMO POR TAREA
-- ============================================================================
CREATE TABLE insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  unidad VARCHAR(20) NOT NULL, -- m2, m, u, kg
  stock_minimo NUMERIC(10,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE factura_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_numero VARCHAR(50) NOT NULL,
  proveedor VARCHAR(150) NOT NULL,
  fecha DATE NOT NULL,
  total_gs BIGINT NOT NULL,
  comprobante_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE movimiento_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumo(id),
  factura_compra_id UUID REFERENCES factura_compra(id),
  tipo VARCHAR(20) NOT NULL, -- ENTRADA_COMPRA, SALIDA_PRODUCCION, AJUSTE_INVENTARIO
  cantidad NUMERIC(12,4) NOT NULL, -- Positiva en entradas, negativa en consumos
  costo_unitario_gs NUMERIC(15,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consumo_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumo(id),
  cantidad NUMERIC(12,4) NOT NULL,
  costo_unitario_gs NUMERIC(15,4) NOT NULL,
  total_gs BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. COSTEO REAL (Snapshot Inmutable al Cierre de OT)
-- ============================================================================
CREATE TABLE costo_orden_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID UNIQUE NOT NULL REFERENCES orden_trabajo(id) ON DELETE CASCADE,
  total_mo_gs BIGINT NOT NULL,
  total_insumos_gs BIGINT NOT NULL,
  total_movilidad_gs BIGINT NOT NULL,
  total_costo_real_gs BIGINT NOT NULL,
  precio_venta_gs BIGINT NOT NULL,
  margen_neto_gs BIGINT NOT NULL,
  rentabilidad_pct NUMERIC(6,2) NOT NULL,
  cerrado_por UUID REFERENCES usuario(id),
  fecha_cierre TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. AUDITORÍA APPEND-ONLY
-- ============================================================================
CREATE TABLE evento_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuario(id),
  accion VARCHAR(100) NOT NULL,
  recurso VARCHAR(150) NOT NULL,
  recurso_id VARCHAR(100),
  ip VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. Flujo Integral Operativo E2E (Secuencia de Vida del Trabajo)

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente B2B
    actor AD as Admin / Comercial
    actor NA as Nachi (Pre-prensa)
    actor CO as Coordinación (Sofi/Juan)
    actor ED as Edu (Taller Impresión)
    actor OP as Operarios Taller/Calle
    actor RAD as Control en Vivo ⚡

    C->>AD: Carga Pedido en Portal con medidas y logo
    AD->>AD: Genera Cotización y crea Orden de Trabajo (OT)
    AD->>NA: OT entra en mesa de diseño
    NA->>NA: Diseña a escala, monta original en Google Drive
    NA->>CO: Sube ficha con medidas y enlace de Google Drive
    CO->>CO: Valida coherencia y viabilidad técnica
    CO->>ED: Aprueba arte (Supabase Realtime notifica a la pantalla)
    ED->>ED: Abre botón "Drive", descarga original, hace montaje RIP
    ED->>ED: Imprime lona/vinilo y marca "Listo"
    OP->>OP: Banco corta placas, suelda bastidor y pega vinilo
    OP->>RAD: Inician cronómetros (Radar Admin refleja avance en vivo)
    AD->>OP: Asigna Hoja de Ruta y Cuadrilla de Montaje
    OP->>OP: Abre viaje con foto de odómetro + GPS
    OP->>OP: Instala cartel en local, sube foto de evidencia
    OP->>OP: Cierra viaje con foto de odómetro final
    AD->>AD: OT completada -> Genera Snapshot de Costeo Real y Pre-factura
```

---

## 7. Reglas de Interfaz (UI/UX) Estrictas

1. **Arquitectura de Tablas Administrativas:**
   - Cero consultas sin límite. Toda tabla usa paginación obligatoria (`LIMIT 25 OFFSET ...`).
   - El encabezado de toda tabla cuenta con buscador en vivo, selector de estado, rango de fechas y paginador.
2. **Estética Enterprise:**
   - Paleta corporativa: Fondo primario `#090a0f`, paneles `#111318`, acentos en naranja `#ea580c` y bordes sutiles `white/10`. Radios estrictos de 4px a 6px (`rounded-md`).
3. **PWA Mobile para Campo:**
   - Interfaz táctil de alto contraste con botones de acción principal de mínimo 48px de alto y encolado de fotos binarias en Dexie.

---

## 8. Criterios de Aceptación y Tareas del Loop 0 (Fundación, Auth, Seguridad)

### Tareas de Ejecución del Loop 0
1. **Decisión de la API:** Cloudflare Workers o Vercel Serverless (verificando términos de uso comercial gratuito).
2. **Monorepo y Reglas:** Monorepo pnpm (`apps/api`, `apps/web`, `packages/shared`), TypeScript estricto, ESLint con regla `max-lines: 250` forzada por máquina y Vitest.
3. **Proyectos Supabase:** `dev` y `prod` en región São Paulo (`gru`). Credenciales en variables de entorno.
4. **Conexión Drizzle:** `postgres-js` con `prepare: false` para el Transaction Pooler (puerto 6543). Migraciones directas.
5. **Migración 0001 (Solo tablas del Loop 0):** Extensiones, `persona`, `usuario`, `sesion`, `permiso_capacidad`, `evento_auditoria`, `secuencia_contador`, **RLS activado sin políticas** y **Trigger que bloquea UPDATE/DELETE en `evento_auditoria`**.
6. **Autenticación:** Hash con `@node-rs/argon2` o `scrypt` de `node:crypto` (sin binarios C++ problemáticos en serverless), cookies `HttpOnly`/`Secure`/`SameSite=Lax`, validación contra `sesion` y `usuario.activo`.
7. **Capacidades:** Middleware `requireCapacidad('x')` y script de seed para el primer admin.
8. **Auditoría:** Servicio `auditar()` en login, logout y toda mutación.
9. **CI:** GitHub Actions con `tsc --noEmit`, lint y Vitest con servicio Postgres en contenedor.
10. **Backups y Ping:** GitHub Actions diario con `SELECT 1` (anti-pausa) y `pg_dump` + copia de Storage a repo privado con restore probado.
11. **Deploy y Humo:** Login, request protegida y request denegada en la infraestructura desplegada real.

### Criterios de Aceptación del Loop 0
* **CA-0.1 (Auth Desplegada):** El login funciona en el entorno desplegado real con el hash elegido (`@node-rs/argon2` o `scrypt`).
* **CA-0.2 (Revocación Instantánea):** Al marcar `usuario.activo = false` o eliminar la fila en `sesion`, la siguiente petición HTTP es rechazada de inmediato con `401 Unauthorized`.
* **CA-0.4 (RBAC por Capacidad):** Un usuario sin la capacidad requerida recibe `403 Forbidden`.
* **CA-0.5 (Auditoría):** Toda mutación sensible genera un evento inmutable en `evento_auditoria`.
* **CA-0.6 (CI y Tipado):** `tsc --noEmit`, lint y Vitest pasan en verde en GitHub Actions.
* **CA-0.7 (Seguridad RLS):** Usando la `anon key` pública contra la API REST de Supabase, **ninguna tabla** devuelve ni permite escribir datos. Test automatizado recorre todas las tablas del esquema.
* **CA-0.8 (Inmutabilidad Real con Trigger):** Cualquier intento de `UPDATE` o `DELETE` sobre `evento_auditoria` falla con excepción de base de datos a nivel motor.
* **CA-0.9 (Respaldo con Restore Verificado):** El workflow diario genera el volcado y copia de Storage, y un restore en una base limpia reproduce los datos.
* **CA-0.10 (Resistencia de Conexión):** La API atiende 20 requests concurrentes por el pooler sin errores de prepared statements ni conexiones agotadas (`prepare: false`).
* **CA-0.11 (Modularidad Forzada):** El linter y CI fallan si cualquier archivo supera las 250 líneas.

---

## 9. Decisiones Técnicas Anotadas para Loops Siguientes

* **Loop 1 (Clientes, Sucursales y OTs):**
  - Códigos `OT-2026-0001` y `numero_presupuesto` generados con la tabla transaccional `secuencia_contador`. Nunca `MAX() + 1`.
  - Búsqueda en texto optimizada con índice `pg_trgm`.
  - Paginación server-side con página 1 y límite por defecto (en vez de rechazar requests sin paginar).
* **Loop 2 (Tareas, Cronómetros y Control en Vivo):**
  - **CA-0.3 de cronómetros concurrentes:** Dos inicios simultáneos (`POST /api/intervalo/start`) para la misma persona resultan en 1 éxito (`201`) y 1 rechazo controlado (`409 Conflict`) por `uq_intervalo_abierto`.
  - Tiempo real con **Supabase Realtime Broadcast** (no `postgres_changes`), enviando mensajes mínimos (tipo de evento + ID) y refetch con sesión por la API.
* **Loop 3 (Campo Offline y Flota):**
  - Regla de reparto de km de viaje entre múltiples OTs escrita en `packages/shared/formulas`.
* **Loop 4 (Stock e Insumos):**
  - Cada `consumo_insumo` genera su correspondiente `movimiento_stock` (`SALIDA_PRODUCCION`) en la misma transacción, con costo unitario congelado al momento del consumo.

---

## 10. Suite de Tests Automatizados de Integridad y Seguridad (Vitest - Loop 0)

Los tests de integridad residen en `tests/loop0/` y deben ejecutarse exclusivamente contra el proyecto `dev` de Supabase:

* **`tests/loop0/helpers.ts`:** Conexión dual `admin` (conexión directa/sesión como `postgres` para setup/asserts) y `api` (conexión a través del pooler 6543 con el rol `afull_api`).
* **`tests/loop0/anon.test.ts` (CA-0.7):**
  - Verifica que toda tabla en el esquema `public` tenga RLS activo.
  - Verifica mediante `has_table_privilege` que los roles `anon` y `authenticated` no tengan permisos `SELECT`, `INSERT`, `UPDATE` ni `DELETE`.
  - Verifica que la API REST pública de Supabase no entregue datos ni acepte escrituras.
  - Verifica que las funciones (`siguiente_valor`) no puedan ser invocadas por RPC público.
* **`tests/loop0/auditoria.test.ts` (CA-0.8):**
  - Control positivo: la API puede insertar eventos de auditoría.
  - El trigger bloquea `UPDATE`, `DELETE` y `TRUNCATE` incluso para el rol admin/owner.
  - El rol `afull_api` no puede modificar, borrar ni truncar datos.
  - El rol `afull_api` no tiene permisos DDL para quitar (`DROP TRIGGER`) ni deshabilitar (`DISABLE TRIGGER`) el trigger de inmutabilidad.
* **`tests/loop0/usuarios.test.ts`:**
  - Verifica que intentar borrar (`DELETE`) un usuario con registros de auditoría falle con error de Foreign Key `23503` por restricción `RESTRICT`.
  - Verifica que la desactivación lógica (`activo = false`) funcione correctamente.
* **`tests/loop0/secuencia.test.ts`:**
  - Ejecuta 50 llamadas simultáneas con `Promise.all` a `siguiente_valor(ID)` y verifica que devuelve exactamente los números del 1 al 50 consecutivos, sin saltos ni duplicados por condiciones de carrera.

### Ejecución de Pruebas
```bash
pnpm vitest run tests/loop0
```

---

## 11. Módulo de Autenticación, Sesiones y Seguridad (Loop 0 - Tareas 6, 7 y 8)

### Decisiones de Arquitectura de Autenticación
1. **Runtime Node en Vercel:** Argon2id exige CPU y memoria (OWASP: 19 MiB, 2 iteraciones, 1 hilo). Se ejecuta en Vercel Serverless con runtime Node (usando `@node-rs/argon2`). Para usuarios inexistentes, se verifica contra un hash falso precomputado para evitar ataques de timing.
2. **Mismo Dominio (Frontend + API):** Cookie de sesión `afull_session` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Al estar frontend y API bajo el mismo sitio Vercel, la cookie viaja naturalmente en cada fetch.
3. **Tokens Cifrados y Sesión Deslizante (30 días):**
   - El cliente recibe un token aleatorio seguro de 32 bytes en base64url.
   - En la base de datos se almacena únicamente el **SHA-256 en hexadecimal (64 caracteres)**. Si la base es leída, los tokens son inútiles.
   - Duración de 30 días para cuadrillas de campo. Para no saturar la base de datos gratuita, `last_active_at` y `expires_at` se actualizan en BD como máximo cada 5 minutos.
4. **Protección contra Fuerza Bruta:** Tabla `intento_login` (máximo 5 fallos por usuario o 20 por IP en ventana de 15 minutos).
5. **Protección CSRF:** Middleware `verificarOrigen()` que valida la cabecera `Origin` en toda petición mutativa (`POST`, `PUT`, `PATCH`, `DELETE`).
6. **Servicio de Auditoría Seguro:**
   - La función `limpiarMetadata()` filtra recursivamente contraseñas, tokens y cookies (`pass|token|secret|hash|cookie|authorization|api[_-]?key`).
   - Toda mutación de negocio se audita dentro de la **misma transacción** (`tx`). Si la auditoría falla, la mutación se revierte.
   - Login y logout se auditan fuera de transacción con `try/catch` para no bloquear al personal.

### La Regla de Oro de Tres Pasos para Migraciones Futuras
Cada migración que cree una tabla nueva debe incluir obligatoriamente:
```sql
ALTER TABLE nueva ENABLE ROW LEVEL SECURITY;
GRANT <solo lo necesario> ON nueva TO afull_api;
CREATE POLICY api_acceso ON nueva FOR ALL TO afull_api USING (true) WITH CHECK (true);
```

---

## 12. Suite de Tests de Autenticación y Auditoría (Vitest)

* **`tests/loop0/auth.test.ts`:**
  - **CA-0.1:** Login exitoso emite cookie `HttpOnly`, `Secure`, `SameSite=Lax`, guarda la sesión en BD y comprueba que el hash sea `$argon2id$`. Credenciales inválidas devuelven 401 con mensaje genérico idéntico.
  - **CA-0.2:** Verificación instantánea: marcar `usuario.activo = false` hace que la siguiente llamada a `/api/auth/yo` falle con 401.
  - **CA-0.4:** Capacidades: usuario sin `ver_costos` recibe 403; con `ver_costos` recibe 200; con `admin` recibe 200.
  - **Fuerza Bruta:** 5 intentos fallidos bloquean el sexto con 429 Too Many Requests, incluso si la contraseña es correcta.
  - **CSRF:** Petición POST con `Origin` no autorizado recibe 403 Forbidden.
  - **Rendimiento:** Control de tiempo de ejecución del hash (debe medirse también en Vercel desplegado apuntando a 100-300 ms).
* **`tests/loop0/auditoria.service.test.ts` (CA-0.5):**
  - Verifica que el login inserte un evento `auth.login`.
  - Verifica que `limpiarMetadata` sustituya secretos por `[omitido]`.
  - Verifica que si una transacción falla, el evento de auditoría se revierta con ella.

### Medición de Tiempo de Hash en Vercel Desplegado
```bash
curl -s -o /dev/null -w "%{time_total}s\n" -X POST https://<tu-app>.vercel.app/api/auth/login \
  -H "content-type: application/json" -H "origin: https://<tu-app>.vercel.app" \
  -d '{"username":"admin","password":"..."}'
```


---

## 13. Workflows de CI/CD, Respaldos Automatizados y Verificación de Restore (Loop 0 - Tareas 9, 10 y 11)

### 13.1 Decisiones y Ajustes al Plan Original de Operaciones
1. **Sin workflow de ping innecesario:** El respaldo diario de la base de datos realiza consultas reales sobre PostgreSQL cada noche. Esas lecturas mantienen el proyecto de Supabase Free permanentemente activo frente a la regla de pausa de 7 días. Si durante un feriado largo se detectara inactividad, se agregaría un simple `SELECT 1` programado.
2. **Verificación de restore integrada en el respaldo:** La prueba de integridad no es un job separado; se ejecuta dentro del mismo workflow diario. Cada dump se restaura inmediatamente en una base de datos PostgreSQL 17 vacía (service container en el runner) y se valida la paridad de tablas, usuarios y triggers antes de dar por válido el archivo y cifrarlo. Un respaldo corrupto hace fallar el job en el momento, no el día del desastre.
3. **Aislamiento de tests en CI vs Dev:** El entorno CI (Postgres estándar) no cuenta con el API gateway de PostgREST de Supabase. Por tanto, el CI ejecuta toda la suite Vitest excluyendo `tests/loop0/anon.test.ts`. Dicho test de verificación de la clave anónima se ejecuta de forma nocturna en un workflow dedicado contra el proyecto real de `dev`.

---

### 13.2 Matriz de Secrets de GitHub Actions (Settings → Secrets and variables → Actions)

| Secret | Propósito / Destino | Notas Críticas |
| :--- | :--- | :--- |
| `DEV_DATABASE_URL_ADMIN` | Conexión directa o session pooler (rol `postgres`) a la base `dev` | Utilizado en tests nocturnos |
| `DEV_DATABASE_URL_API` | Conexión via pooler de transacciones (puerto 6543, rol `afull_api`) a `dev` | Utilizado en tests nocturnos |
| `DEV_SUPABASE_URL` | URL del proyecto Supabase Dev (`https://<ref-dev>.supabase.co`) | Para tests de API REST |
| `DEV_SUPABASE_ANON_KEY` | Clave anónima pública de Supabase Dev | Verificación de RLS en `anon.test.ts` |
| `PROD_DATABASE_URL_BACKUP` | Conexión a la base de Producción para el volcado | **Usar pooler en modo sesión (puerto 5432 del host del pooler)**. La conexión directa de Supabase es IPv6 y los runners de GitHub utilizan IPv4. |
| `BACKUP_PASSPHRASE` | Contraseña para cifrado simétrico AES-256 con GPG | **Guardar también en un gestor de contraseñas**. Si solo existe en GitHub y se pierde el acceso, los respaldos cifrados son basura. |
| `PROD_SUPABASE_URL` | URL del proyecto Supabase Prod | Respaldo semanal de Storage |
| `PROD_SUPABASE_SERVICE_KEY` | Clave `service_role` (acceso total a Storage) de Producción | Solo en secrets de repo privado. NUNCA en el frontend ni en repos públicos. |
| `RCLONE_CONF` | Configuración de destino externo (Google Drive) para `rclone` | Se genera una vez localmente con `rclone config` |

---

### 13.3 Workflow de Integración Continua (`.github/workflows/ci.yml`)

Se dispara en cada `push` a la rama `main` y en cada `pull_request`. Levanta PostgreSQL 17, prepara roles, ejecuta el linter con regla anti-monolito de 250 líneas, valida tipos y corre la suite de pruebas:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verificar:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: ci_admin
        ports: ['5432:5432']
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s --health-timeout=5s --health-retries=10
    env:
      TEST_ENV: dev # el guard de los tests: aquí la base es desechable
      APP_ORIGIN: http://localhost:3000
      DATABASE_URL_ADMIN: postgres://postgres:ci_admin@localhost:5432/postgres
      DATABASE_URL_API: postgres://afull_api:ci_api@localhost:5432/postgres
      DATABASE_URL: postgres://afull_api:ci_api@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Lint (incluye max-lines 250)
        run: pnpm lint
      - name: Tipos
        run: pnpm -r exec tsc --noEmit

      - name: Preparar base (roles de Supabase + migraciones)
        run: |
          psql "$DATABASE_URL_ADMIN" -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;"
          pnpm db:migrate
          psql "$DATABASE_URL_ADMIN" -c "ALTER ROLE afull_api PASSWORD 'ci_api';"
        env:
          DATABASE_URL: ${{ env.DATABASE_URL_ADMIN }}

      - name: Tests (sin el test REST de la anon key)
        run: pnpm vitest run tests --exclude tests/loop0/anon.test.ts
```

> [!NOTE]
> Los roles `anon` y `authenticated` se crean a mano porque la migración `0001` los referencia en las sentencias `REVOKE` y en un PostgreSQL estándar no existen por defecto. El script `pnpm db:migrate` ejecuta las migraciones DDL utilizando siempre la conexión de administrador (`DATABASE_URL_ADMIN`).

---

### 13.4 Workflow de Auditoría Nocturna contra Dev (`.github/workflows/tests-dev.yml`)

Corre automáticamente todas las noches a las 05:30 UTC (02:30 Paraguay) y bajo demanda (`workflow_dispatch`). Monitorea continuamente la seguridad de la capa de datos real:

```yaml
name: Tests contra dev
on:
  schedule:
    - cron: '30 5 * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  dev:
    runs-on: ubuntu-latest
    env:
      TEST_ENV: dev
      APP_ORIGIN: http://localhost:3000
      DATABASE_URL_ADMIN: ${{ secrets.DEV_DATABASE_URL_ADMIN }}
      DATABASE_URL_API: ${{ secrets.DEV_DATABASE_URL_API }}
      DATABASE_URL: ${{ secrets.DEV_DATABASE_URL_API }}
      SUPABASE_URL: ${{ secrets.DEV_SUPABASE_URL }}
      SUPABASE_ANON_KEY: ${{ secrets.DEV_SUPABASE_ANON_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run tests/loop0
```

> [!IMPORTANT]
> Este job deja filas de prueba controladas en el proyecto `dev` cada noche. Su valor fundamental es vigilar el criterio **CA-0.7**: si alguna migración futura accidentalmente deja una tabla abierta o un permiso público sin revocar en `public`, el fallo es detectado a la mañana siguiente.

---

### 13.5 Workflow de Respaldo Diario y Verificación de Restore (`.github/workflows/backup-db.yml`)

Se ejecuta diariamente a las 06:00 UTC (03:00 de Paraguay). Realiza el volcado, lo restaura inmediatamente en una base limpia para verificar su viabilidad, compara conteos, valida triggers de auditoría, cifra con AES-256 y publica el artefacto:

```yaml
name: Respaldo diario de la base
on:
  schedule:
    - cron: '0 6 * * *' # 03:00 en Paraguay (UTC-3)
  workflow_dispatch:

permissions:
  contents: read

jobs:
  respaldo:
    runs-on: ubuntu-latest
    services:
      verif:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: verif
        ports: ['5432:5432']
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s --health-timeout=5s --health-retries=10
    env:
      SRC: ${{ secrets.PROD_DATABASE_URL_BACKUP }}
      VERIF: postgres://postgres:verif@localhost:5432/postgres
    steps:
      - name: Cliente PostgreSQL 17 (debe ser >= versión del servidor)
        run: |
          sudo apt-get install -y curl ca-certificates
          sudo install -d /usr/share/postgresql-common/pgdg
          sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
          sudo apt-get update && sudo apt-get install -y postgresql-client-17

      - name: Volcado
        run: pg_dump "$SRC" -Fc --schema=public --no-owner --no-privileges -f dump.pgdump

      - name: Verificar restore en base vacía
        run: |
          psql "$VERIF" -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;"
          pg_restore --no-owner --no-privileges --exit-on-error -d "$VERIF" dump.pgdump

          t_src=$(psql "$SRC"   -Atc "select count(*) from information_schema.tables where table_schema='public'")
          t_dst=$(psql "$VERIF" -Atc "select count(*) from information_schema.tables where table_schema='public'")
          u_src=$(psql "$SRC"   -Atc "select count(*) from usuario")
          u_dst=$(psql "$VERIF" -Atc "select count(*) from usuario")
          trg=$(psql "$VERIF"   -Atc "select count(*) from pg_trigger where tgname like 'trg_bloquear%'")

          echo "tablas: $t_src -> $t_dst | usuarios: $u_src -> $u_dst | triggers: $trg"
          [ "$t_src" = "$t_dst" ] && [ "$u_src" = "$u_dst" ] && [ "$trg" -ge 2 ]

      - name: Cifrar
        run: |
          gpg --batch --yes --pinentry-mode loopback --passphrase "${{ secrets.BACKUP_PASSPHRASE }}" \
            --symmetric --cipher-algo AES256 -o "afull-db-$(date -u +%F).pgdump.gpg" dump.pgdump
          rm dump.pgdump

      - uses: actions/upload-artifact@v4
        with:
          name: respaldo-db
          path: afull-db-*.pgdump.gpg
          retention-days: 30
```

> [!TIP]
> **Condiciones de falla de la verificación:** El job falla inmediatamente si el comando `pg_restore` emite algún error, si varía el conteo de tablas o usuarios entre origen y destino, o si el conteo de triggers inmutables es menor a 2. Esta última comprobación garantiza matemáticamente que el volcado restaurado preserva la protección inmutable de la auditoría.
> 
> **Limitaciones a tener en cuenta:**
> - El volcado cubre exclusivamente el esquema `public`.
> - Los artefactos de GitHub Actions están sujetos a las cuotas de almacenamiento de la cuenta (retención de 30 días configurada).
> - Este dump contiene únicamente registros relacionales de la base de datos, **no contiene las imágenes ni fotos de odómetro**, para las cuales se utiliza el respaldo de Storage.

---

### 13.6 Script de Respaldo de Archivos (`scripts/backup-storage.mjs`)

Script Node.js puro sin dependencias externas pesadas para descargar recursivamente todos los objetos de todos los buckets de Supabase Storage mediante la API REST:

```javascript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, DESTINO = 'storage-backup' } = process.env;
const h = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };

async function listar(bucket, prefix = '') {
  const archivos = [];
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset }),
    });
    if (!r.ok) throw new Error(`Listado falló: ${bucket}/${prefix} -> ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      const ruta = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) archivos.push(...(await listar(bucket, ruta))); // carpeta
      else archivos.push(ruta);
    }
    if (items.length < 100) return archivos;
  }
}

const rb = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: h });
if (!rb.ok) throw new Error(`Buckets: ${rb.status}`);
let total = 0;
for (const { name: bucket } of await rb.json()) {
  for (const ruta of await listar(bucket)) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${ruta}`, { headers: h });
    if (!r.ok) throw new Error(`Descarga falló: ${bucket}/${ruta} -> ${r.status}`);
    const destino = join(DESTINO, bucket, ruta);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await r.arrayBuffer()));
    total++;
  }
}
console.log(`Respaldados ${total} archivos`);
```

---

### 13.7 Workflow de Respaldo Semanal de Storage (`.github/workflows/backup-storage.yml`)

Se ejecuta los domingos a las 07:00 UTC (04:00 Paraguay) o bajo demanda. Descarga los archivos con el script, los empaqueta, los cifra con AES-256 y los sincroniza a Google Drive vía `rclone`:

```yaml
name: Respaldo semanal de archivos
on:
  schedule:
    - cron: '0 7 * * 0'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  storage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }

      - name: Descargar todos los buckets
        run: node scripts/backup-storage.mjs
        env:
          SUPABASE_URL: ${{ secrets.PROD_SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.PROD_SUPABASE_SERVICE_KEY }}

      - name: Comprimir y cifrar
        run: |
          tar -czf storage.tar.gz storage-backup
          gpg --batch --yes --pinentry-mode loopback --passphrase "${{ secrets.BACKUP_PASSPHRASE }}" \
            --symmetric --cipher-algo AES256 -o "afull-storage-$(date -u +%F).tar.gz.gpg" storage.tar.gz

      - name: Subir a Google Drive
        run: |
          curl https://rclone.org/install.sh | sudo bash
          echo "${{ secrets.RCLONE_CONF }}" > rclone.conf
          rclone --config rclone.conf copy afull-storage-*.tar.gz.gpg gdrive:afull-backups/storage/
          rm rclone.conf
```

> [!NOTE]
> Para vincular Google Drive con `rclone`, se ejecuta una sola vez en la máquina del administrador el comando `rclone config`, siguiendo las instrucciones interactivas para autorizar la cuenta de Drive. El contenido del archivo `~/.config/rclone/rclone.conf` generado se copia íntegro en el secret `RCLONE_CONF` del repositorio.

---

### 13.8 Protocolo de Restauración Manual ante Desastres (`RESTAURAR.md` - Cumplimiento CA-0.9)

El criterio CA-0.9 solo se considera formalmente validado cuando se realiza una prueba real completa de restauración humana:

1. **Ejecución inicial:** Disparar manualmente `backup-db.yml` mediante `workflow_dispatch` y verificar que termine en verde con la salida `tablas: N -> N | usuarios: M -> M | triggers: 2`.
2. **Descarga y descifrado:**
   ```bash
   # Descargar el artefacto generado y descifrar el volcado
   gpg --batch --yes --pinentry-mode loopback --passphrase "SU_BACKUP_PASSPHRASE" \
     --decrypt -o dump_restaurado.pgdump afull-db-YYYY-MM-DD.pgdump.gpg
   ```
3. **Restauración sobre base de datos limpia:**
   ```bash
   export DEST_URL="postgres://postgres:password@host:5432/postgres"
   
   # Crear roles obligatorios del ecosistema Supabase
   psql "$DEST_URL" -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;"
   
   # Restaurar esquema y datos omitiendo pertenencias externas
   pg_restore --no-owner --no-privileges --exit-on-error -d "$DEST_URL" dump_restaurado.pgdump
   
   # Asignar contraseña al rol operativo de la API
   psql "$DEST_URL" -c "ALTER ROLE afull_api WITH PASSWORD 'NUEVA_CONTRASENA_PROD';"
   ```
4. **Verificación de paridad:**
   ```bash
   psql "$DEST_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
   psql "$DEST_URL" -Atc "SELECT count(*) FROM usuario;"
   psql "$DEST_URL" -Atc "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE 'trg_bloquear%';"
   ```
5. **Prueba de arranque de la API:** Conectar la API apuntando a la base restaurada y comprobar que `GET /api/auth/yo` responde correctamente con una sesión activa.

---

### 13.9 Tarea 11: Despliegue en Producción Vacía y Prueba de Humo (Cierre del Loop 0)

Una vez confirmados los workflows de CI y respaldos, se ejecuta la secuencia de despliegue inicial en producción:

1. **Vinculación con Vercel:** Proyecto monorepo conectado al repositorio privado de GitHub, configurando el framework Hono bajo runtime Node.js 22 (`apps/api`) con las variables de entorno de producción.
2. **Ejecución de Migraciones Fundacionales en Producción:**
   - Aplicar `migrations/0001_loop0_fundacion.sql` (tablas, trigger inmutable, función atómica `siguiente_valor`, restricciones de borrado y RLS total).
   - Aplicar `migrations/0002_rol_api.sql` (creación de rol `afull_api`, privilegios DML mínimos, políticas RLS específicas).
   - Aplicar `migrations/0003_intento_login.sql` (mitigación de fuerza bruta con regla de tres pasos).
   - Asignar la contraseña fuerte al rol `afull_api`.
3. **Creación del Primer Administrador:** Ejecutar el script de seed para dar de alta al superadministrador inicial con contraseña hasheada mediante Argon2id.
4. **Prueba de Humo en Producción:**
   - `POST /api/auth/login` -> Debe emitir la cookie HttpOnly `afull_sesion`.
   - `GET /api/auth/yo` -> Retorna perfil del usuario y array de capacidades con `admin`.
   - Intento a endpoint protegido sin la capacidad correspondiente -> Retorna `403 Forbidden`.
   - `POST /api/auth/logout` -> Elimina la sesión en base de datos y borra la cookie en el cliente.
   - Verificación manual con `curl` usando la clave anónima (`anon key`) contra la API REST de Supabase -> Retorna vacío (`[]`) o error `401 Unauthorized` (RLS activo sin políticas públicas).
5. **Medición de Tiempo de Hash en Vercel:**
   ```bash
   curl -s -o /dev/null -w "%{time_total}s\n" -X POST https://<tu-app>.vercel.app/api/auth/login \
     -H "content-type: application/json" -H "origin: https://<tu-app>.vercel.app" \
     -d '{"username":"admin","password":"..."}'
   ```
   Verificar que el tiempo total de respuesta se ubique entre **100 ms y 300 ms** (costo computacional seguro sin riesgo de timeout en la lambda).

Con estos 5 pasos completados y verificados, **el Loop 0 queda formalmente cerrado** y la arquitectura se encuentra lista para iniciar la especificación del **Loop 1 (Clientes y Órdenes de Trabajo)**.


---

## 14. Loop 1A: Base de Datos y API de Clientes y Órdenes de Trabajo (OT)

### 14.1 Decisiones Arquitectónicas Asumidas
1. **Una OT = Una Sola Sucursal:** Si un trabajo de campo o señalética cubre múltiples locales o sucursales de un mismo cliente, el sistema modela dicho trabajo como múltiples OTs independientes. Esto asegura que la geolocalización, la hoja de ruta y la auditoría de kilometraje tengan una referencia geográfica unívoca.
2. **Estados Finales Inmutables:** Los estados `TERMINADO` y `CANCELADO` son terminales. No se permite reabrir una OT finalizada porque alteraría retroactivamente el costeo real (mano de obra e insumos del Loop 5). Si excepcionalmente se requiriese una reapertura, se diseñará en fases posteriores como un flujo de auditoría especial con autorización de administrador y motivo justificado.
3. **División Estricta del Loop:** Se divide en **1A (Base de Datos, Shared y API)** y **1B (Frontend)**. El Loop 0 no requirió interfaz visual; por ende, 1B concentra el shell, login, layout y el componente reutilizable `TablaAdmin`. Se debe cerrar 1A con tests en verde antes de iniciar 1B.
4. **Desacople de Presupuesto, Pedido y Portal:** La OT nace desacoplada de `presupuesto_id` y `pedido_id`. Dichas columnas se incorporarán mediante `ALTER TABLE` cuando se implementen esos dominios. Tampoco se incluye `token_portal` en esta fase (pertenece al Loop 8 y se almacenará hasheado con SHA-256 de forma idéntica a las sesiones).
5. **Regla de No Borrado Físico (Soft-Deactivation):** El rol `afull_api` no posee permisos de `DELETE` sobre las tablas operativas. Todos los registros se desactivan lógicamente (`activo = false`).

---

### 14.2 Migración `0004_clientes_ot.sql`

Aplica la extensión de trigramas, las estructuras relacionales de clientes, contactos, marcas, sucursales con coordenadas acotadas a Paraguay, órdenes de trabajo con clave foránea compuesta, y la tabla inmutable de auditoría de transiciones de OT:

```sql
-- Extensión de búsqueda: asegurar esquema extensions para paridad en CI
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ===================== CLIENTES =====================
CREATE TABLE IF NOT EXISTS cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL CHECK (btrim(nombre) <> ''),
  razon_social VARCHAR(255),
  ruc VARCHAR(30) UNIQUE,
  telefono VARCHAR(50),
  email VARCHAR(255),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cliente_nombre_trgm ON cliente USING gin (nombre extensions.gin_trgm_ops);
CREATE INDEX idx_cliente_razon_trgm  ON cliente USING gin (razon_social extensions.gin_trgm_ops);
CREATE INDEX idx_cliente_ruc_trgm    ON cliente USING gin (ruc extensions.gin_trgm_ops);
CREATE INDEX idx_cliente_codigo_trgm ON cliente USING gin (codigo extensions.gin_trgm_ops);

CREATE TABLE cliente_contacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
  cargo VARCHAR(100),
  telefono VARCHAR(50),
  email VARCHAR(255),
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contacto_principal ON cliente_contacto (cliente_id)
  WHERE es_principal AND activo;

CREATE TABLE cliente_marca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_marca_cliente_nombre ON cliente_marca (cliente_id, lower(nombre));

CREATE TABLE sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  nombre VARCHAR(255) NOT NULL CHECK (btrim(nombre) <> ''),
  ciudad VARCHAR(100),
  direccion TEXT,
  gps_lat NUMERIC(10,7) NOT NULL CHECK (gps_lat BETWEEN -27.7 AND -19.2),   -- caja geográfica de Paraguay
  gps_lng NUMERIC(10,7) NOT NULL CHECK (gps_lng BETWEEN -62.7 AND -54.2),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sucursal_id_cliente UNIQUE (id, cliente_id)  -- habilita la FK compuesta de la OT
);
CREATE UNIQUE INDEX uq_sucursal_cliente_nombre ON sucursal (cliente_id, lower(nombre));

-- ===================== ÓRDENES DE TRABAJO =====================
CREATE TABLE orden_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ot VARCHAR(50) UNIQUE NOT NULL,
  cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  sucursal_id UUID,
  titulo VARCHAR(255) NOT NULL CHECK (btrim(titulo) <> ''),
  descripcion TEXT,
  fecha_prometida DATE,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','EN_DISENO','EN_TALLER','EN_MONTAJE','TERMINADO','CANCELADO')),
  creado_por UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La sucursal DEBE pertenecer al cliente de la OT (si sucursal_id es NULL no se evalúa)
  CONSTRAINT fk_ot_sucursal_del_cliente FOREIGN KEY (sucursal_id, cliente_id)
    REFERENCES sucursal (id, cliente_id) ON DELETE RESTRICT
);
CREATE INDEX idx_ot_estado ON orden_trabajo (estado, created_at DESC);
CREATE INDEX idx_ot_cliente ON orden_trabajo (cliente_id, created_at DESC);
CREATE INDEX idx_ot_titulo_trgm ON orden_trabajo USING gin (titulo extensions.gin_trgm_ops);
CREATE INDEX idx_ot_codigo_trgm ON orden_trabajo USING gin (codigo_ot extensions.gin_trgm_ops);

-- Historial de estados: eventos inmutables. orden_trabajo.estado es solo el último valor.
CREATE TABLE ot_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id UUID NOT NULL REFERENCES orden_trabajo(id) ON DELETE RESTRICT,
  estado_anterior VARCHAR(30),            -- NULL en el evento de creación
  estado_nuevo VARCHAR(30) NOT NULL,
  autor_id UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ot_evento_ot ON ot_evento (orden_trabajo_id, created_at);

CREATE OR REPLACE FUNCTION bloquear_modificacion_evento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Operación denegada: % es un registro de eventos inmutable.', TG_TABLE_NAME;
END; $$;

CREATE TRIGGER trg_ot_evento_inmutable BEFORE UPDATE OR DELETE ON ot_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_evento();
CREATE TRIGGER trg_ot_evento_no_truncate BEFORE TRUNCATE ON ot_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_evento();

-- updated_at automático
CREATE TRIGGER trg_cliente_upd BEFORE UPDATE ON cliente FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
CREATE TRIGGER trg_sucursal_upd BEFORE UPDATE ON sucursal FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
CREATE TRIGGER trg_ot_upd BEFORE UPDATE ON orden_trabajo FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- ===================== SEGURIDAD (Regla de Oro de los Tres Pasos) =====================
ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_contacto ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_evento ENABLE ROW LEVEL SECURITY;

-- Revocación explícita adicional para roles públicos
REVOKE ALL ON cliente, cliente_contacto, cliente_marca, sucursal, orden_trabajo, ot_evento FROM anon, authenticated;

-- Sin DELETE en ninguna: todo se desactiva
GRANT SELECT, INSERT, UPDATE ON cliente, cliente_contacto, cliente_marca, sucursal, orden_trabajo TO afull_api;
GRANT SELECT, INSERT ON ot_evento TO afull_api;

CREATE POLICY api_acceso ON cliente FOR ALL TO afull_api USING (true) WITH CHECK (true);
CREATE POLICY api_acceso ON cliente_contacto FOR ALL TO afull_api USING (true) WITH CHECK (true);
CREATE POLICY api_acceso ON cliente_marca FOR ALL TO afull_api USING (true) WITH CHECK (true);
CREATE POLICY api_acceso ON sucursal FOR ALL TO afull_api USING (true) WITH CHECK (true);
CREATE POLICY api_acceso ON orden_trabajo FOR ALL TO afull_api USING (true) WITH CHECK (true);
CREATE POLICY api_lectura ON ot_evento FOR SELECT TO afull_api USING (true);
CREATE POLICY api_insercion ON ot_evento FOR INSERT TO afull_api WITH CHECK (true);
```

---

### 14.3 Máquinas de Estado y Esquemas Compartidos (`packages/shared`)

#### Máquina de Estados de la OT (`packages/shared/machines/ot.ts`)
Modelado funcional y exhaustivo de las transiciones permitidas. Admite el paso directo a `EN_TALLER` (trabajos que no requieren pre-prensa ni diseño gráfico) y el paso directo a `TERMINADO` (trabajos de retiro en local sin cuadrilla de montaje):

```ts
export const ESTADOS_OT = ['PENDIENTE','EN_DISENO','EN_TALLER','EN_MONTAJE','TERMINADO','CANCELADO'] as const;
export type EstadoOT = (typeof ESTADOS_OT)[number];

const TRANSICIONES: Record<EstadoOT, readonly EstadoOT[]> = {
  PENDIENTE:  ['EN_DISENO', 'EN_TALLER', 'CANCELADO'],   // EN_TALLER directo: trabajo sin diseño
  EN_DISENO:  ['EN_TALLER', 'CANCELADO'],
  EN_TALLER:  ['EN_MONTAJE', 'TERMINADO', 'CANCELADO'],  // TERMINADO directo: retiro en local
  EN_MONTAJE: ['TERMINADO', 'CANCELADO'],
  TERMINADO:  [],
  CANCELADO:  [],
};

export const transicionesDesde = (de: EstadoOT) => TRANSICIONES[de];
export const puedeTransicionar = (de: EstadoOT, a: EstadoOT) => TRANSICIONES[de].includes(a);
```

#### Esquemas de Validación Zod (`packages/shared/schemas/comercial.ts`)
```ts
import { z } from 'zod';
import { ESTADOS_OT } from '../machines/ot';

export const sucursalSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  ciudad: z.string().trim().max(100).optional(),
  direccion: z.string().trim().max(500).optional(),
  gpsLat: z.number().min(-27.7).max(-19.2),
  gpsLng: z.number().min(-62.7).max(-54.2),
});

export const nuevaOTSchema = z.object({
  clienteId: z.string().uuid(),
  sucursalId: z.string().uuid().optional(),
  titulo: z.string().trim().min(1).max(255),
  descripcion: z.string().trim().max(5000).optional(),
  fechaPrometida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const transicionSchema = z.object({
  desde: z.enum(ESTADOS_OT),   // el estado que el usuario veía: detecta concurrencia/stale
  a: z.enum(ESTADOS_OT),
  comentario: z.string().trim().max(1000).optional(),
});
```

---

### 14.4 Infraestructura Común de la API

#### Manejador de Errores Tipados y Mapeo Postgres (`apps/api/src/lib/errores.ts`)
```ts
export class ErrorApp extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429, message: string) { super(message); }
}

// Errores comunes de Postgres -> respuestas HTTP controladas
export function traducirErrorPg(e: unknown): never {
  const code = (e as { code?: string }).code;
  if (code === '23505') throw new ErrorApp(409, 'Ya existe un registro con ese valor único');
  if (code === '23503') throw new ErrorApp(400, 'Referencia inválida (ej: la sucursal no es de ese cliente)');
  if (code === '23514') throw new ErrorApp(400, 'Un valor no cumple las restricciones');
  if (code === '22P02') throw new ErrorApp(400, 'Identificador o parámetro con formato inválido (UUID malformado)');
  if (code === '22001') throw new ErrorApp(400, 'El valor ingresado excede la longitud máxima permitida');
  throw e;
}
```

En `apps/api/src/index.ts`:
```ts
app.onError((e, c) => {
  if (e instanceof ErrorApp) return c.json({ error: e.message }, e.status);
  console.error(e);
  return c.json({ error: 'Error interno del servidor' }, 500);
});
```

#### Helper de Paginación Estricta (`apps/api/src/lib/paginacion.ts`)
Garantiza el criterio CA-1.1: tamaño fijo inalterable por el cliente y sanitización de comodines LIKE:
```ts
import { z } from 'zod';

export const TAM_PAGINA = 25; // fijo: el cliente no puede solicitar un tamaño arbitrario
export const paginaSchema = z.coerce.number().int().min(1).max(1_000_000).catch(1);
export const desplazamiento = (pagina: number) => (pagina - 1) * TAM_PAGINA;
export const escaparLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export type Pagina<T> = { items: T[]; total: number; pagina: number; tamPagina: number; totalPaginas: number };
export const armarPagina = <T>(items: T[], total: number, pagina: number): Pagina<T> =>
  ({ items, total, pagina, tamPagina: TAM_PAGINA, totalPaginas: Math.max(1, Math.ceil(total / TAM_PAGINA)) });
```

---

### 14.5 Módulo de Clientes (`apps/api/src/modules/clientes`)

#### Servicio de Clientes (`apps/api/src/modules/clientes/service.ts`)
```ts
import { sql } from '../../db/client';
import { auditar } from '../auditoria/service';
import { TAM_PAGINA, desplazamiento, escaparLike, armarPagina } from '../../lib/paginacion';
import { traducirErrorPg } from '../../lib/errores';

export type Ctx = { usuarioId: string; ip?: string };

export async function listarClientes(f: { pagina: number; q?: string; activo?: boolean }) {
  const patron = f.q?.trim() ? `%${escaparLike(f.q.trim())}%` : null;
  const donde = sql`WHERE true
    ${f.activo === undefined ? sql`` : sql`AND activo = ${f.activo}`}
    ${patron ? sql`AND (nombre ILIKE ${patron} OR razon_social ILIKE ${patron}
                        OR ruc ILIKE ${patron} OR codigo ILIKE ${patron})` : sql``}`;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM cliente ${donde}`;
  const items = await sql`
    SELECT id, codigo, nombre, razon_social, ruc, telefono, email, activo FROM cliente ${donde}
    ORDER BY nombre, id LIMIT ${TAM_PAGINA} OFFSET ${desplazamiento(f.pagina)}`;
  return armarPagina(items, total, f.pagina);
}

export async function crearCliente(ctx: Ctx, d: { nombre: string; razonSocial?: string; ruc?: string; telefono?: string; email?: string }) {
  try {
    return await sql.begin(async (tx) => {
      const [{ v }] = await tx`SELECT siguiente_valor('CLI') AS v`;
      const codigo = `CLI-${String(v).padStart(4, '0')}`;
      const [c] = await tx`
        INSERT INTO cliente (codigo, nombre, razon_social, ruc, telefono, email)
        VALUES (${codigo}, ${d.nombre}, ${d.razonSocial ?? null}, ${d.ruc?.trim() || null},
                ${d.telefono ?? null}, ${d.email ?? null}) RETURNING *`;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'cliente.crear', recurso: 'cliente',
                      recursoId: c.id, ip: ctx.ip, metadata: { codigo, nombre: d.nombre } }, tx);
      return c;
    });
  } catch (e) { traducirErrorPg(e); }
}
```

> [!NOTE]
> Al correr dentro de una transacción (`sql.begin`), si la sentencia `INSERT` falla (por ejemplo, por colisión de RUC), la transacción se revierte íntegra junto con la llamada a `siguiente_valor()`. De este modo, **los números de contador no dejan huecos**.

#### Rutas y RBAC de Clientes (`apps/api/src/modules/clientes/routes.ts`)
Todo el subárbol se encuentra blindado bajo los middlewares `requireSesion` y `requireCapacidad('comercial')` (con bypass automático para `admin`):
* `GET /api/clientes` (listado con paginación y búsqueda).
* `POST /api/clientes` (alta con validación Zod).
* `GET /api/clientes/:id` (detalle con contactos, marcas y sucursales activas asociadas).
* `PATCH /api/clientes/:id` (modificación de datos y toggle de `activo`).
* `POST /api/clientes/:id/contactos`, `/marcas`, `/sucursales` (altas hijas).
* `PATCH /api/clientes/:id/contactos/:contactoId`, `/marcas/:marcaId`, `/sucursales/:sucursalId` (edición o desactivación lógica).

---

### 14.6 Módulo Comercial / Órdenes de Trabajo (`apps/api/src/modules/comercial`)

#### Servicio de Órdenes de Trabajo (`apps/api/src/modules/comercial/ot.service.ts`)
```ts
import { sql } from '../../db/client';
import { auditar } from '../auditoria/service';
import { puedeTransicionar, type EstadoOT } from '@afull/shared/machines/ot';
import { ErrorApp, traducirErrorPg } from '../../lib/errores';
import type { Ctx } from '../clientes/service';

const anioAsuncion = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric' }).format(new Date());

export async function crearOT(ctx: Ctx, d: { clienteId: string; sucursalId?: string; titulo: string; descripcion?: string; fechaPrometida?: string }) {
  try {
    return await sql.begin(async (tx) => {
      const [c] = await tx`SELECT activo FROM cliente WHERE id = ${d.clienteId}`;
      if (!c?.activo) throw new ErrorApp(400, 'Cliente inexistente o inactivo');
      if (d.sucursalId) {
        const [s] = await tx`SELECT activo FROM sucursal WHERE id = ${d.sucursalId} AND cliente_id = ${d.clienteId}`;
        if (!s?.activo) throw new ErrorApp(400, 'Sucursal inexistente, inactiva o de otro cliente');
      }
      const anio = anioAsuncion();
      const [{ v }] = await tx`SELECT siguiente_valor(${'OT-' + anio}) AS v`;
      const codigo = `OT-${anio}-${String(v).padStart(4, '0')}`;

      const [ot] = await tx`
        INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, descripcion, fecha_prometida, creado_por)
        VALUES (${codigo}, ${d.clienteId}, ${d.sucursalId ?? null}, ${d.titulo},
                ${d.descripcion ?? null}, ${d.fechaPrometida ?? null}, ${ctx.usuarioId}) RETURNING *`;
      await tx`INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id)
               VALUES (${ot.id}, NULL, 'PENDIENTE', ${ctx.usuarioId})`;
      await auditar({ usuarioId: ctx.usuarioId, accion: 'ot.crear', recurso: 'orden_trabajo',
                      recursoId: ot.id, ip: ctx.ip, metadata: { codigo } }, tx);
      return ot;
    });
  } catch (e) { if (e instanceof ErrorApp) throw e; traducirErrorPg(e); }
}

export async function transicionar(ctx: Ctx, id: string, t: { desde: EstadoOT; a: EstadoOT; comentario?: string }) {
  return sql.begin(async (tx) => {
    // FOR UPDATE bloquea la fila y serializa cambios concurrentes sobre la misma OT
    const [ot] = await tx`SELECT estado FROM orden_trabajo WHERE id = ${id} FOR UPDATE`;
    if (!ot) throw new ErrorApp(404, 'OT no encontrada');
    if (ot.estado !== t.desde) throw new ErrorApp(409, `La OT ya está en ${ot.estado}; recargá la pantalla`);
    if (!puedeTransicionar(ot.estado, t.a)) throw new ErrorApp(400, `Transición no permitida: ${ot.estado} → ${t.a}`);
    if (t.a === 'CANCELADO' && !t.comentario?.trim()) throw new ErrorApp(400, 'Cancelar requiere un motivo');

    await tx`UPDATE orden_trabajo SET estado = ${t.a} WHERE id = ${id}`;
    await tx`INSERT INTO ot_evento (orden_trabajo_id, estado_anterior, estado_nuevo, autor_id, comentario)
             VALUES (${id}, ${ot.estado}, ${t.a}, ${ctx.usuarioId}, ${t.comentario ?? null})`;
    await auditar({ usuarioId: ctx.usuarioId, accion: 'ot.cambio_estado', recurso: 'orden_trabajo',
                    recursoId: id, ip: ctx.ip, metadata: { de: ot.estado, a: t.a } }, tx);
    return { id, estado: t.a };
  });
}
```

> [!IMPORTANT]
> **Serialización y Prevención de Condiciones de Carrera:**
> - `SELECT ... FOR UPDATE` garantiza que si dos operarios o administradores intentan transicionar la misma OT a la vez, el segundo espera la resolución del primero. Al completarse, el chequeo `if (ot.estado !== t.desde)` detecta que el estado previo cambió y devuelve inmediatamente un `409 Conflict` instructivo.
> - La función `siguiente_valor()` serializa la creación de OTs bloqueando la fila de control del año correspondiente hasta el `commit`, garantizando correlatividad estricta.

#### Filtro Eficiente por Rango de Fechas
Para no romper el uso de índices sobre `created_at` ni incurrir en discrepancias por desfases horarios, las consultas SQL de listado aplican el truncamiento con zona horaria de Paraguay:
```sql
${f.desde ? sql`AND created_at >= (${f.desde}::date)::timestamp AT TIME ZONE 'America/Asuncion'` : sql``}
${f.hasta ? sql`AND created_at < ((${f.hasta}::date + 1)::timestamp AT TIME ZONE 'America/Asuncion')` : sql``}
```

#### Modificación Parcial (`PATCH /api/comercial/ot/:id`)
Permite editar únicamente campos operativos (`titulo`, `descripcion`, `fecha_prometida`, `sucursal_id`). Queda **estrictamente prohibido modificar `estado` a través de este endpoint** (debe usarse obligatoriamente `/transicionar`). Además, si la OT se encuentra en estado `TERMINADO` o `CANCELADO`, la API responde de inmediato con `409 Conflict`.

---

## 15. Suite de Tests Automatizados y Criterios de Aceptación (Loop 1)

### 15.1 Tests de Integridad Relacional y Concurrencia (`tests/loop1/ot.test.ts`)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers';
import { crearUsuario } from '../loop0/auth-helpers';
import { crearOT, transicionar } from '../../apps/api/src/modules/comercial/ot.service';

afterAll(cerrarConexiones);

async function clienteTest(nombre = 'zz_test_cliente') {
  const [c] = await admin`
    INSERT INTO cliente (codigo, nombre) VALUES (${'ZZ-' + crypto.randomUUID().slice(0, 8)}, ${nombre}) RETURNING id`;
  return c.id as string;
}

describe('CA-1.5: códigos de OT', () => {
  it('20 creaciones simultáneas dan 20 códigos distintos y consecutivos', async () => {
    const u = await crearUsuario(['comercial']);
    const clienteId = await clienteTest();
    const ots = await Promise.all(
      Array.from({ length: 20 }, () => crearOT({ usuarioId: u.id }, { clienteId, titulo: 'zz_test_concurrente' })),
    );
    const nums = ots.map((o) => Number(o!.codigo_ot.split('-')[2])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(20);
    expect(nums[19] - nums[0]).toBe(19); // consecutivos, sin huecos
  });
});

describe('CA-1.4 / CA-1.8: transiciones', () => {
  it('dos cambios simultáneos desde el mismo estado: uno gana, el otro recibe 409', async () => {
    const u = await crearUsuario(['comercial']);
    const ctx = { usuarioId: u.id };
    const ot = (await crearOT(ctx, { clienteId: await clienteTest(), titulo: 'zz_test_transicion' }))!;

    const r = await Promise.allSettled([
      transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'EN_TALLER' }),
      transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'EN_DISENO' }),
    ]);
    const mal = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(mal).toHaveLength(1);
    expect(mal[0].reason).toMatchObject({ status: 409 });

    // el historial es coherente: creación + 1 transición, y el último evento = estado actual
    const ev = await admin`SELECT estado_nuevo FROM ot_evento WHERE orden_trabajo_id = ${ot.id} ORDER BY created_at, id`;
    const [{ estado }] = await admin`SELECT estado FROM orden_trabajo WHERE id = ${ot.id}`;
    expect(ev).toHaveLength(2);
    expect(ev.at(-1)!.estado_nuevo).toBe(estado);
  });

  it('PENDIENTE → TERMINADO es rechazado, y cancelar sin motivo también', async () => {
    const u = await crearUsuario(['comercial']);
    const ctx = { usuarioId: u.id };
    const ot = (await crearOT(ctx, { clienteId: await clienteTest(), titulo: 'zz_test_invalida' }))!;
    await expect(transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'TERMINADO' })).rejects.toMatchObject({ status: 400 });
    await expect(transicionar(ctx, ot.id, { desde: 'PENDIENTE', a: 'CANCELADO' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('CA-1.6: la sucursal pertenece al cliente (a nivel base de datos)', () => {
  it('la base rechaza una OT con la sucursal de otro cliente', async () => {
    const a = await clienteTest('zz_test_a');
    const b = await clienteTest('zz_test_b');
    const [s] = await admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng)
      VALUES (${b}, ${'zz_suc_' + Date.now()}, -25.3, -57.6) RETURNING id`;
    const u = await crearUsuario();
    await expect(admin`
      INSERT INTO orden_trabajo (codigo_ot, cliente_id, sucursal_id, titulo, creado_por)
      VALUES (${'ZZ-FK-' + Date.now()}, ${a}, ${s.id}, 'zz_test', ${u.id})`,
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('CA-1.3: GPS válido', () => {
  it('la base rechaza coordenadas fuera de Paraguay (ej: lat/lng invertidas)', async () => {
    const c = await clienteTest();
    await expect(admin`
      INSERT INTO sucursal (cliente_id, nombre, gps_lat, gps_lng)
      VALUES (${c}, 'zz_invertida', -57.6, -25.3)`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});
```

---

### 15.2 Test de Rendimiento en Búsqueda Trigram (`tests/loop1/busqueda.test.ts`)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { admin, cerrarConexiones } from '../loop0/helpers';

const tag = Date.now().toString(36);
afterAll(async () => {
  await admin`DELETE FROM cliente WHERE codigo LIKE ${'ZZ-' + tag + '-%'}`;
  await cerrarConexiones();
});

describe('CA-1.2: búsqueda de clientes', () => {
  it('con 5000 clientes, la consulta se ejecuta en menos de 100 ms en la base', async () => {
    await admin`
      INSERT INTO cliente (codigo, nombre, ruc)
      SELECT 'ZZ-' || ${tag} || '-' || g, 'zz_test_' || md5(g::text || ${tag}), 'ZZ' || ${tag} || g
      FROM generate_series(1, 5000) g`;
    await admin`ANALYZE cliente`;

    const plan = await admin.unsafe(`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT id FROM cliente
      WHERE nombre ILIKE '%ab12%' OR razon_social ILIKE '%ab12%' OR ruc ILIKE '%ab12%' OR codigo ILIKE '%ab12%'
      ORDER BY nombre LIMIT 25`);
    const ms = plan[0]['QUERY PLAN'][0]['Execution Time'] as number;
    expect(ms).toBeLessThan(100);
  });
});
```

> [!NOTE]
> - El tiempo se evalúa internamente en el motor mediante `EXPLAIN (ANALYZE, FORMAT JSON)` para aislar la medición de la latencia de red entre GitHub Actions y Supabase.
> - La búsqueda trigram por defecto es sensible a acentos ("Cañete" != "Canete"). Si en la práctica comercial se requiere insensibilidad a tildes, se habilitará la extensión oficial `unaccent` en loops posteriores.

---

### 15.3 Matriz de Verificación de Endpoints de la API

| Escenario de Prueba | Comportamiento Esperado | Código HTTP |
| :--- | :--- | :--- |
| `GET /api/clientes` sin cookie de sesión | Rechazo por falta de autenticación | `401 Unauthorized` |
| `GET /api/clientes` con usuario sin capacidad `comercial` | Rechazo por RBAC | `403 Forbidden` |
| Con 60 clientes cargados: peticiones a páginas 1, 2 y 3 | 25, 25 y 10 items devueltos; `total: 60` | `200 OK` |
| `?pagina=abc` o `?pagina=0` | Sanitización automática: procesa como página 1 | `200 OK` |
| `?pagina=999` (fuera de rango) | Lista `items` vacía `[]` con `total` correcto | `200 OK` |
| Búsqueda por RUC parcial y nombre en minúsculas | Retorna coincidencias exactas y difusas | `200 OK` |
| Búsqueda ingresando caracteres `%` o `_` | Se escapan como texto literal, no comodines SQL | `200 OK` |
| Crear cliente con RUC ya existente | Capturado por `traducirErrorPg(23505)` | `409 Conflict` |
| Crear sucursal con coordenadas fuera del polígono PY | Capturado por validación Zod / Check DB | `400 Bad Request` |
| Modificación `PATCH` sobre OT `TERMINADO` o `CANCELADO` | Bloqueo por estado inmutable final | `409 Conflict` |
| Envío de campo `estado` dentro del cuerpo de un `PATCH` | Rechazado o ignorado; el estado no muta | `400 Bad Request` |

---

### 15.4 Criterios de Aceptación Formales del Loop 1 (CA-1.1 al CA-1.11)

- **CA-1.1 Paginación Estricta:** Tamaño fijo de 25 items. Parámetros inválidos caen a 1. Valores fuera de rango retornan arreglo vacío manteniendo el total. El cliente no puede vulnerar el límite de tamaño.
- **CA-1.2 Rendimiento de Búsqueda:** La consulta de clientes con 5.000 filas se ejecuta en menos de 100 ms dentro del motor de base de datos.
- **CA-1.3 Georreferenciación Válida:** Toda sucursal posee coordenadas obligatorias contenidas en la caja de Paraguay (-27.7 a -19.2 lat / -62.7 a -54.2 lng), validadas por Zod y restricción `CHECK` en base de datos.
- **CA-1.4 Máquina de Estados:** Definida funcionalmente en `packages/shared`. Transiciones inválidas devuelven `400`. Mutaciones concurrentes sobre un estado desactualizado devuelven `409`.
- **CA-1.5 Correlatividad de OTs:** Generación secuencial de códigos `OT-YYYY-XXXX` sin colisiones bajo concurrencia extrema y sin huecos en caso de reversión de transacciones.
- **CA-1.6 Pertenencia Geográfica:** La sucursal de una OT debe pertenecer de forma mandatoria al cliente de la OT, garantizado a nivel de base de datos mediante clave foránea compuesta `(sucursal_id, cliente_id)`.
- **CA-1.7 Prohibición de Borrado Físico:** El rol de la API `afull_api` no posee permisos `DELETE` sobre las tablas operativas; todo borrado se modela lógicamente.
- **CA-1.8 Registro de Eventos Inmutable:** Todo cambio de estado crea atómicamente un `ot_evento` dentro de la misma transacción. La tabla `ot_evento` prohíbe `UPDATE`, `DELETE` y `TRUNCATE`.
- **CA-1.9 Continuidad de RLS:** La prueba `anon.test.ts` del Loop 0 se mantiene en verde, confirmando que las nuevas tablas tienen RLS activo sin políticas públicas.
- **CA-1.10 Autorización RBAC:** Todos los endpoints comerciales exigen la capacidad `comercial` o rol `admin`.
- **CA-1.11 (Loop 1B) Estándar de Componentes UI:** Tabla administrativa unificada con buscador debounced de 300 ms, filtros de estado, rango de fechas y paginación, con estricto límite de 250 líneas por archivo.

---

## 16. Planificación de Loop 1B (Frontend: Shell, TablaAdmin y Vistas)

### 16.1 Tareas Secuenciales de la Fase 1B
1. **Shell de la Aplicación:** Inicialización de Vite + TanStack Router + TailwindCSS (paleta Enterprise aFull #090a0f, #111318, #ea580c), pantalla de autenticación (/login), guardias de sesión y layout con barra de navegación.
2. **Componente Reutilizable `TablaAdmin`:** Componente transversal genérico para listas operativas. Incluye input de búsqueda con debounce de 300 ms, badges/pills de estado con colores oficiales, selector de rango de fechas, controles de paginación previa/siguiente y contador de coincidencias. Se construye una única vez con API declarativa y es heredado por Clientes, OTs, Hojas de Ruta e Insumos.
3. **Vistas de Clientes y OTs:** Construidas bajo el principio de separación estricta: un hook reactivo por vista (`useClientes`, `useOTs`) y un archivo independiente por cada modal (`ModalNuevoCliente.tsx`, `ModalNuevaOT.tsx`, `ModalTransicionOT.tsx`).
4. **Despliegue y Pruebas de Humo:** Despliegue en entorno `dev`, validación visual E2E con Playwright/manual, y posterior pase a producción.

### 16.2 Estrategia de Carga y Semilla con Datos Reales (Dry-Run Import)
Previo al uso en producción, se estructurará un script de importación con bandera `--dry-run` para migrar clientes y sucursales históricas desde la base de datos anterior. Probar la interfaz gráfica contra datos reales (nombres con acentos, caracteres especiales, RUCs heterogéneos) garantiza la detección temprana de fricciones visuales antes del go-live.

