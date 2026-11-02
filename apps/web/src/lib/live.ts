import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

export interface EventoLive {
  tipo: string;
  id: string;
}

const DEFAULT_SUPABASE_URL = 'https://oxthxdnyxabupeebzwmn.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94dGh4ZG55eGFidXBlZWJ6d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTQ0NTYsImV4cCI6MjEwOTE3MDQ1Nn0.RcCmHHL62b4pJBrNO2Yfn24n00S_QzBrMoUggfgDFvQ';

const SUPABASE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

let client: ReturnType<typeof createClient> | null = null;

export function obtenerSupabaseClient() {
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
