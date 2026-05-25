import { cn } from '@/lib/utils';

interface HopperIndicatorProps {
  pct: number | null;
  className?: string;
  showLabel?: boolean;
}

export function HopperIndicator({ pct, className, showLabel = true }: HopperIndicatorProps) {
  const level = pct ?? 0;
  const color =
    level > 50
      ? 'bg-success'
      : level > 20
        ? 'bg-warning'
        : 'bg-danger';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* visual tube */}
      <div className="relative h-10 w-5 overflow-hidden rounded-sm border border-border-strong bg-bg">
        <div
          className={cn('absolute bottom-0 left-0 right-0 transition-all', color)}
          style={{ height: `${level}%` }}
        />
      </div>
      {showLabel && (
        <span className="font-mono text-xs text-text-secondary">
          {pct !== null ? `${pct}%` : '—'}
        </span>
      )}
    </div>
  );
}
