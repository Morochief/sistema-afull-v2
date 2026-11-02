import React from 'react';
import { cn } from '../../lib/utils.js';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'neutral';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantes: Record<BadgeVariant, string> = {
  default: 'bg-[#ea580c]/15 text-[#ea580c] border-[#ea580c]/30',
  success: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40',
  warning: 'bg-amber-950/40 text-amber-400 border-amber-800/40',
  danger: 'bg-red-950/40 text-red-400 border-red-800/40',
  neutral: 'bg-neutral-800 text-neutral-300 border-neutral-700',
};

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border',
        variantes[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
