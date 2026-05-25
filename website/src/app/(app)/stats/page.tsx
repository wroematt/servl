'use client';

import { IntakeChart } from '@/components/charts/IntakeChart';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePetStats, usePets } from '@/hooks/usePets';
import { formatWeight } from '@/lib/utils';
import { useState } from 'react';

export default function StatsPage() {
  const { data: pets } = usePets();

  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedPetId, setSelectedPetId] = useState<string>('__all__');

  const targetPetId =
    selectedPetId !== '__all__' ? selectedPetId : pets?.[0]?.id ?? '';

  const { data: stats, isLoading } = usePetStats(targetPetId, from, to);

  const totalG = stats?.reduce((s, d) => s + d.total_g, 0) ?? 0;
  const totalFeeds = stats?.reduce((s, d) => s + d.feed_count, 0) ?? 0;
  const avgDailyG = stats && stats.length > 0 ? Math.round(totalG / stats.length) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Statistics</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Feed history and intake analysis.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Pet
            </label>
            <select
              className="rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              value={selectedPetId}
              onChange={(e) => setSelectedPetId(e.target.value)}
            >
              <option value="__all__">All pets</option>
              {pets?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              From
            </label>
            <input
              type="date"
              className="rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              To
            </label>
            <input
              type="date"
              className="rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total dispensed', value: formatWeight(totalG) },
          { label: 'Total feeds', value: String(totalFeeds) },
          { label: 'Avg daily', value: formatWeight(avgDailyG) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <p className="font-mono text-2xl font-semibold text-text">{value}</p>
            <p className="mt-1 text-xs text-text-tertiary">{label}</p>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily intake</CardTitle>
        </CardHeader>
        {isLoading ? (
          <div className="h-48 animate-pulse rounded-lg bg-bg" />
        ) : (stats?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No data for selected range.
          </p>
        ) : (
          <IntakeChart data={stats!} />
        )}
      </Card>

      {/* Table */}
      {(stats?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily breakdown</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Feeds</th>
                </tr>
              </thead>
              <tbody>
                {stats!.map((d) => (
                  <tr key={d.date} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono text-text-secondary">{d.date}</td>
                    <td className="py-2 text-right font-mono text-text-secondary">
                      {formatWeight(d.total_g)}
                    </td>
                    <td className="py-2 text-right font-mono text-text-secondary">
                      {d.feed_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
