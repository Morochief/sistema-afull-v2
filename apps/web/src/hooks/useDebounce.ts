import { useState, useEffect } from 'react';

export function useDebounce<T>(valor: T, retardoMs: number = 300): T {
  const [valorDebounced, setValorDebounced] = useState<T>(valor);

  useEffect(() => {
    const timer = setTimeout(() => {
      setValorDebounced(valor);
    }, retardoMs);

    return () => {
      clearTimeout(timer);
    };
  }, [valor, retardoMs]);

  return valorDebounced;
}
