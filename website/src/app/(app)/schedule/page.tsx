'use client';

import { ScheduleTable } from '@/components/schedule/ScheduleTable';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { usePets } from '@/hooks/usePets';
import { CreateScheduleInput, Schedule, useCreateSchedule, useSchedules, useUpdateSchedule } from '@/hooks/useSchedules';
import { IconPlus } from '@tabler/icons-react';
import { FormEvent, useState } from 'react';

export default function SchedulePage() {
  const { data: schedules, isLoading } = useSchedules();
  const { data: pets } = usePets();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Schedule</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Automated feeding times for all your pets.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowModal(true); }}>
          <IconPlus size={16} />
          Add schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface border border-border" />
      ) : (
        <ScheduleTable
          schedules={schedules ?? []}
          onEdit={(s) => { setEditing(s); setShowModal(true); }}
        />
      )}

      <ScheduleModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        pets={pets ?? []}
        editing={editing}
      />
    </div>
  );
}

interface Pet { id: string; name: string; meal_weight_g: number; snack_weight_g: number; }
interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  pets: Pet[];
  editing: Schedule | null;
}

function ScheduleModal({ open, onClose, pets, editing }: ScheduleModalProps) {
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule(editing?.id ?? '');

  const [petId, setPetId] = useState(editing?.pet_id ?? pets[0]?.id ?? '');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [feedType, setFeedType] = useState<'meal' | 'snack' | 'custom'>(
    editing?.feed_type ?? 'meal',
  );
  const [weightG, setWeightG] = useState(String(editing?.weight_g ?? 80));
  const [time, setTime] = useState(() => {
    if (editing?.cron_expression) {
      const [min, hour] = editing.cron_expression.split(' ');
      return `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }
    return '08:00';
  });
  const [days, setDays] = useState<string[]>(() => {
    if (editing?.cron_expression) {
      const dow = editing.cron_expression.split(' ')[4];
      return dow === '*' ? [] : dow.split(',');
    }
    return [];
  });
  const [error, setError] = useState('');

  const toggleDay = (d: string) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  const buildCron = () => {
    const [h, m] = time.split(':');
    const dow = days.length === 0 ? '*' : days.sort().join(',');
    return `${parseInt(m)} ${parseInt(h)} * * ${dow}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const body: CreateScheduleInput = {
      pet_id: petId,
      label,
      feed_type: feedType,
      weight_g: Number(weightG),
      cron_expression: buildCron(),
    };
    try {
      if (editing) {
        await updateSchedule.mutateAsync(body);
      } else {
        await createSchedule.mutateAsync(body);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    }
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isPending = createSchedule.isPending || updateSchedule.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit schedule' : 'New schedule'}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Pet"
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
          required
        >
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          label="Label"
          placeholder="Morning meal"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Feed type"
            value={feedType}
            onChange={(e) => setFeedType(e.target.value as typeof feedType)}
          >
            <option value="meal">Meal</option>
            <option value="snack">Snack</option>
            <option value="custom">Custom</option>
          </Select>
          <Input
            label="Weight (g)"
            type="number"
            min={1}
            max={500}
            value={weightG}
            onChange={(e) => setWeightG(e.target.value)}
            required
          />
        </div>
        <Input
          label="Time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
        />
        <div>
          <label className="mb-2 block text-xs font-medium text-text-secondary">
            Days <span className="text-text-tertiary">(leave empty = every day)</span>
          </label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(String(i))}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  days.includes(String(i))
                    ? 'bg-primary text-white'
                    : 'bg-bg border border-border-strong text-text-secondary hover:bg-border'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            {editing ? 'Save changes' : 'Add schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
