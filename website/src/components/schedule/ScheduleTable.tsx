'use client';

import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Schedule, useDeleteSchedule, useUpdateSchedule } from '@/hooks/useSchedules';
import { cronToHuman, formatWeight } from '@/lib/utils';
import { IconTrash } from '@tabler/icons-react';

interface ScheduleTableProps {
  schedules: Schedule[];
  onEdit?: (s: Schedule) => void;
}

export function ScheduleTable({ schedules, onEdit }: ScheduleTableProps) {
  const deleteSchedule = useDeleteSchedule();

  if (schedules.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-tertiary">
        No schedules yet. Add one to automate feeding.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-tertiary">
            <th className="px-4 py-3 text-left font-medium">Label</th>
            <th className="px-4 py-3 text-left font-medium">Pet</th>
            <th className="px-4 py-3 text-left font-medium">Time</th>
            <th className="px-4 py-3 text-left font-medium">Type</th>
            <th className="px-4 py-3 text-right font-medium">Weight</th>
            <th className="px-4 py-3 text-center font-medium">Enabled</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <ScheduleRow key={s.id} schedule={s} onEdit={onEdit} deleteSchedule={deleteSchedule} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({
  schedule,
  onEdit,
  deleteSchedule,
}: {
  schedule: Schedule;
  onEdit?: (s: Schedule) => void;
  deleteSchedule: ReturnType<typeof useDeleteSchedule>;
}) {
  const updateSchedule = useUpdateSchedule(schedule.id);

  const handleToggle = (enabled: boolean) => {
    updateSchedule.mutate({ enabled });
  };

  const handleDelete = () => {
    if (confirm(`Delete schedule "${schedule.label}"?`)) {
      deleteSchedule.mutate(schedule.id);
    }
  };

  const typeLabel: Record<string, string> = { meal: 'Meal', snack: 'Snack', custom: 'Custom' };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-bg/50 transition-colors">
      <td className="px-4 py-3 text-text font-medium">{schedule.label}</td>
      <td className="px-4 py-3 text-text-secondary">{schedule.pet_name ?? '—'}</td>
      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
        {cronToHuman(schedule.cron_expression)}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-text-secondary">{typeLabel[schedule.feed_type] ?? schedule.feed_type}</span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-text-secondary">
        {formatWeight(schedule.weight_g)}
      </td>
      <td className="px-4 py-3 text-center">
        <Toggle
          checked={schedule.enabled}
          onChange={handleToggle}
          disabled={updateSchedule.isPending}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(schedule)}>
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-danger hover:text-danger"
          >
            <IconTrash size={14} />
          </Button>
        </div>
      </td>
    </tr>
  );
}
