// ---------------------------------------------------------------------------
// CurbOps — lib/tierColors.ts
// Centralised tier colour palette. Used by the map, the priority table, and
// the side panel so all three surfaces stay perfectly in sync.
// ---------------------------------------------------------------------------

import type { ActionTier } from './dashboard/types';

export interface TierColorSpec {
  fill: string;
  stroke: string;
}

export const TIER_COLORS: Record<ActionTier, TierColorSpec> = {
  // 🔴 TOW — High Priority (immediate physical intervention)
  TOW: {
    fill: '#E5484D',    // Crimson
    stroke: '#B23A3E',  // Darker Crimson
  },
  // 🟠 PATROL — Medium Priority (drive-by / ticketing)
  PATROL: {
    fill: '#E8A33D',    // Amber
    stroke: '#C2842A',  // Darker Amber
  },
  // 🔵 MONITOR — Low Priority (congested but below enforcement threshold)
  MONITOR: {
    fill: '#5B6B7C',    // Slate / Teal
    stroke: '#44515F',  // Darker Slate
  },
};

// Default fill opacities
export const TIER_FILL_OPACITY = {
  normal: 0.35,
  selected: 0.55,
  // When "Simulate enforcement impact" is ON, MONITOR zones fade into the
  // background so the deployable TOW/PATROL zones stand out. 0.15 keeps them
  // subtly visible against the dark CartoDB basemap (the spec's 0.1 was too
  // faint — MONITOR zones vanished completely on the dark background).
  simulateMonitor: 0.15,
  simulateDeployable: 0.5,
  // Halo opacity (the projected area-of-influence ring under TOW/PATROL)
  halo: 0.12,
};

// Stroke weight / opacity
export const TIER_STROKE = {
  weight: 1,
  weightSelected: 2,
  opacity: 0.9,
  opacitySelected: 1,
};

// Halo multiplier — projected area of influence = radius × 2
export const HALO_RADIUS_MULTIPLIER = 2;

// Backwards-compatible flat colour map for components that just want a
// single colour string per tier (e.g. legend dots, table pills).
export const TIER_COLOR_FLAT: Record<ActionTier, string> = {
  TOW: TIER_COLORS.TOW.fill,
  PATROL: TIER_COLORS.PATROL.fill,
  MONITOR: TIER_COLORS.MONITOR.fill,
};
