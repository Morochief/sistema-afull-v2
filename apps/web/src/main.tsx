import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster, toast } from 'sonner';
import { queryClient } from './lib/queryClient.js';
import { router } from './router.js';
import { iniciarSincronizador } from './lib/cola-offline.js';
import { sincronizarFotos, suscribirFotos } from './lib/fotos-pendientes.js';
import './index.css';

// Lo guardado sin señal se manda solo al volver la conexión (y cada 30 s).
iniciarSincronizador((n) => {
  void queryClient.invalidateQueries();
  toast.success(n === 1 ? 'Se envió 1 acción guardada sin señal.' : `Se enviaron ${n} acciones guardadas sin señal.`);
}, () =>
  // Después de las acciones, las fotos guardadas en el celular (L4.E3).
  sincronizarFotos().then((n) => {
    if (n > 0) {
      void queryClient.invalidateQueries({ queryKey: ['archivos'] });
      toast.success(n === 1 ? 'Se subió 1 foto guardada.' : `Se subieron ${n} fotos guardadas.`);
    }
  })
);
// Cuando sube (o se guarda) una foto, las galerías abiertas se refrescan.
suscribirFotos(() => void queryClient.invalidateQueries({ queryKey: ['archivos'] }));
// Para abrir la app sin señal (solo en el sitio publicado; en desarrollo molestaría con caché vieja).
const esProduccion = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;
if (esProduccion && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);

const rootElement = document.getElementById('root');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#111318',
              borderColor: '#1f2937',
              color: '#f3f4f6',
            },
          }}
        />
      </QueryClientProvider>
    </React.StrictMode>
  );
}
