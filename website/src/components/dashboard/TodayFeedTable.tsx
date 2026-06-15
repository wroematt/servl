'use client';

import { StatusBadge, TriggerBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { FeedEvent } from '@/hooks/usePets';
import { formatDateTime, formatWeight } from '@/lib/utils';

interface TodayFeedTableProps {
  events: FeedEvent[];
  loading?: boolean;
  petNames: Record<string, string>;
}

export function TodayFeedTable({ events, loading, petNames }: TodayFeedTableProps) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Today&apos;s feeds</CardTitle>
      </CardHeader>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-bg" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-tertiary">No feeds today yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text-tertiary">
                <th className="pb-2 text-left font-medium">Time</th>
                <th className="pb-2 text-left font-medium">Pet</th>
                <th className="pb-2 text-left font-medium">Trigger</th>
                <th className="pb-2 text-right font-medium">Weight</th>
                <th className="pb-2 text-left font-medium pl-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono text-text-secondary">
                    {formatDateTime(ev.dispensed_at)}
                  </td>
                  <td className="py-2 text-text">
                    {petNames[ev.pet_id] ?? '—'}
                  </td>
                  <td className="py-2">
                    <TriggerBadge type={ev.trigger_type} />
                    {ev.trigger_type === 'manual' && ev.triggered_by_name && (
                      <div className="mt-0.5 text-text-tertiary">{ev.triggered_by_name}</div>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {formatWeight(ev.weight_requested_g)}
                    {' / '}
                    {ev.weight_dispensed_g !== null ? formatWeight(ev.weight_dispensed_g) : '—'}
                  </td>
                  <td className="py-2 pl-4">
                    <StatusBadge status={ev.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
