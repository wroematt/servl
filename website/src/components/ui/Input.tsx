import { cn } from '@/lib/utils';
import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
          error && 'border-danger focus:border-danger focus:ring-danger/30',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  ),
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
          error && 'border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  ),
);
Select.displayName = 'Select';
