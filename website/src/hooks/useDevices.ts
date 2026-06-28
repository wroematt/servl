import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Device {
  id: string;
  household_id: string;
  name: string;
  mqtt_client_id: string;
  status: 'online' | 'offline' | 'error';
  hopper_pct: number | null;
  firmware_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface DeviceEvent {
  id: string;
  device_id: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices'),
    refetchInterval: 30_000, // poll every 30s for live status
  });
}

export function useDevice(deviceId: string) {
  return useQuery<Device & { events: DeviceEvent[] }>({
    queryKey: ['devices', deviceId],
    queryFn: () => api.get(`/devices/${deviceId}`),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });
}

export function useUpdateDevice(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string }) => api.patch<Device>(`/devices/${deviceId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useDeleteDevice(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/devices/${deviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useDeviceEvents(deviceId: string) {
  return useQuery<{ data: DeviceEvent[]; total: number }>({
    queryKey: ['device-events', deviceId],
    queryFn: () => api.get(`/devices/${deviceId}/events`),
    enabled: !!deviceId,
  });
}

export function useEmptyHopper(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post(`/devices/${deviceId}/empty`, {}),
  });
}

export function useCalibrateEmpty(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post(`/devices/${deviceId}/calibrate-empty`, {}),
  });
}

export function useCalibrateFull(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post(`/devices/${deviceId}/calibrate-full`, {}),
  });
}
