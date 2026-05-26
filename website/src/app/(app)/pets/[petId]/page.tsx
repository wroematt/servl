'use client';

import { IntakeChart } from '@/components/charts/IntakeChart';
import { EditPetModal } from '@/components/pets/EditPetModal';
import { FeedButton } from '@/components/pets/FeedButton';
import { Badge, StatusBadge, TriggerBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDeletePet, useFeedHistory, usePet, usePetStats } from '@/hooks/usePets';
import { formatDateTime, formatWeight, resolvePhotoUrl } from '@/lib/utils';
import { IconArrowLeft, IconCpu, IconEdit, IconPaw, IconTrash } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export default function PetDetailPage({ params }: { params: { petId: string } }) {
  const { petId } = params;
  const router = useRouter();
  const { data: pet, isLoading } = usePet(petId);
  const deletePet = useDeletePet(petId);

  const [showEdit, setShowEdit] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { data: feedData, isLoading: feedLoading } = useFeedHistory(petId, {
    page,
    page_size: PAGE_SIZE,
  });

  // Stable dates — computed once per mount, not on every render.
  // Without useMemo, Date.now() produces a new millisecond value every render
  // which changes the React Query key and fires an infinite stream of requests.
  const { statsFrom, statsTo } = useMemo(() => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    return { statsFrom: from.toISOString(), statsTo: to.toISOString() };
  }, []);

  const { data: stats } = usePetStats(petId, statsFrom, statsTo);

  const handleDelete = async () => {
    if (!confirm(`Delete ${pet?.name}? Feed history will be preserved.`)) return;
    await deletePet.mutateAsync();
    router.push('/pets');
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl bg-surface border border-border" />
        <div className="h-48 animate-pulse rounded-xl bg-surface border border-border" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="py-16 text-center">
        <p className="text-text-secondary">Pet not found.</p>
        <Link href="/pets" className="mt-4 inline-block text-primary hover:underline">
          Back to pets
        </Link>
      </div>
    );
  }

  const typeLabel: Record<string, string> = { cat: 'Cat', dog: 'Dog', other: 'Other' };
  const totalFeeds = feedData?.total ?? 0;
  const totalPages = Math.ceil(totalFeeds / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/pets"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <IconArrowLeft size={14} />
        All pets
      </Link>

      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-bg">
            {pet.photo_url ? (
              <Image src={resolvePhotoUrl(pet.photo_url)!} alt={pet.name} fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <IconPaw size={28} className="text-text-tertiary" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-semibold text-text">{pet.name}</h1>
                <Badge variant="muted" className="mt-1">
                  {typeLabel[pet.type] ?? pet.type}
                </Badge>
              </div>
              <div className="flex gap-2">
                {pet.device_id && (
                  <>
                    <FeedButton petId={pet.id} type="meal" />
                    <FeedButton petId={pet.id} type="snack" />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEdit(true)}
                  title="Edit pet"
                >
                  <IconEdit size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  loading={deletePet.isPending}
                  className="text-danger hover:text-danger"
                  title="Delete pet"
                >
                  <IconTrash size={14} />
                </Button>
              </div>
            </div>
            {pet.device_name ? (
              <div className="mt-2 flex items-center gap-1 text-xs text-text-secondary">
                <IconCpu size={12} />
                {pet.device_name}
              </div>
            ) : (
              <p className="mt-2 text-xs text-text-tertiary">No device assigned</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Today's intake", value: `${pet.today_intake_g ?? 0}g` },
            { label: 'Meal weight', value: `${pet.meal_weight_g}g` },
            { label: 'Snack weight', value: `${pet.snack_weight_g}g` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-bg p-3">
              <p className="font-mono text-lg font-medium text-text">{value}</p>
              <p className="mt-0.5 text-xs text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {showEdit && (
        <EditPetModal pet={pet} open={showEdit} onClose={() => setShowEdit(false)} />
      )}

      {/* Chart */}
      {stats && stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>30-day intake</CardTitle>
          </CardHeader>
          <IntakeChart data={stats} />
        </Card>
      )}

      {/* Feed history */}
      <Card>
        <CardHeader>
          <CardTitle>Feed history</CardTitle>
          <span className="text-xs text-text-tertiary">{totalFeeds} total</span>
        </CardHeader>
        {feedLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-bg" />
            ))}
          </div>
        ) : (feedData?.data.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-text-tertiary">No feed events yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-tertiary">
                    <th className="pb-2 text-left font-medium">Time</th>
                    <th className="pb-2 text-left font-medium">Trigger</th>
                    <th className="pb-2 text-right font-medium">Requested</th>
                    <th className="pb-2 text-right font-medium">Dispensed</th>
                    <th className="pb-2 text-left font-medium pl-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {feedData!.data.map((ev) => (
                    <tr key={ev.id} className="border-b border-border last:border-0">
                      <td className="py-2 font-mono text-text-secondary">
                        {formatDateTime(ev.created_at)}
                      </td>
                      <td className="py-2">
                        <TriggerBadge type={ev.trigger_type} />
                      </td>
                      <td className="py-2 text-right font-mono text-text-secondary">
                        {formatWeight(ev.weight_requested_g)}
                      </td>
                      <td className="py-2 text-right font-mono text-text-secondary">
                        {ev.weight_dispensed_g !== null
                          ? formatWeight(ev.weight_dispensed_g)
                          : '—'}
                      </td>
                      <td className="py-2 pl-4">
                        <StatusBadge status={ev.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-text-secondary">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
