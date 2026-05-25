'use client';

import { TodayFeedTable } from '@/components/dashboard/TodayFeedTable';
import { QuickFeedPanel } from '@/components/dashboard/QuickFeedPanel';
import { HopperIndicator } from '@/components/ui/HopperIndicator';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDevices } from '@/hooks/useDevices';
import { useFeedHistory, usePets } from '@/hooks/usePets';
import { useAuth } from '@/providers/AuthProvider';
import { IconCpu } from '@tabler/icons-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: pets, isLoading: petsLoading } = usePets();
  const { data: devices, isLoading: devicesLoading } = useDevices();

  // Use the first pet's history as today's feed — aggregate all pets
  const today = new Date().toISOString().slice(0, 10);
  const { data: feedData, isLoading: feedLoading } = useFeedHistory(
    pets?.[0]?.id ?? '',
    { from: today, to: today, page_size: 50 },
  );

  const petNames = Object.fromEntries(
    (pets ?? []).map((p) => [p.id, p.name]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">
          Good {getGreeting()}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left col — quick feed + today's table */}
        <div className="lg:col-span-2 space-y-4">
          <QuickFeedPanel pets={pets ?? []} loading={petsLoading} />
          <TodayFeedTable
            events={feedData?.data ?? []}
            loading={feedLoading || petsLoading}
            petNames={petNames}
          />
        </div>

        {/* Right col — devices */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Devices</CardTitle>
              <Link href="/devices" className="text-xs text-primary hover:underline">
                See all
              </Link>
            </CardHeader>
            {devicesLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-bg" />
                ))}
              </div>
            ) : (devices?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <IconCpu size={24} className="text-text-tertiary" />
                <p className="text-sm text-text-tertiary">No devices yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {devices!.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <HopperIndicator pct={d.hopper_pct} showLabel={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{d.name}</p>
                      <StatusBadge status={d.status} />
                    </div>
                    <span className="font-mono text-sm font-medium text-text-secondary">
                      {d.hopper_pct !== null ? `${d.hopper_pct}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
