import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Schedule {
  id: string;
  pet_id: string;
  pet_name?: string;
  label: string;
  feed_type: 'meal' | 'snack' | 'custom';
  weight_g: number;
  cron_expression: string;
  enabled: boolean;
  created_at: string;
}

export function useSchedules(petId?: string) {
  const qs = petId ? `?petId=${petId}` : '';
  return useQuery<Schedule[]>({
    queryKey: ['schedules', petId],
    queryFn: () => api.get(`/schedules${qs}`),
  });
}

export interface CreateScheduleInput {
  pet_id: string;
  label: string;
  feed_type: 'meal' | 'snack' | 'custom';
  weight_g: number;
  cron_expression: string;
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScheduleInput) => api.post<Schedule>('/schedules', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useUpdateSchedule(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Schedule>) => api.patch<Schedule>(`/schedules/${scheduleId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => api.delete(`/schedules/${scheduleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
}
