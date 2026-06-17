'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pet, useCreatePet } from '@/hooks/usePets';
import { IconPhoto, IconX } from '@tabler/icons-react';
import { FormEvent, useRef, useState } from 'react';

interface AddPetModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddPetModal({ open, onClose }: AddPetModalProps) {
  const createPet = useCreatePet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Pet['type']>('cat');
  const [mealWeight, setMealWeight] = useState('80');
  const [snackWeight, setSnackWeight] = useState('30');
  const [targetDaily, setTargetDaily] = useState('200');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setName(''); setType('cat'); setMealWeight('80');
    setSnackWeight('30'); setTargetDaily('200');
    setPhoto(null); setPhotoPreview(null); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (file: File | null) => {
    setPhoto(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    fd.append('name', name);
    fd.append('type', type);
    fd.append('meal_weight_g', mealWeight);
    fd.append('snack_weight_g', snackWeight);
    fd.append('daily_target_g', targetDaily);   // ← correct backend field name
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
          onChange={(e) => setType(e.target.value as Pet['type'])}
        >
          <option value="cat">Cat</option>
          <option value="dog">Dog</option>
          <option value="rabbit">Rabbit</option>
          <option value="guinea_pig">Guinea Pig</option>
          <option value="hamster">Hamster</option>
          <option value="bird">Bird</option>
          <option value="tortoise">Tortoise</option>
          <option value="horse">Horse</option>
          <option value="ferret">Ferret</option>
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
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Photo <span className="text-text-tertiary">(optional, max 5 MB)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {photoPreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Preview"
                className="h-20 w-20 rounded-xl object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => handleFileChange(null)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow"
              >
                <IconX size={10} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-bg py-4 text-sm text-text-tertiary transition-colors hover:border-primary hover:bg-primary-light hover:text-primary"
            >
              <IconPhoto size={18} />
              Click to upload a photo
            </button>
          )}
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
