// Sin valores por defecto a propósito: si faltan las variables, no se publica (los clientes
// tienen la consulta periódica de respaldo). Un default fijo al proyecto afull-dev haría que
// un deploy de prod mal configurado publique en dev sin que nadie lo note.
let avisado = false;

export async function publicarLive(tipo: string, id: string): Promise<void> {
  const baseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    if (!avisado) {
      console.warn('[live:publicar] SUPABASE_URL/SUPABASE_ANON_KEY no configuradas: no se publica (queda el respaldo por consulta).');
      avisado = true;
    }
    return;
  }
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
