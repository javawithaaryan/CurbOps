// ---------------------------------------------------------------------------
// CausaFlow AI — lib/dashboard/types.ts
// Shared TypeScript types for the BTP Command Centre dashboard.
// ---------------------------------------------------------------------------

// `action_tier` is the server-side recommended enforcement action, derived
// from a blended priority_score. Replaces the old client-side tier calculation.
export type ActionTier = 'TOW' | 'PATROL' | 'MONITOR';

export interface VehicleTypeCount {
  type: string;
  count: number;
}

export interface ViolationTypeCount {
  type: string; // may be a JSON-ish string like '["WRONG PARKING"]'
  count: number;
}

export interface Zone {
  zone_id: number;
  zone_CBM_sum: number;
  violation_count: number;
  peak_hour_ratio: number;
  recurrence_days: number;
  top_vehicle_types: VehicleTypeCount[];
  top_violation_types: ViolationTypeCount[];
  centroid_lat: number;
  centroid_lon: number;
  dominant_junction: string;
  police_station: string;
  recommended_window: string;
  radius_m: number;
  priority_score: number;
  low_confidence: boolean;
  action_tier: ActionTier;
}

export interface TierBreakpoints {
  criticalCut: number;
  highCut: number;
}

export interface CityStats {
  total_zones: number;
  total_cbm: number;
  total_violations: number;
  police_stations: string[];
  low_confidence_count: number;
  action_tier_counts: Record<ActionTier, number>;
}

