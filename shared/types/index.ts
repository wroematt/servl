// ─────────────────────────────────────────────
//  PetFeeder — shared types
//  Import from @petfeeder/shared in all services
// ─────────────────────────────────────────────

// ── Domain types ─────────────────────────────

export type Role = 'owner' | 'member';
export type PetType = 'cat' | 'dog';
export type FeedType = 'meal' | 'snack' | 'custom';
export type TriggerType = 'manual' | 'schedule' | 'voice' | 'api';
export type FeedStatus = 'pending' | 'confirmed' | 'failed' | 'timeout';
export type DeviceStatus = 'online' | 'offline' | 'error';
export type DeviceEventType =
  | 'error'
  | 'hopper_low'
  | 'hopper_refilled'
  | 'firmware_update'
  | 'reconnect';

// ── Database row shapes ───────────────────────

export interface Household {
  id: string;
  name: string;
  created_at: Date;
}

export interface User {
  id: string;
  household_id: string | null;  // null until user creates or joins a household
  email: string;
  password_hash: string;
  name: string;
  photo_url: string | null;
  role: Role;
  fcm_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface Device {
  id: string;
  household_id: string;
  name: string;
  serial_number: string;
  mqtt_client_id: string;
  cert_fingerprint: string;
  hopper_pct: number;
  firmware_version: string | null;
  status: DeviceStatus;
  last_seen_at: Date | null;
  created_at: Date;
}

export interface Pet {
  id: string;
  household_id: string;
  device_id: string | null;
  name: string;
  type: PetType;
  photo_url: string | null;
  meal_weight_g: number;
  snack_weight_g: number;
  daily_target_g: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Schedule {
  id: string;
  pet_id: string;
  label: string | null;
  feed_type: FeedType;
  weight_g: number;
  cron_expression: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FeedEvent {
  id: string;
  pet_id: string | null;
  device_id: string | null;
  triggered_by: string | null;
  schedule_id: string | null;
  weight_requested_g: number;
  weight_dispensed_g: number | null;
  trigger_type: TriggerType;
  status: FeedStatus;
  dispensed_at: Date;
}

export interface DeviceEvent {
  id: string;
  device_id: string;
  event_type: DeviceEventType;
  payload: Record<string, unknown> | null;
  created_at: Date;
}

// ── MQTT message payloads ─────────────────────

export interface MqttCommandPayload {
  command_id: string;       // feed_event.id — used to confirm back, or 'factory_reset'
  action: 'dispense' | 'factory_reset';
  weight_g: number;
}

export interface MqttStatusPayload {
  command_id?: string;      // present when confirming a dispense
  hopper_pct: number;
  dispensed_g?: number;     // actual weight dispensed
  status: 'ok' | 'error' | 'low_hopper' | 'offline';   // 'offline' = broker LWT
  firmware_version?: string;
  error_message?: string;
}

// ── JWT payload ───────────────────────────────

export interface JwtPayload {
  sub: string;              // user.id
  household_id: string | null;
  role: Role;
  iat: number;
  exp: number;
}

// ── API response shapes ───────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
