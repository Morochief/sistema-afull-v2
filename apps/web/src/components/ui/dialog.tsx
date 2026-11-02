import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export type DialogProps = {
  abierto: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
};

export function Dialog({ abierto, onCerrar, children }: DialogProps) {
  useEffect(() => {
    if (!abierto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div className="relative z-50 w-full max-w-lg rounded-md border border-[#1f2937] bg-[#111318] p-6 shadow-2xl transition-all max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar modal"
          className="absolute right-4 top-4 rounded-sm text-neutral-400 hover:text-white hover:bg-[#1f2937] p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-1.5 text-left mb-4', className)} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-base font-bold text-white tracking-tight', className)} {...props}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-neutral-400', className)} {...props}>
      {children}
    </p>
  );
}

export function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-end gap-2 mt-6 pt-3 border-t border-[#1f2937]', className)} {...props}>
      {children}
    </div>
  );
}
