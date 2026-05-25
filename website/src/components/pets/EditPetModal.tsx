'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pet, useUpdatePet } from '@/hooks/usePets';
import { FormEvent, useState } from 'react';

interface EditPetModalProps {
  pet: Pet;
  open: boolean;
  onClose: () => void;
}

export function EditPetModal({ pet, open, onClose }: EditPetModalProps) {
  const updatePet = useUpdatePet(pet.id);
  const [name, setName] = useState(pet.name);
  const [type, setType] = useState<'cat' | 'dog' | 'other'>(pet.type);
  const [mealWeight, setMealWeight] = useState(String(pet.meal_weight_g));
  const [snackWeight, setSnackWeight] = useState(String(pet.snack_weight_g));
  const [targetDaily, setTargetDaily] = useState(String(pet.daily_target_g));
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await updatePet.mutateAsync({
        name,
        type,
        meal_weight_g:  parseInt(mealWeight, 10),
        snack_weight_g: parseInt(snackWeight, 10),
        daily_target_g: parseInt(targetDaily, 10),
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update pet');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${pet.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
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
        {error && (
          <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={updatePet.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
