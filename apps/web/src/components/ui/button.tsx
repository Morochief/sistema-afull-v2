import React from 'react';
import { cn } from '../../lib/utils.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  cargando?: boolean;
};

const variantes: Record<ButtonVariant, string> = {
  primary: 'bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-sm font-medium',
  secondary: 'bg-[#1f2937] hover:bg-[#374151] text-neutral-100 font-medium',
  danger: 'bg-red-600 hover:bg-red-700 text-white font-medium',
  ghost: 'bg-transparent hover:bg-[#1f2937] text-neutral-300 hover:text-white',
  outline: 'border border-[#1f2937] hover:bg-[#1f2937] text-neutral-200',
};

const tamaños: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', cargando, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || cargando}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          variantes[variant],
          tamaños[size],
          className
        )}
        {...props}
      >
        {cargando ? (
          <span className="flex items-center gap-1.5">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Cargando...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';
