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
  /**
   * True when this pet already has a feed in progress (a feed_event still
   * 'pending' — the device hasn't confirmed dispensing yet). The backend only
   * allows one pending feed per pet at a time and would 409 a second request,
   * so disable the button here with an explanatory tooltip instead. Clears
   * automatically once the device confirms or the 30s worker timeout fires.
   */
  pending?: boolean;
}

export function FeedButton({ petId, type, label, disabled, pending }: FeedButtonProps) {
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
      disabled={disabled || pending || loading}
      title={pending ? 'A feed is already in progress for this pet — wait for it to finish (up to 30s)' : undefined}
      onClick={handle}
      className="min-w-[64px]"
    >
      {ok ? '✓' : (label ?? (type === 'meal' ? 'Meal' : 'Snack'))}
    </Button>
  );
}
