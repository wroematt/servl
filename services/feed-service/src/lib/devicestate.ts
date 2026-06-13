// Shared Dispense-trait state shape for the Google Home Smart Home webhook.
//
// Used by the smarthome QUERY handler, EXECUTE success responses, and
// /internal/report-state (pushed via lib/homegraph.ts) — all three describe
// device state identically so Google's cache never disagrees with a QUERY.

export function buildDeviceState(
  online: boolean,
  hopperPct: number | null,
  lastDispensedG?: number,
): { online: boolean; dispenseItems: Array<Record<string, unknown>> } {
  const item: Record<string, unknown> = {
    itemName: 'biscuits',
  };

  if (hopperPct != null) {
    // The Dispense trait's amountRemaining unit enum has no native percentage
    // unit, so the 0-100 hopper_pct value is reported as NO_UNITS. Verify in
    // the Google Actions Test Suite that this renders sensibly.
    item.amountRemaining = { amount: hopperPct, unit: 'NO_UNITS' };
  }
  if (lastDispensedG != null) {
    item.amountLastDispensed = { amount: lastDispensedG, unit: 'GRAMS' };
  }

  return { online, dispenseItems: [item] };
}
