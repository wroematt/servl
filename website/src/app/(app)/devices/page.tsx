'use client';

import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { HopperIndicator } from '@/components/ui/HopperIndicator';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Device, DeviceEvent, useCalibrateFull, useCalibrateEmpty, useDeleteDevice, useDeviceEvents, useDevices, useEmptyHopper, useUpdateDevice } from '@/hooks/useDevices';
import { useAuth } from '@/providers/AuthProvider';
import { formatRelative } from '@/lib/utils';
import { IconBluetoothConnected, IconCpu } from '@tabler/icons-react';
import { useState } from 'react';

export default function DevicesPage() {
  const { data: devices, isLoading } = useDevices();
  const [selected, setSelected] = useState<Device | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Devices</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Feeder devices connected to your household.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-surface border border-border" />
          ))}
        </div>
      ) : (devices?.length ?? 0) === 0 ? (
        <Card className="py-16 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg">
              <IconCpu size={28} className="text-text-tertiary" />
            </div>
            <div>
              <p className="font-medium text-text">No devices yet</p>
              <p className="mt-1 text-sm text-text-tertiary">
                Use the Servl mobile app to provision your first feeder.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-primary-light px-4 py-2 text-sm text-primary">
              <IconBluetoothConnected size={16} />
              Provisioning requires the mobile app
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {devices!.map((d) => (
            <DeviceCard key={d.id} device={d} onSelect={setSelected} />
          ))}
        </div>
      )}

      {/* Add device notice */}
      {(devices?.length ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
          <IconBluetoothConnected size={16} className="text-primary shrink-0" />
          To add a new device, use the Servl mobile app for Bluetooth provisioning.
        </div>
      )}

      {selected && (
        <DeviceDetailModal device={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DeviceCard({ device, onSelect }: { device: Device; onSelect: (d: Device) => void }) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => onSelect(device)}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconCpu size={16} className="text-text-secondary" />
          <CardTitle>{device.name}</CardTitle>
        </div>
        <StatusBadge status={device.status} />
      </CardHeader>
      <div className="flex items-center gap-4">
        <HopperIndicator pct={device.hopper_pct} />
        <div className="space-y-1 text-xs text-text-secondary">
          {device.firmware_version && (
            <p className="font-mono">fw {device.firmware_version}</p>
          )}
          {device.last_seen_at && (
            <p>Last seen {formatRelative(device.last_seen_at)}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function DeviceDetailModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const isOnline = device.status === 'online';
  const updateDevice = useUpdateDevice(device.id);
  const deleteDevice = useDeleteDevice(device.id);
  const emptyHopper = useEmptyHopper(device.id);
  const calibrateEmpty = useCalibrateEmpty(device.id);
  const calibrateFull = useCalibrateFull(device.id);
  const { data: eventsData } = useDeviceEvents(device.id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);

  const handleRename = async () => {
    await updateDevice.mutateAsync({ name });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Remove device "${device.name}"?`)) return;
    await deleteDevice.mutateAsync();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={device.name} className="max-w-lg">
      <div className="space-y-4">
        {/* Status row */}
        <div className="flex items-center gap-4 rounded-lg bg-bg p-3">
          <HopperIndicator pct={device.hopper_pct} />
          <div className="space-y-1">
            <StatusBadge status={device.status} />
            {device.firmware_version && (
              <p className="font-mono text-xs text-text-secondary">
                fw {device.firmware_version}
              </p>
            )}
            {device.last_seen_at && (
              <p className="text-xs text-text-tertiary">
                Last seen {formatRelative(device.last_seen_at)}
              </p>
            )}
          </div>
        </div>

        {/* Rename */}
        {isOwner && (
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editing}
              className="flex-1"
            />
            {editing ? (
              <>
                <Button size="sm" onClick={handleRename} loading={updateDevice.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setName(device.name); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Rename
              </Button>
            )}
          </div>
        )}

        {/* Recent events */}
        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary">Recent events</p>
          {(eventsData?.data.length ?? 0) === 0 ? (
            <p className="text-xs text-text-tertiary">No events recorded.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {eventsData!.data.map((ev: DeviceEvent) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-2 rounded-lg bg-bg px-3 py-2 text-xs"
                >
                  <span className="font-mono text-text-tertiary shrink-0">
                    {new Date(ev.created_at).toLocaleTimeString('en-AU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-text-secondary">{ev.event_type}</span>
                  {ev.message && (
                    <span className="text-text-tertiary truncate">{ev.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Maintenance commands — owner only, device must be online */}
        {isOwner && isOnline && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Maintenance</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={calibrateEmpty.isPending}
                onClick={async () => {
                  if (!confirm('Make sure the hopper is completely EMPTY before calibrating. This sets the zero point for weight measurements.')) return;
                  await calibrateEmpty.mutateAsync();
                }}
              >
                Calibrate empty
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={calibrateFull.isPending}
                onClick={async () => {
                  if (!confirm('Fill the hopper to its maximum level before calibrating. This sets the 100% reference point for the hopper indicator.')) return;
                  await calibrateFull.mutateAsync();
                }}
              >
                Calibrate full
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={emptyHopper.isPending}
                onClick={async () => {
                  if (!confirm('This will open the chute and dispense all remaining kibble. Use this to empty the hopper for cleaning.')) return;
                  await emptyHopper.mutateAsync();
                }}
              >
                Empty hopper
              </Button>
            </div>
          </div>
        )}

        {/* Danger zone */}
        {isOwner && (
          <div className="border-t border-border pt-3">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteDevice.isPending}
            >
              Remove device
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
