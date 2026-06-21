// ---------------------------------------------------------------------------
// CurbOps — lib/dashboard/tiers.ts
// Tier colours + helper utilities for the BTP Command Centre dashboard.
// ---------------------------------------------------------------------------

import type { ActionTier, Zone } from './types';

// ---------------------------------------------------------------------------
// Action-tier colours (TOW / PATROL / MONITOR)
// ---------------------------------------------------------------------------
export const ACTION_TIER_COLORS: Record<ActionTier, string> = {
  TOW: '#dc2626',      // red — highest priority, immediate tow dispatch
  PATROL: '#f97316',   // orange — sustained patrol presence needed
  MONITOR: '#eab308',  // yellow — watch & monitor
};

export const ACTION_TIER_LABELS: Record<ActionTier, string> = {
  TOW: 'TOW · Immediate Dispatch',
  PATROL: 'PATROL · Sustained Presence',
  MONITOR: 'MONITOR · Watch & Review',
};

export const ACTION_TIER_SHORT: Record<ActionTier, string> = {
  TOW: 'TOW',
  PATROL: 'PATROL',
  MONITOR: 'MON',
};

// Deployable = zones that get active enforcement (TOW + PATROL).
// MONITOR zones are excluded from the "Simulate Optimized Enforcement" view.
export const DEPLOYABLE_TIERS: ActionTier[] = ['TOW', 'PATROL'];

export function getZoneConfidence(zone: Pick<Zone, 'peak_hour_ratio' | 'recurrence_days'>): number {
  return Math.min(99, Math.round(
    55 + (zone.peak_hour_ratio * 25) + Math.min(zone.recurrence_days, 8) * 2.5
  ));
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return '#16a34a';
  if (confidence >= 75) return '#d97706';
  return '#dc2626';
}

// ---------------------------------------------------------------------------
// Clean a violation type string.
// Raw data comes in as JSON-ish strings like:
//   '["WRONG PARKING"]'                              → 'WRONG PARKING'
//   '["NO PARKING","DEFECTIVE NUMBER PLATE"]'        → 'NO PARKING'
// We strip brackets/quotes and return only the first readable type, so the
// drill-down panel and priority table show clean labels.
// ---------------------------------------------------------------------------
export function cleanViolationLabel(s: string | undefined | null): string {
  if (!s) return 'Unknown';
  let parsed: unknown = s;
  try {
    parsed = JSON.parse(s);
  } catch {
    // not JSON — fall through to regex cleanup
  }
  if (Array.isArray(parsed)) {
    const first = parsed.find((x) => typeof x === 'string' && x.trim());
    if (first) return String(first).trim().toUpperCase();
  } else if (typeof parsed === 'string') {
    return parsed.trim().toUpperCase();
  }
  // Fallback: strip brackets and quotes manually
  return String(s)
    .replace(/[\[\]"']/g, '')
    .split(/[,|]/)[0]
    .trim()
    .toUpperCase() || 'Unknown';
}

// ---------------------------------------------------------------------------
// Get a human-readable junction name. If the data has "No Junction", fall
// back to "Zone #<id> · Unnamed Cluster" so the panel/table never shows the
// literal placeholder string, and zone references read naturally.
// ---------------------------------------------------------------------------
export function getJunctionDisplayName(zone: Pick<Zone, 'zone_id' | 'dominant_junction'>): string {
  const j = zone.dominant_junction;
  if (!j || j === 'No Junction' || j.toLowerCase() === 'no junction') {
    return `Zone #${zone.zone_id} · Unnamed Cluster`;
  }
  return j;
}

// ---------------------------------------------------------------------------
// CircleMarker radius scaling: map raw radius_m (50–800) into a Leaflet
// CircleMarker radius in PIXELS. CircleMarker radii are screen pixels, so
// they stay constant regardless of zoom — circles will NOT shrink as the
// user zooms in. Range: 12–28 px (larger minimum keeps small zones visible
// at every zoom level). Simulate mode shrinks to 60 % to visually convey
// capacity recovery.
// ---------------------------------------------------------------------------
export function scaleCircleRadius(
  radiusM: number,
  { simulate = false }: { simulate?: boolean } = {}
): number {
  const min = 50;
  const max = 800;
  const r = Math.max(min, Math.min(max, radiusM || min));
  const norm = (r - min) / (max - min);
  let px = 12 + norm * 16; // 12–28 px
  if (simulate) px *= 0.6;
  return Math.max(6, px);
}

// ---------------------------------------------------------------------------
// Parse "HH:MM-HH:MM" recommended-window string into a structured object.
// ---------------------------------------------------------------------------
export function parseWindow(win: string | undefined): {
  start: number;
  end: number;
  raw: string;
} | null {
  if (!win || typeof win !== 'string') return null;
  const [start, end] = win.split('-');
  const parse = (s: string | undefined): number => {
    const [h] = (s || '').split(':').map(Number);
    return h ?? 0;
  };
  return { start: parse(start), end: parse(end), raw: win };
}

// Backward-compat aliases for components that haven't been refactored yet.
// Prefer ACTION_TIER_* going forward.
export const TIER_COLORS = ACTION_TIER_COLORS as unknown as Record<string, string>;
export const TIER_LABELS = ACTION_TIER_LABELS as unknown as Record<string, string>;
export const TIER_SHORT = ACTION_TIER_SHORT as unknown as Record<string, string>;

// ---------------------------------------------------------------------------
// Build an explainability sentence from a zone's numbers.
// ---------------------------------------------------------------------------
export function explainZone(zone: Zone): string {
  if (!zone) return '';
  const cbm = (zone.zone_CBM_sum ?? 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
  const peak = ((zone.peak_hour_ratio ?? 0) * 100).toFixed(1);
  const rec = zone.recurrence_days ?? 0;
  const topV = zone.top_violation_types?.[0]?.type
    ? cleanViolationLabel(zone.top_violation_types[0].type)
    : 'violations';
  const topVehicle =
    zone.top_vehicle_types?.[0]?.type?.toLowerCase() ?? 'vehicles';
  const junction = getJunctionDisplayName(zone);

  return `Zone ${zone.zone_id} accumulates ${cbm} congestion-minutes across ${zone.violation_count ?? 0} violations, peaking at ${peak}% of hourly volume and recurring on ${rec} days. The dominant pattern — ${topV.toLowerCase()} involving ${topVehicle}s — concentrates around ${junction} within the ${zone.recommended_window || 'peak'} window. Recommended action: ${zone.action_tier} deployment via ${zone.police_station} PS.`;
}

// Backwards-compat: cleanTypeName kept for any code that still imports it.
export function cleanTypeName(s: string | undefined | null): string {
  return cleanViolationLabel(s);
}
