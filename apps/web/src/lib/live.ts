import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

export interface EventoLive {
  tipo: string;
  id: string;
}

// Sin valores por defecto: se configuran en el build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Si faltan, no hay suscripción en tiempo real y la pantalla vive de la consulta periódica.
const entorno = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const SUPABASE_URL = entorno.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = entorno.VITE_SUPABASE_ANON_KEY;

let client: ReturnType<typeof createClient> | null = null;

export function obtenerSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

export function suscribirseLive(cb: (evento: EventoLive) => void): () => void {
  const supabase = obtenerSupabaseClient();
  if (!supabase) return () => {};
  let canal: RealtimeChannel | null = null;
  let temporizadorDebounce: ReturnType<typeof setTimeout> | null = null;

  try {
    canal = supabase.channel('afull-live');
    canal
      .on('broadcast', { event: 'live' }, (payload) => {
        if (temporizadorDebounce) clearTimeout(temporizadorDebounce);
        temporizadorDebounce = setTimeout(() => {
          cb((payload.payload as EventoLive) ?? { tipo: 'desconocido', id: '' });
        }, 1000);
      })
      .subscribe();
  } catch (err) {
    console.error('[live:suscribirse] Error al suscribirse al canal realtime:', err);
  }

  return () => {
    if (temporizadorDebounce) clearTimeout(temporizadorDebounce);
    if (canal) {
      canal.unsubscribe().catch(() => {});
    }
  };
}
