'use client';

import { PetStats } from '@/hooks/usePets';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface IntakeChartProps {
  data: PetStats[];
}

export function IntakeChart({ data }: IntakeChartProps) {
  const formatted = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    intake: d.total_g,
    feeds: d.feed_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D8" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#9C9C96' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9C9C96' }}
          axisLine={false}
          tickLine={false}
          unit="g"
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: '1px solid #E2E0D8',
            borderRadius: 8,
            backgroundColor: '#fff',
          }}
          formatter={(v: number) => [`${v}g`, 'Intake']}
        />
        <Bar dataKey="intake" fill="#5E6B43" radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
