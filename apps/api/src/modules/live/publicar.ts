const DEFAULT_URL = 'https://oxthxdnyxabupeebzwmn.supabase.co';
const DEFAULT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94dGh4ZG55eGFidXBlZWJ6d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTQ0NTYsImV4cCI6MjEwOTE3MDQ1Nn0.RcCmHHL62b4pJBrNO2Yfn24n00S_QzBrMoUggfgDFvQ';

export async function publicarLive(tipo: string, id: string): Promise<void> {
  const baseUrl = process.env.SUPABASE_URL || DEFAULT_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;
  const endpoint = `${baseUrl}/realtime/v1/api/broadcast`;

  try {
    const cuerpo = {
      messages: [
        {
          topic: 'afull-live',
          event: 'live',
          payload: { tipo, id },
        },
      ],
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok && res.status !== 202) {
      console.error(`[live:publicar] Broadcast devolvió status inesperado: ${res.status}`);
    }
  } catch (err) {
    console.error('[live:publicar] Fallo al emitir broadcast realtime:', err);
  }
}
