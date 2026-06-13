import { config } from '../config';

// Notifies feed-service that this household's Smart Home device list changed
// (a pet — which is also a SYNC-level PETFEEDER device — was added or
// removed), so it can call Home Graph requestSync. Best-effort and silent —
// feed-service no-ops if Home Graph isn't configured, and Google Home voice
// commands work fine without this; it only speeds up SYNC propagation.
export async function requestHomeGraphSync(householdId: string): Promise<void> {
  if (!config.FEED_SERVICE_URL) return;

  try {
    const response = await fetch(`${config.FEED_SERVICE_URL}/internal/request-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId }),
    });
    if (!response.ok) {
      console.error(`[pets] request-sync failed for household ${householdId}: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[pets] request-sync error for household ${householdId}:`, err);
  }
}
