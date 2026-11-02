import React from 'react';
import { cn } from '../../lib/utils.js';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          ref={ref}
          className={cn(
            'flex h-9 w-full rounded-md border border-[#1f2937] bg-[#111318] px-3 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 transition-colors focus-visible:outline-none focus-visible:border-[#ea580c] focus-visible:ring-1 focus-visible:ring-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
