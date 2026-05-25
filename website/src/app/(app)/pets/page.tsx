'use client';

import { AddPetModal } from '@/components/pets/AddPetModal';
import { PetCard } from '@/components/pets/PetCard';
import { Button } from '@/components/ui/Button';
import { usePets } from '@/hooks/usePets';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

export default function PetsPage() {
  const { data: pets, isLoading } = usePets();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Pets</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your pets and trigger feeds.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <IconPlus size={16} />
          Add pet
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-surface border border-border" />
          ))}
        </div>
      ) : (pets?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface py-16 text-center">
          <p className="text-text-secondary">No pets yet.</p>
          <Button onClick={() => setShowAdd(true)}>
            <IconPlus size={16} />
            Add your first pet
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pets!.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </div>
      )}

      <AddPetModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
