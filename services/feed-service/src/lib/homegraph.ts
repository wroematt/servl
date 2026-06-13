// Google Home Graph "Report State" client.
//
// When a device's state changes outside of an EXECUTE response (e.g. an MQTT
// status update changes hopper_pct, or the feeder goes offline), Google needs
// to be told proactively via the Home Graph API so voice queries and the
// Google Home app stay in sync without Google having to poll QUERY.
//
// Auth: a Google service account signs a JWT (RS256) and exchanges it for an
// OAuth2 access token via the standard JWT-bearer grant, then calls
// devices:reportStateAndNotification with that token as a Bearer credential.
//
// Both HOMEGRAPH_CLIENT_EMAIL and HOMEGRAPH_PRIVATE_KEY are optional — if
// either is unset, reportState() is a silent no-op. Report State is an
// enhancement on top of SYNC/QUERY/EXECUTE, not required for them to work.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const TOKEN_URL       = 'https://oauth2.googleapis.com/token';
const REPORT_URL      = 'https://homegraph.googleapis.com/v1/devices:reportStateAndNotification';
const HOMEGRAPH_SCOPE = 'https://www.googleapis.com/auth/homegraph';

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!config.HOMEGRAPH_CLIENT_EMAIL || !config.HOMEGRAPH_PRIVATE_KEY) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss:   config.HOMEGRAPH_CLIENT_EMAIL,
      scope: HOMEGRAPH_SCOPE,
      aud:   TOKEN_URL,
      iat:   now,
      exp:   now + 3600,
    },
    config.HOMEGRAPH_PRIVATE_KEY,
    { algorithm: 'RS256' },
  );

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    console.error(`[homegraph] Token exchange failed: HTTP ${response.status}`);
    return null;
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

// Pushes a state update for one device to one linked Google user.
export async function reportState(
  agentUserId: string,
  deviceId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const response = await fetch(REPORT_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      agentUserId,
      payload: {
        devices: {
          states: { [deviceId]: state },
        },
      },
    }),
  });

  if (!response.ok) {
    console.error(`[homegraph] reportStateAndNotification failed: HTTP ${response.status}`);
  }
}
