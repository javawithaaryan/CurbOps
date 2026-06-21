// ---------------------------------------------------------------------------
// CurbOps — /api/stats
// Pre-computed city-wide aggregates + action-tier counts + station list.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { CityStats, Zone, ActionTier } from '@/lib/dashboard/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const file = path.join(process.cwd(), 'data', 'zone_summary.json');
  const raw = await fs.readFile(file, 'utf-8');
  const zones: Zone[] = JSON.parse(raw);

  const total_cbm =
    Math.round(zones.reduce((s, z) => s + (z.zone_CBM_sum || 0), 0) * 100) / 100;
  const total_violations = zones.reduce((s, z) => s + (z.violation_count || 0), 0);
  const police_stations = Array.from(
    new Set(zones.map((z) => z.police_station))
  ).sort();
  const low_confidence_count = zones.filter((z) => z.low_confidence).length;

  // Count zones per action_tier
  const action_tier_counts: Record<ActionTier, number> = {
    TOW: 0,
    PATROL: 0,
    MONITOR: 0,
  };
  for (const z of zones) {
    const t = (z.action_tier || 'MONITOR') as ActionTier;
    if (t in action_tier_counts) action_tier_counts[t] += 1;
  }

  const stats: CityStats = {
    total_zones: zones.length,
    total_cbm,
    total_violations,
    police_stations,
    low_confidence_count,
    action_tier_counts,
  };
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
