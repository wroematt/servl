'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pet, useUpdatePet } from '@/hooks/usePets';
import { resolvePhotoUrl } from '@/lib/utils';
import { IconCamera, IconPaw, IconX } from '@tabler/icons-react';
import Image from 'next/image';
import { FormEvent, useRef, useState } from 'react';

interface EditPetModalProps {
  pet: Pet;
  open: boolean;
  onClose: () => void;
}

export function EditPetModal({ pet, open, onClose }: EditPetModalProps) {
  const updatePet = useUpdatePet(pet.id);
  const [name, setName] = useState(pet.name);
  const [type, setType] = useState(pet.type);
  const [mealWeight, setMealWeight] = useState(String(pet.meal_weight_g));
  const [snackWeight, setSnackWeight] = useState(String(pet.snack_weight_g));
  const [targetDaily, setTargetDaily] = useState(String(pet.daily_target_g));
  const [error, setError] = useState('');

  // Photo state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    resolvePhotoUrl(pet.photo_url),
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(resolvePhotoUrl(pet.photo_url));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (photoFile) {
        // Send as multipart so the new photo is stored server-side
        const form = new FormData();
        form.append('name', name);
        form.append('type', type);
        form.append('meal_weight_g', mealWeight);
        form.append('snack_weight_g', snackWeight);
        form.append('daily_target_g', targetDaily);
        form.append('photo', photoFile);
        await updatePet.mutateAsync(form);
      } else {
        await updatePet.mutateAsync({
          name,
          type,
          meal_weight_g:  parseInt(mealWeight, 10),
          snack_weight_g: parseInt(snackWeight, 10),
          daily_target_g: parseInt(targetDaily, 10),
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update pet');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${pet.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Photo picker */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-bg">
              {photoPreview ? (
                <Image
                  src={photoPreview}
                  alt={pet.name}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <IconPaw size={24} className="text-text-tertiary" />
              )}
            </div>
            {/* Camera overlay button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Change photo"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              <IconCamera size={12} />
            </button>
            {/* Clear new photo selection */}
            {photoFile && (
              <button
                type="button"
                onClick={clearPhoto}
                title="Undo photo change"
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-tertiary hover:text-danger transition-colors"
              >
                <IconX size={10} />
              </button>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
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
