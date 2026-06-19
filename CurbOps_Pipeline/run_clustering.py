#!/usr/bin/env python3
"""
run_clustering.py — CurbOps: Parking enforcement intelligence · Spatial Clustering Pipeline
===============================================================
Gridlock 2.0 Hackathon  ·  Clustering (R2)

Reads the enriched CBM dataset (`violations_with_cbm.csv`), clusters
violations into operational enforcement zones using HDBSCAN with the
Haversine metric, computes per-zone aggregate metrics, and outputs two
dashboard-ready files:

    1. dataset/zones.geojson      – GeoJSON FeatureCollection (Point centroids)
    2. dataset/zone_summary.json  – JSON array sorted by priority_score desc


Usage:
    python run_clustering.py
"""

import json
import math
import os
import time

import numpy as np
import pandas as pd
import hdbscan

# ─────────────────────────────────────────────────────────────────────────────
# TUNABLE CONSTANTS
# All clustering parameters are declared here for easy experimentation.
# ─────────────────────────────────────────────────────────────────────────────

# Path to the enriched CBM dataset produced by the data pipeline
INPUT_CSV = "dataset/violations_with_cbm.csv"

# Output file paths consumed by the Streamlit dashboard
OUTPUT_GEOJSON = "dataset/zones.geojson"
OUTPUT_JSON = "dataset/zone_summary.json"

# HDBSCAN parameters
MIN_CLUSTER_SIZE = 10              # minimum points to form a dense region
CLUSTER_METRIC = "haversine"       # geodesic distance on a sphere
CLUSTER_SELECTION_EPSILON = 0.0    # no forced merging; let HDBSCAN find natural clusters
                                    # NOTE: 0.001 rad = ~6.4 km (too large, collapses city
                                    # into 1-2 mega-clusters). Set to 0 for proper zones.
ALLOW_SINGLE_CLUSTER = False       # force the algorithm to find multiple zones

# Noise reassignment: maximum distance (metres) to adopt a noise point
NOISE_REASSIGN_THRESHOLD_M = 200

# Earth radius in metres (WGS-84 mean)
EARTH_RADIUS_M = 6_371_000

# Low-confidence flag threshold (minimum violations per zone)
LOW_CONFIDENCE_THRESHOLD = 5

# Peak-hour definition (inclusive hour ranges)
# Morning: 7, 8, 9, 10  (i.e. 07:00–10:59)
# Evening: 17, 18, 19   (i.e. 17:00–19:59)
PEAK_HOURS = {7, 8, 9, 10, 17, 18, 19}


# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def haversine_distance(lat1: float, lon1: float,
                       lat2: float, lon2: float) -> float:
    """
    Compute the great-circle distance between two points on Earth.

    Parameters are in **decimal degrees**.
    Returns distance in **metres**.
    Uses Earth radius = 6,371,000 m.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)

    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_distance_vectorized(lat1, lon1, lat2, lon2):
    """
    Vectorized Haversine distance using NumPy.

    All inputs may be scalars or NumPy arrays (in **decimal degrees**).
    Returns distance(s) in **metres**.
    """
    phi1 = np.radians(lat1)
    phi2 = np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlam = np.radians(lon2 - lon1)

    a = (np.sin(dphi / 2) ** 2
         + np.cos(phi1) * np.cos(phi2) * np.sin(dlam / 2) ** 2)
    return 2 * EARTH_RADIUS_M * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE STAGES
# ─────────────────────────────────────────────────────────────────────────────

def load_data(filepath: str) -> pd.DataFrame:
    """
    Stage 1: Load the enriched CBM dataset and perform basic validation.

    Drops rows with missing latitude or longitude (safety net — the pipeline
    output should have zero nulls, but we guard against it).
    """
    print(f"[1/6] Loading dataset: {filepath}")
    df = pd.read_csv(filepath, low_memory=False)
    initial_count = len(df)

    df = df.dropna(subset=["latitude", "longitude"]).copy()
    dropped = initial_count - len(df)
    if dropped > 0:
        print(f"  [!] Dropped {dropped:,} rows with missing lat/lon")

    print(f"  [OK] Loaded {len(df):,} violations")
    return df


def run_hdbscan(df: pd.DataFrame) -> pd.DataFrame:
    """
    Stage 2: Perform HDBSCAN clustering on violation coordinates.

    Converts lat/lon to radians (required by the Haversine metric) and
    assigns integer `zone_id` labels.  Label -1 = noise.

    Raises ValueError if zero clusters are found.
    """
    print(f"[2/6] Running HDBSCAN clustering "
          f"(min_cluster_size={MIN_CLUSTER_SIZE}, "
          f"epsilon={CLUSTER_SELECTION_EPSILON}) ...")

    # HDBSCAN with Haversine expects coordinates in radians: [lat_rad, lon_rad]
    coords_rad = np.radians(df[["latitude", "longitude"]].values)

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=MIN_CLUSTER_SIZE,
        metric=CLUSTER_METRIC,
        cluster_selection_epsilon=CLUSTER_SELECTION_EPSILON,
        allow_single_cluster=ALLOW_SINGLE_CLUSTER,
    )
    labels = clusterer.fit_predict(coords_rad)
    df["zone_id"] = labels

    n_clusters = len(set(labels) - {-1})
    n_noise = int((labels == -1).sum())
    n_assigned = int((labels != -1).sum())

    # If every single point was classified as noise, there are no usable clusters
    if n_clusters == 0:
        raise ValueError(
            "No clusters found – adjust min_cluster_size or epsilon. "
            f"Current parameters: min_cluster_size={MIN_CLUSTER_SIZE}, "
            f"cluster_selection_epsilon={CLUSTER_SELECTION_EPSILON}. "
            "All {len(df):,} points were classified as noise."
        )

    print(f"  [OK] Found {n_clusters:,} clusters")
    print(f"    Assigned: {n_assigned:,} violations")
    print(f"    Noise:    {n_noise:,} violations")
    return df


def reassign_noise(df: pd.DataFrame) -> pd.DataFrame:
    """
    Stage 3: Reassign noise points to the nearest cluster if close enough.

    For each noise point (zone_id == -1), computes the Haversine distance
    to every cluster centroid.  If the minimum distance is
    ≤ NOISE_REASSIGN_THRESHOLD_M, the point is adopted into that cluster.

    Remaining noise points are dropped from the DataFrame so only
    zone-assigned violations are available for aggregation.
    """
    print(f"[3/6] Reassigning noise points (threshold={NOISE_REASSIGN_THRESHOLD_M} m) ...")

    noise_mask = df["zone_id"] == -1
    n_noise_before = int(noise_mask.sum())

    if n_noise_before == 0:
        print("  [OK] No noise points to reassign")
        return df

    # Compute cluster centroids (mean lat/lon in degrees)
    valid_clusters = df[~noise_mask]
    centroids = (
        valid_clusters
        .groupby("zone_id")[["latitude", "longitude"]]
        .mean()
    )
    centroid_ids = centroids.index.values              # (C,)
    centroid_lats = centroids["latitude"].values        # (C,)
    centroid_lons = centroids["longitude"].values       # (C,)

    # Noise point coordinates
    noise_idx = df.index[noise_mask]
    noise_lats = df.loc[noise_idx, "latitude"].values  # (N,)
    noise_lons = df.loc[noise_idx, "longitude"].values # (N,)

    # Vectorized distance matrix: shape (N, C)
    dists = haversine_distance_vectorized(
        noise_lats[:, None], noise_lons[:, None],
        centroid_lats[None, :], centroid_lons[None, :],
    )

    min_dists = dists.min(axis=1)                # (N,)
    nearest_cluster_pos = dists.argmin(axis=1)   # (N,) — indices into centroid_ids

    # Reassign where distance ≤ threshold
    within_threshold = min_dists <= NOISE_REASSIGN_THRESHOLD_M
    reassigned_zone_ids = centroid_ids[nearest_cluster_pos[within_threshold]]
    df.loc[noise_idx[within_threshold], "zone_id"] = reassigned_zone_ids

    n_reassigned = int(within_threshold.sum())
    n_remaining_noise = n_noise_before - n_reassigned

    print(f"  [OK] Reassigned {n_reassigned:,} noise points to nearby clusters")
    print(f"    Remaining noise (discarded): {n_remaining_noise:,}")

    # Drop remaining noise rows — they are not part of any enforcement zone
    df = df[df["zone_id"] >= 0].copy()
    return df


def compute_zone_metrics(df: pd.DataFrame) -> list[dict]:
    """
    Stage 4: Compute per-zone aggregate metrics for every valid cluster.

    Returns a list of zone dictionaries sorted by priority_score descending.
    Each zone also carries an action_tier (TOW / PATROL / MONITOR) derived
    from priority_score percentiles. Every field in the returned dicts appears
    in BOTH output files.

    """
    print("[4/6] Computing per-zone metrics ...")

    # Pre-parse created_datetime for time-based metrics
    dt_parsed = pd.to_datetime(df["created_datetime"], errors="coerce")
    df["_hour"] = dt_parsed.dt.hour
    df["_date"] = dt_parsed.dt.date
    df["_has_dt"] = dt_parsed.notna()

    zones: list[dict] = []

    for zone_id, grp in df.groupby("zone_id"):

        # ── Basic aggregates ─────────────────────────────────────────────
        zone_cbm_sum = float(grp["cbm"].sum())
        violation_count = len(grp)

        # ── Time-based metrics (skip rows where datetime is null) ────────
        grp_dt = grp[grp["_has_dt"]]

        if len(grp_dt) > 0:
            peak_count = int(grp_dt["_hour"].isin(PEAK_HOURS).sum())
            peak_hour_ratio = round(peak_count / len(grp_dt), 4)
            recurrence_days = int(grp_dt["_date"].nunique())

            # Recommended window: prioritize max hour within PEAK_HOURS (to avoid night-batching artifacts)
            hour_counts = grp_dt["_hour"].value_counts().sort_index()
            peak_hour_counts = hour_counts[hour_counts.index.isin(PEAK_HOURS)]
            
            if len(peak_hour_counts) > 0:
                max_count = peak_hour_counts.max()
                best_hour = int(peak_hour_counts[peak_hour_counts == max_count].index[0])
            else:
                # Fallback to global max if no peak hour violations exist
                max_count = hour_counts.max()
                best_hour = int(hour_counts[hour_counts == max_count].index[0])
                
            next_hour = (best_hour + 1) % 24
            recommended_window = f"{best_hour:02d}:00-{next_hour:02d}:00"
        else:
            # No valid datetimes in this zone
            peak_hour_ratio = 0.0
            recurrence_days = 0
            recommended_window = "00:00-01:00"

        # ── Top vehicle types (top 3 by frequency) ──────────────────────
        vtype_counts = grp["vehicle_type"].value_counts().head(3)
        top_vehicle_types = [
            {"type": str(vtype), "count": int(cnt)}
            for vtype, cnt in vtype_counts.items()
        ]

        # ── Top violation types (top 3 by frequency) ────────────────────
        import ast
        violtype_counts = grp["violation_type"].value_counts().head(3)
        top_violation_types = []
        for vt, cnt in violtype_counts.items():
            vt_str = str(vt)
            try:
                parsed = ast.literal_eval(vt_str)
                if isinstance(parsed, list):
                    vt_str = ", ".join(str(x) for x in parsed)
            except Exception:
                pass
            top_violation_types.append({"type": vt_str, "count": int(cnt)})

        # ── Centroid (mean lat/lon in degrees) ──────────────────────────
        centroid_lat = float(grp["latitude"].mean())
        centroid_lon = float(grp["longitude"].mean())

        # ── Dominant junction ───────────────────────────────────────────
        # Rule: most frequent junction_name, BUT if the mode is
        # "No Junction", take the next most frequent.  If no other
        # junction exists, keep "No Junction".  If the column is
        # entirely NaN → "Unknown".
        junctions = grp["junction_name"].dropna()
        if len(junctions) == 0:
            dominant_junction = "Unknown"
        else:
            junction_counts = junctions.value_counts()
            if junction_counts.index[0] != "No Junction":
                # Most frequent is a real junction — use it
                dominant_junction = str(junction_counts.index[0])
            elif len(junction_counts) > 1:
                # Mode is "No Junction" but alternatives exist — use next
                dominant_junction = str(junction_counts.index[1])
            else:
                # Only "No Junction" exists, no alternative
                dominant_junction = "No Junction"

        # ── Police station (most frequent) ──────────────────────────────
        police_station = str(grp["police_station"].value_counts().index[0])

        # ── Radius: max Haversine distance from centroid to any point ───
        dists_from_centroid = haversine_distance_vectorized(
            centroid_lat, centroid_lon,
            grp["latitude"].values, grp["longitude"].values,
        )
        radius_m = float(dists_from_centroid.max())

        # ── Priority score ──────────────────────────────────────────────
        # IMPORTANT — ARTIFACT-AWARE DAMPENING:
        # The raw timestamps contain a known "night-batching" artifact (a large
        # spike of violations stamped 00:00–06:00, almost certainly from
        # overnight batch-processing of camera tickets). This makes
        # peak_hour_ratio only *approximate*. The original formula multiplied
        # directly by peak_hour_ratio, which could zero out a zone's entire
        # priority whenever the (unreliable) ratio was 0.
        #
        # To de-risk this dependency we blend the peak factor into the range
        # 0.5–1.0 instead of 0.0–1.0. A zone with no detected peak-hour activity
        # is therefore down-weighted (×0.5) but never zeroed out, and CBM +
        # recurrence still drive the ranking. The dampening is intentional.
        safe_peak_factor = 0.5 + 0.5 * peak_hour_ratio  # ranges 0.5–1.0, never 0
        priority_score = round(
            zone_cbm_sum * safe_peak_factor * math.log(1 + recurrence_days), 4
        )


        # ── Low-confidence flag ─────────────────────────────────────────
        low_confidence = violation_count < LOW_CONFIDENCE_THRESHOLD

        zones.append({
            "zone_id":              int(zone_id),
            "zone_CBM_sum":         round(zone_cbm_sum, 2),
            "violation_count":      violation_count,
            "peak_hour_ratio":      peak_hour_ratio,
            "recurrence_days":      recurrence_days,
            "top_vehicle_types":    top_vehicle_types,
            "top_violation_types":  top_violation_types,
            "centroid_lat":         round(centroid_lat, 6),
            "centroid_lon":         round(centroid_lon, 6),
            "dominant_junction":    dominant_junction,
            "police_station":       police_station,
            "recommended_window":   recommended_window,
            "radius_m":             round(radius_m, 2),
            "priority_score":       priority_score,
            "low_confidence":       low_confidence,
        })

    # ── Action tiers (TOW / PATROL / MONITOR) ────────────────────────────
    # Data-driven enforcement tiers based on priority_score percentiles across
    # ALL zones (not arbitrary thresholds):
    #   • TOW     → priority_score in the top 10%  (>= 90th percentile)
    #   • PATROL  → next 20%                        (>= 70th percentile)
    #   • MONITOR → bottom 70%
    if zones:
        priority_scores = [z["priority_score"] for z in zones]
        p90 = np.percentile(priority_scores, 90)
        p70 = np.percentile(priority_scores, 70)
        for z in zones:
            if z["priority_score"] >= p90:
                z["action_tier"] = "TOW"
            elif z["priority_score"] >= p70:
                z["action_tier"] = "PATROL"
            else:
                z["action_tier"] = "MONITOR"

    # Sort by priority_score descending — priority_score is our blended ranking
    # metric (CBM × dampened peak factor × log recurrence). zone_CBM_sum remains
    # available as a displayed metric, but ranking is consistent with the pitch.
    zones.sort(key=lambda z: z["priority_score"], reverse=True)

    print(f"  [OK] Computed metrics for {len(zones):,} zones")
    return zones



def write_geojson(zones: list[dict], filepath: str) -> None:
    """
    Stage 5: Write zones as a GeoJSON FeatureCollection.

    Each Feature has:
      - geometry: Point at [centroid_lon, centroid_lat]  (GeoJSON order)
      - properties: every metric from the zone dict
    """
    print(f"[5/6] Writing GeoJSON: {filepath}")

    features = []
    for z in zones:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [z["centroid_lon"], z["centroid_lat"]],
            },
            "properties": {k: v for k, v in z.items()},
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)

    print(f"  [OK] Wrote {len(features):,} features")


def write_zone_summary(zones: list[dict], filepath: str) -> None:
    """
    Stage 6: Write the zone summary as a JSON array.

    Sorted by priority_score descending.  Each element contains every
    metric from the zone dict including zone_id and action_tier.

    """
    print(f"[6/6] Writing zone summary: {filepath}")

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(zones, f, indent=2, ensure_ascii=False)

    print(f"  [OK] Wrote {len(zones):,} zone records")


def print_summary(zones: list[dict], n_clusters: int,
                  n_assigned: int, n_noise_remaining: int,
                  elapsed: float) -> None:
    """Print a human-readable summary of the clustering results to stdout."""
    print()
    print("=" * 74)
    print("  CurbOps: Parking enforcement intelligence — Clustering Pipeline Summary")
    print("=" * 74)
    print(f"  Number of clusters found:      {n_clusters:>8,}")
    print(f"  Violations assigned to zones:  {n_assigned:>8,}")
    print(f"  Noise points remaining:        {n_noise_remaining:>8,}")
    print()

    # ── Top 5 zones ──────────────────────────────────────────────────────
    print("  -- Top 5 Zones by priority_score ------------------------------------")
    print(f"  {'Zone':>6}  {'Dominant Junction':<35}  {'Station':<20}  "
          f"{'Tier':<8}  {'Priority':>12}")
    print(f"  {'-' * 6}  {'-' * 35}  {'-' * 20}  {'-' * 8}  {'-' * 12}")
    for z in zones[:5]:
        print(f"  {z['zone_id']:>6}  "
              f"{z['dominant_junction']:<35.35}  "
              f"{z['police_station']:<20.20}  "
              f"{z.get('action_tier', ''):<8}  "
              f"{z['priority_score']:>12,.2f}")
    print()


    # ── Output file paths ────────────────────────────────────────────────
    print("  Output files:")
    print(f"    -> {os.path.abspath(OUTPUT_GEOJSON)}")
    print(f"    -> {os.path.abspath(OUTPUT_JSON)}")
    print()
    print(f"  Total runtime: {elapsed:.2f} seconds")
    print("=" * 74)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    """Orchestrate the full clustering pipeline."""
    t_start = time.time()

    print()
    print("=" * 74)
    print("  CurbOps: Parking enforcement intelligence — Spatial Clustering Pipeline")
    print("=" * 74)
    print()

    # ── Validate input ───────────────────────────────────────────────────
    if not os.path.exists(INPUT_CSV):
        raise FileNotFoundError(
            f"Input file not found: {INPUT_CSV}. "
            "Run the data pipeline (build_cbm_dataset.py) first."
        )

    # ── Stage 1: Load data ───────────────────────────────────────────────
    df = load_data(INPUT_CSV)
    total_loaded = len(df)

    # ── Stage 2: HDBSCAN clustering ──────────────────────────────────────
    df = run_hdbscan(df)

    # Capture cluster count before reassignment changes anything
    n_clusters = len(set(df["zone_id"].values) - {-1})

    # ── Stage 3: Noise reassignment + drop remaining noise ───────────────
    df = reassign_noise(df)

    # After reassign_noise(), only zone_id >= 0 rows remain
    n_assigned = len(df)
    n_noise_discarded = total_loaded - n_assigned

    # ── Stage 4: Compute per-zone metrics ────────────────────────────────
    zones = compute_zone_metrics(df)

    # ── Stage 5: Write GeoJSON ───────────────────────────────────────────
    write_geojson(zones, OUTPUT_GEOJSON)

    # ── Stage 6: Write zone summary JSON ─────────────────────────────────
    write_zone_summary(zones, OUTPUT_JSON)

    # ── Summary ──────────────────────────────────────────────────────────
    elapsed = time.time() - t_start
    print_summary(zones, n_clusters, n_assigned, n_noise_discarded, elapsed)


if __name__ == "__main__":
    main()
