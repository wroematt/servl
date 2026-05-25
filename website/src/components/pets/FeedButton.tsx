'use client';

import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface FeedButtonProps {
  petId: string;
  type: 'meal' | 'snack';
  label?: string;
  disabled?: boolean;
}

export function FeedButton({ petId, type, label, disabled }: FeedButtonProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await api.post(`/feed/${type}`, { petId });
      setOk(true);
      setTimeout(() => setOk(false), 2000);
      qc.invalidateQueries({ queryKey: ['pets'] });
      qc.invalidateQueries({ queryKey: ['feed-history'] });
      qc.invalidateQueries({ queryKey: ['today-feeds'] });
    } catch { /* error handled silently — optimistic button */ }
    finally { setLoading(false); }
  };

  return (
    <Button
      size="sm"
      variant={ok ? 'secondary' : 'primary'}
      loading={loading}
      disabled={disabled || loading}
      onClick={handle}
      className="min-w-[64px]"
    >
      {ok ? '✓' : (label ?? (type === 'meal' ? 'Meal' : 'Snack'))}
    </Button>
  );
}
