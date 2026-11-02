import React from 'react';
import { cn } from '../../lib/utils.js';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-xs font-semibold text-neutral-300 select-none block mb-1', className)}
      {...props}
    >
      {children}
    </label>
  );
}
