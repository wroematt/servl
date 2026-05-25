import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-primary-light text-primary',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  info: 'bg-blue-50 text-blue-700',
  muted: 'bg-bg text-text-tertiary border border-border',
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TriggerBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    manual: { label: 'Manual', variant: 'default' },
    schedule: { label: 'Schedule', variant: 'info' },
    voice: { label: 'Voice', variant: 'muted' },
    api: { label: 'API', variant: 'muted' },
  };
  const { label, variant } = map[type] ?? { label: type, variant: 'muted' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'warning' },
    confirmed: { label: 'Confirmed', variant: 'success' },
    failed: { label: 'Failed', variant: 'danger' },
    timeout: { label: 'Timeout', variant: 'danger' },
    online: { label: 'Online', variant: 'success' },
    offline: { label: 'Offline', variant: 'muted' },
    error: { label: 'Error', variant: 'danger' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'muted' };
  return <Badge variant={variant}>{label}</Badge>;
}
