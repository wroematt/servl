'use client';

import { cn } from '@/lib/utils';
import { IconX } from '@tabler/icons-react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* panel */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-text">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-tertiary hover:bg-bg hover:text-text"
          >
            <IconX size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
