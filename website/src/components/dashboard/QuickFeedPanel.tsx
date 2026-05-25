'use client';

import { FeedButton } from '@/components/pets/FeedButton';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Pet } from '@/hooks/usePets';
import { IconPaw } from '@tabler/icons-react';

interface QuickFeedPanelProps {
  pets: Pet[];
  loading?: boolean;
}

export function QuickFeedPanel({ pets, loading }: QuickFeedPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Feed</CardTitle>
      </CardHeader>
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-bg" />
          ))}
        </div>
      ) : pets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <IconPaw size={24} className="text-text-tertiary" />
          <p className="text-sm text-text-tertiary">No pets yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pets.map((pet) => {
            const intakePct = pet.daily_target_g > 0
              ? Math.min(100, Math.round(((pet.today_intake_g ?? 0) / pet.daily_target_g) * 100))
              : 0;
            return (
              <div
                key={pet.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{pet.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${intakePct}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-text-tertiary">
                      {pet.today_intake_g ?? 0}g
                    </span>
                  </div>
                </div>
                {pet.device_id ? (
                  <div className="flex gap-1.5">
                    <FeedButton petId={pet.id} type="meal" />
                    <FeedButton petId={pet.id} type="snack" />
                  </div>
                ) : (
                  <span className="text-xs text-text-tertiary">No device</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
