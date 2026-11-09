import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tomarTokenDelEnlace, portalYo, portalOTs, portalPedidos } from '../lib/api-portal.js';
import { ErrorApi } from '../lib/api.js';
import { FormPedido } from '../components/portal/FormPedido.js';
import { ListaPedidos, ListaTrabajos } from '../components/portal/ListasPortal.js';
import { Skeleton } from '../components/ui/skeleton.js';

/** Portal del cliente (público, por enlace). No usa la sesión interna ni redirige al login. */
export function PortalPage() {
  const [token] = useState(tomarTokenDelEnlace);
  const [pestana, setPestana] = useState<'pedidos' | 'trabajos'>('pedidos');
  const yo = useQuery({ queryKey: ['portal', 'yo'], queryFn: () => portalYo(token!), enabled: Boolean(token), retry: false });
  const pedidos = useQuery({ queryKey: ['portal', 'pedidos'], queryFn: () => portalPedidos(token!), enabled: Boolean(yo.data) });
  const ots = useQuery({ queryKey: ['portal', 'ots'], queryFn: () => portalOTs(token!), enabled: Boolean(yo.data) && pestana === 'trabajos' });

  const invalido = !token || (yo.error instanceof ErrorApi && yo.error.status === 401);
  return (
    <div className="min-h-screen bg-[#090a0f] px-4 py-6 text-neutral-100">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#ea580c] font-bold text-white">a</div>
          <div>
            <div className="text-xs text-neutral-400">aFull · Portal de clientes</div>
            <h1 className="text-lg font-bold text-white">{yo.data?.cliente ?? ' '}</h1>
          </div>
        </header>
        {invalido ? (
          <p className="rounded-md border border-red-900/40 bg-red-950/10 p-4 text-sm text-red-300">Este enlace no es válido o ya venció. Pedile uno nuevo a aFull.</p>
        ) : !yo.data ? (
          yo.error ? <p className="text-sm text-red-300">{(yo.error as Error).message}</p> : <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="inline-flex rounded-md border border-[#1f2937] bg-[#111318] p-0.5 text-sm" role="tablist">
              {(['pedidos', 'trabajos'] as const).map((p) => (
                <button key={p} role="tab" aria-selected={pestana === p} type="button" onClick={() => setPestana(p)}
                  className={`rounded px-4 py-1.5 ${pestana === p ? 'bg-[#ea580c] text-white' : 'text-neutral-300'}`}>
                  {p === 'pedidos' ? 'Mis pedidos' : 'Trabajos'}
                </button>
              ))}
            </div>
            {pestana === 'pedidos' ? (
              <div className="space-y-4">
                <FormPedido token={token!} yo={yo.data} onEnviado={() => void pedidos.refetch()} />
                {pedidos.isLoading ? <p className="text-sm text-neutral-500">Cargando tus pedidos…</p> : <ListaPedidos pedidos={pedidos.data?.items ?? []} token={token!} onCambio={() => void pedidos.refetch()} />}
              </div>
            ) : ots.isLoading ? (
              <p className="text-sm text-neutral-500">Cargando tus trabajos…</p>
            ) : (
              <ListaTrabajos ots={ots.data?.items ?? []} />
            )}
            <p className="text-center text-[11px] text-neutral-500">Enlace para {yo.data.para}. No lo compartas: quien lo tenga puede ver tus trabajos y hacer pedidos.</p>
          </>
        )}
      </div>
    </div>
  );
}
