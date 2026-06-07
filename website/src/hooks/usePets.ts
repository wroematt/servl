import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Pet {
  id: string;
  household_id: string;
  name: string;
  type: 'cat' | 'dog' | 'other';
  meal_weight_g: number;
  snack_weight_g: number;
  daily_target_g: number;
  device_id: string | null;
  device_name?: string | null;
  photo_url: string | null;
  today_intake_g?: number;
  /**
   * True while a feed_event for this pet is still 'pending' (dispensed but not
   * yet confirmed/failed/timed-out by the device). The backend allows at most
   * one pending feed per pet at a time — use this to disable Meal/Snack
   * buttons rather than letting a second dispense request 409.
   */
  has_pending_feed?: boolean;
  deleted_at: string | null;
  created_at: string;
}

// While any pet has a feed in flight, poll faster so the Meal/Snack buttons
// re-enable promptly once the device confirms (or the 30s worker timeout
// flips it to 'timeout') — otherwise fall back to the default staleTime and
// avoid hammering the API for no reason.
const PENDING_FEED_POLL_MS = 4_000;

export function usePets() {
  return useQuery<Pet[]>({
    queryKey: ['pets'],
    queryFn: () => api.get('/pets'),
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.has_pending_feed) ? PENDING_FEED_POLL_MS : false,
  });
}

export function usePet(petId: string) {
  return useQuery<Pet>({
    queryKey: ['pets', petId],
    queryFn: () => api.get(`/pets/${petId}`),
    enabled: !!petId,
    refetchInterval: (query) => (query.state.data?.has_pending_feed ? PENDING_FEED_POLL_MS : false),
  });
}

export function useCreatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post<Pet>('/pets', formData, { multipart: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  });
}

export function useUpdatePet(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FormData | Partial<Pet>) => {
      if (data instanceof FormData) {
        return api.patchForm<Pet>(`/pets/${petId}`, data);
      }
      return api.patch<Pet>(`/pets/${petId}`, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pets'] });
      qc.invalidateQueries({ queryKey: ['pets', petId] });
    },
  });
}

export function useDeletePet(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/pets/${petId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pets'] }),
  });
}

export interface FeedEvent {
  id: string;
  pet_id: string;
  device_id: string;
  triggered_by: string;
  schedule_id: string | null;
  weight_requested_g: number;
  weight_dispensed_g: number | null;
  trigger_type: 'manual' | 'schedule' | 'voice' | 'api';
  status: 'pending' | 'confirmed' | 'failed' | 'timeout';
  // The DB column (and the API response) is `dispensed_at` — the timestamp of
  // the actual dispense, not a generic row-creation timestamp.
  dispensed_at: string;
}

export function useFeedHistory(
  petId: string,
  params?: { page?: number; page_size?: number; from?: string; to?: string; trigger_type?: string },
) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.trigger_type) qs.set('trigger_type', params.trigger_type);
  const query = qs.toString() ? `?${qs}` : '';
  return useQuery<{ data: FeedEvent[]; total: number; page: number; page_size: number }>({
    queryKey: ['feed-history', petId, params],
    queryFn: () => api.get(`/pets/${petId}/feeds${query}`),
    enabled: !!petId,
  });
}

export interface PetStats {
  date: string;
  total_g: number;
  feed_count: number;
}

export function usePetStats(petId: string, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const query = qs.toString() ? `?${qs}` : '';
  return useQuery<PetStats[]>({
    queryKey: ['pet-stats', petId, from, to],
    queryFn: () => api.get(`/pets/${petId}/stats${query}`),
    enabled: !!petId,
  });
}
