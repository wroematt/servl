'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useCreatePet } from '@/hooks/usePets';
import { FormEvent, useState } from 'react';

interface AddPetModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddPetModal({ open, onClose }: AddPetModalProps) {
  const createPet = useCreatePet();
  const [name, setName] = useState('');
  const [type, setType] = useState<'cat' | 'dog' | 'other'>('cat');
  const [mealWeight, setMealWeight] = useState('80');
  const [snackWeight, setSnackWeight] = useState('30');
  const [targetDaily, setTargetDaily] = useState('200');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setName(''); setType('cat'); setMealWeight('80');
    setSnackWeight('30'); setTargetDaily('200'); setPhoto(null); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    fd.append('name', name);
    fd.append('type', type);
    fd.append('meal_weight_g', mealWeight);
    fd.append('snack_weight_g', snackWeight);
    fd.append('target_daily_g', targetDaily);
    if (photo) fd.append('photo', photo);

    try {
      await createPet.mutateAsync(fd);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add pet');
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add a pet">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          placeholder="Mochi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="cat">Cat</option>
          <option value="dog">Dog</option>
          <option value="other">Other</option>
        </Select>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Meal weight (g)"
            type="number"
            min={1}
            max={500}
            value={mealWeight}
            onChange={(e) => setMealWeight(e.target.value)}
            required
          />
          <Input
            label="Snack weight (g)"
            type="number"
            min={1}
            max={500}
            value={snackWeight}
            onChange={(e) => setSnackWeight(e.target.value)}
            required
          />
          <Input
            label="Daily target (g)"
            type="number"
            min={1}
            max={2000}
            value={targetDaily}
            onChange={(e) => setTargetDaily(e.target.value)}
            required
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Photo <span className="text-text-tertiary">(optional, max 5MB)</span>
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-text-secondary"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createPet.isPending}>
            Add pet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
