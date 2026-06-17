'use client';

import { Badge } from '@/components/ui/Badge';
import { EditPetModal } from './EditPetModal';
import { FeedButton } from './FeedButton';
import { Pet } from '@/hooks/usePets';
import { resolvePhotoUrl } from '@/lib/utils';
import { IconEdit, IconPaw } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

interface PetCardProps {
  pet: Pet;
}

const typeLabel: Record<string, string> = {
  cat: 'Cat', dog: 'Dog', rabbit: 'Rabbit', guinea_pig: 'Guinea Pig',
  hamster: 'Hamster', bird: 'Bird', tortoise: 'Tortoise',
  horse: 'Horse', ferret: 'Ferret', other: 'Other',
};

export function PetCard({ pet }: PetCardProps) {
  const [showEdit, setShowEdit] = useState(false);

  const intakePct = pet.daily_target_g > 0
    ? Math.min(100, Math.round(((pet.today_intake_g ?? 0) / pet.daily_target_g) * 100))
    : 0;

  return (
    <>
      {showEdit && (
        <EditPetModal pet={pet} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-bg">
            {pet.photo_url ? (
              <Image
                src={resolvePhotoUrl(pet.photo_url)!}
                alt={pet.name}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <IconPaw size={20} className="text-text-tertiary" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/pets/${pet.id}`}
              className="block truncate text-sm font-medium text-text hover:text-primary"
            >
              {pet.name}
            </Link>
            <Badge variant="muted" className="mt-0.5">{typeLabel[pet.type] ?? pet.type}</Badge>
          </div>
          {/* Edit icon — top right */}
          <button
            onClick={() => setShowEdit(true)}
            title="Edit pet"
            className="shrink-0 rounded-md p-1 text-text-tertiary hover:bg-bg hover:text-primary transition-colors"
          >
            <IconEdit size={14} />
          </button>
        </div>

        {/* Intake progress */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-text-tertiary">
            <span>Today&apos;s intake</span>
            <span className="font-mono">{pet.today_intake_g ?? 0}g / {pet.daily_target_g}g</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${intakePct}%` }}
            />
          </div>
        </div>

        {/* Feed buttons */}
        {pet.device_id ? (
          <div className="flex gap-2">
            <FeedButton petId={pet.id} type="meal" pending={pet.has_pending_feed} />
            <FeedButton petId={pet.id} type="snack" pending={pet.has_pending_feed} />
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">No device assigned</p>
        )}
      </div>
    </>
  );
}
