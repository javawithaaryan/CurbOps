#!/usr/bin/env python3
"""
build_cbm_dataset.py — CurbOps: Parking enforcement intelligence · Capacity-Blockage Minutes Pipeline
=========================================================================
Gridlock 2.0 Hackathon  ·  Data-Engineering (R1)

Transforms raw parking-violation CSV into an enriched dataset with the
Capacity-Blockage Minutes (CBM) metric:

    CBM = duration_min × lane_blockage_factor × PCE × junction_sensitivity

Usage:
    python build_cbm_dataset.py
"""

import json
import logging
import math
import os
import sys
import time

import numpy as np
import pandas as pd
import requests

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
INPUT_CSV = "dataset/jan to may police violation_anonymized791b166.csv"
OUTPUT_CSV = "dataset/violations_with_cbm.csv"
CACHE_FILE = "dataset/mmi_cache.json"

CLIENT_ID = (
    "96dHZVzsAuvKpFOIkUIT40J0n4gH6i6xy-HnmGr-XhR1zJ5QRnUu"
    "-FNqWHvq1vYYRkS17-pzeSBlJ1J9bb5x96WpjDMHtYpa"
)
CLIENT_SECRET = (
    "lrFxI-iSEg_UKwlZtW_vUHLVaAo2F7EZYBw7PJvrS8mfjJQ6XAmlwomTK"
    "_OTOW08LE_leYk6k8mG60tSxAW5zNEKSK6EzmCe90t2PjNuJKU="
)
TOKEN_URL = "https://outpost.mapmyindia.com/api/security/oauth/token"
REV_GEOCODE_URL = "https://apis.mapmyindia.com/advancedmaps/v1/{token}/rev_geocode"

# Rate-limit: sleep between API calls (seconds)
API_SLEEP = 0.2
# Retry sleep on 429 / 5xx
RETRY_SLEEP = 1.0

DURATION_CAP_MIN = 240  # hard cap on imputed duration

# ─────────────────────────────────────────────────────────────────────────────
# MAPPING TABLES
# ─────────────────────────────────────────────────────────────────────────────

# Lane-blockage factor by violation keyword (highest priority first)
BLOCKAGE_RULES = [
    (["double parking", "double park"],                          1.0),
    (["bus stop", "bustop", "bus-stop", "parking other than bus stop",
      "parking near bustop"],                                    0.8),
    (["parking opposite to another parked vehicle",
      "parking in a main road", "parking near road crossing",
      "parking near traffic light"],                             0.6),
    (["wrong parking", "no parking", "no-parking"],              0.4),
    (["footpath", "parking on footpath"],                        0.2),
]
DEFAULT_BLOCKAGE = 0.4

# Duration defaults (minutes) by violation keyword
DURATION_RULES = [
    (["footpath", "parking on footpath"],                        60),
    (["wrong parking"],                                          45),
    (["no parking"],                                             30),
    (["bus stop", "bustop", "bus-stop", "parking near bustop",
      "parking other than bus stop"],                            20),
    (["double parking", "double park"],                          15),
]
DEFAULT_DURATION = 30

# PCE mapping — exact match (lowercased) first, then keyword fallback
PCE_EXACT = {
    "car": 1.0, "jeep": 1.0, "van": 1.0, "others": 1.0,
    "scooter": 0.3, "motor cycle": 0.3, "moped": 0.3,
    "passenger auto": 0.5, "goods auto": 2.0,
    "maxi-cab": 2.0, "lgv": 2.0, "tempo": 2.0,
    "mini lorry": 2.0, "school vehicle": 2.0,
    "hgv": 3.0, "lorry/goods vehicle": 3.0, "tanker": 3.0,
    "tractor": 3.0, "private bus": 3.0, "tourist bus": 3.0,
    "factory bus": 3.0, "bus (bmtc/ksrtc)": 3.0,
}
PCE_KEYWORD_FALLBACK = [
    (["truck", "hgv", "lorry", "tanker", "tractor"],  3.0),
    (["bus"],                                          3.0),
    (["lcv", "lgv", "tempo", "maxi", "goods", "mini"], 2.0),
    (["car", "jeep", "van"],                           1.0),
    (["auto"],                                         0.5),
    (["cycle", "scooter", "bike", "moped", "motor"],   0.3),
    (["bicycle"],                                      0.2),
]
DEFAULT_PCE = 1.0

# Parking-related keywords for filtering
PARKING_KEYWORDS = [
    "parking", "no parking", "double park", "bus stop", "bustop",
    "footpath", "obstruction", "wrong parking",
]

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("cbm_pipeline")


# ═════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def parse_violation_types(vtype_str: str) -> list[str]:
    """
    Parse the violation_type column into a list of uppercase strings.

    The column stores a JSON array like '["WRONG PARKING","DOUBLE PARKING"]'.
    Falls back to treating the raw string as a single type on parse failure.
    """
    if pd.isna(vtype_str) or not str(vtype_str).strip():
        return []
    raw = str(vtype_str).strip()
    try:
        items = json.loads(raw)
        if isinstance(items, list):
            return [str(i).strip().upper() for i in items if str(i).strip()]
        return [str(items).strip().upper()]
    except (json.JSONDecodeError, TypeError):
        return [raw.upper()]


def _match_keywords(types_upper: list[str], rules: list) -> float | int | None:
    """
    Given a list of violation-type strings (uppercased) and a rules table
    [(keywords, value), ...], return the MAXIMUM value among all matches.
    Returns None if no rule matches.
    """
    best = None
    types_lower = [t.lower() for t in types_upper]
    for keywords, value in rules:
        for kw in keywords:
            kw_lower = kw.lower()
            for t in types_lower:
                if kw_lower in t:
                    if best is None or value > best:
                        best = value
                    break  # matched this keyword, move to next rule
    return best


def compute_lane_blockage(vtype_str: str) -> float:
    """
    Compute the lane-blockage factor for a violation row.

    Parses the JSON array, maps each type to a factor using BLOCKAGE_RULES,
    and returns the MAXIMUM (worst-case impact).
    """
    types = parse_violation_types(vtype_str)
    if not types:
        return DEFAULT_BLOCKAGE
    result = _match_keywords(types, BLOCKAGE_RULES)
    return result if result is not None else DEFAULT_BLOCKAGE


def assign_duration(vtype_str: str) -> float:
    """
    Assign an imputed duration (minutes) based on violation type.

    Since closed_datetime is 100% NULL in this dataset, duration is entirely
    domain-informed. These are *conservative estimates*, not measured data.
    Takes the MAXIMUM duration when multiple types are present.
    """
    types = parse_violation_types(vtype_str)
    if not types:
        return DEFAULT_DURATION
    result = _match_keywords(types, DURATION_RULES)
    return min(result if result is not None else DEFAULT_DURATION, DURATION_CAP_MIN)


def map_pce(vehicle_type_raw: str) -> float:
    """
    Map a raw vehicle_type string to its Passenger Car Equivalent (PCE)
    using IRC:106-2015 standards adapted for Indian vehicle categories.
    """
    if pd.isna(vehicle_type_raw) or not str(vehicle_type_raw).strip():
        return DEFAULT_PCE
    vt = str(vehicle_type_raw).strip().lower()
    # Exact match first
    if vt in PCE_EXACT:
        return PCE_EXACT[vt]
    # Keyword fallback
    for keywords, value in PCE_KEYWORD_FALLBACK:
        for kw in keywords:
            if kw in vt:
                return value
    return DEFAULT_PCE


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in meters between two WGS-84 points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2)
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_np(lat1, lon1, lat2, lon2):
    """Vectorized Haversine distance (meters) using NumPy arrays."""
    R = 6_371_000
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlam = np.radians(lon2 - lon1)
    a = (np.sin(dphi / 2) ** 2
         + np.cos(phi1) * np.cos(phi2) * np.sin(dlam / 2) ** 2)
    return 2 * R * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


# ═════════════════════════════════════════════════════════════════════════════
# MAPMYINDIA INTEGRATION
# ═════════════════════════════════════════════════════════════════════════════

def get_access_token() -> str:
    """Obtain an OAuth 2.0 access token from the Mappls token endpoint."""
    log.info("Requesting MapmyIndia OAuth access token …")
    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    resp = requests.post(TOKEN_URL, data=payload, timeout=15)
    if resp.status_code != 200:
        log.error("Token request failed: %s — %s", resp.status_code, resp.text)
        raise RuntimeError(f"Token request returned HTTP {resp.status_code}")
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("No access_token in response")
    log.info("✓ OAuth token obtained (expires_in=%ss)", resp.json().get("expires_in"))
    return token


def load_cache(path: str) -> dict:
    """Load the JSON geocode cache from disk."""
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict, path: str) -> None:
    """Persist the geocode cache to disk."""
    with open(path, "w") as f:
        json.dump(cache, f, indent=2)


# Circuit breaker: stop API calls after this many consecutive failures
CIRCUIT_BREAKER_THRESHOLD = 10
_consecutive_failures = 0
_circuit_open = False


def reverse_geocode_cached(
    token: str, lat: float, lng: float, cache: dict
) -> dict | None:
    """
    Call Mappls reverse geocode with local caching and circuit breaker.

    Cache key: "round(lat,4),round(lng,4)" — collapses nearby points
    into a single API call (~11 m precision).

    Circuit breaker: after CIRCUIT_BREAKER_THRESHOLD consecutive 403/401
    errors, stops all further API calls (quota likely exhausted).

    Returns the first result dict or None on failure.
    """
    global _consecutive_failures, _circuit_open

    key = f"{round(lat, 4)},{round(lng, 4)}"
    if key in cache:
        return cache[key]

    # Circuit breaker: skip API call if open
    if _circuit_open:
        return None

    url = REV_GEOCODE_URL.format(token=token)
    params = {"lat": lat, "lng": lng}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 429:
            log.warning("Rate-limited (429) — retrying after %ss …", RETRY_SLEEP)
            time.sleep(RETRY_SLEEP)
            resp = requests.get(url, params=params, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            result = results[0] if results else data
            cache[key] = result
            _consecutive_failures = 0  # reset on success
            return result
        elif resp.status_code in (401, 403):
            # Auth/quota failure — don't cache so retries work next run
            _consecutive_failures += 1
            if _consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
                _circuit_open = True
                log.warning(
                    "Circuit breaker OPEN after %d consecutive 403/401 errors. "
                    "Skipping remaining API calls — junction_sensitivity will "
                    "use nearest-junction distance only.",
                    _consecutive_failures,
                )
            return None
        else:
            log.warning("Rev-geocode %s → HTTP %s", key, resp.status_code)
            cache[key] = None
            return None
    except requests.RequestException as exc:
        log.warning("Rev-geocode %s → %s", key, exc)
        cache[key] = None
        return None
    finally:
        if not _circuit_open:
            time.sleep(API_SLEEP)


# ═════════════════════════════════════════════════════════════════════════════
# PIPELINE STAGES
# ═════════════════════════════════════════════════════════════════════════════

def load_and_filter(filepath: str) -> pd.DataFrame:
    """
    Stage 1: Load the CSV and filter for approved, parking-related rows.

    Returns a copy of the filtered DataFrame.
    """
    log.info("Loading %s …", filepath)
    df = pd.read_csv(filepath)
    log.info("  Loaded %s rows × %s cols", f"{len(df):,}", len(df.columns))

    # Filter: approved only
    df_approved = df[df["validation_status"] == "approved"].copy()
    log.info("  After approved filter: %s rows", f"{len(df_approved):,}")

    # Filter: parking-related (scan violation_type + offence_code)
    pattern = "|".join(PARKING_KEYWORDS)
    vt_match = df_approved["violation_type"].str.lower().str.contains(
        pattern, na=False
    )
    # Also check offence_code for parking keywords (belt-and-suspenders)
    oc_match = df_approved["offence_code"].astype(str).str.lower().str.contains(
        pattern, na=False
    )
    df_parking = df_approved[vt_match | oc_match].copy()
    log.info("  After parking filter: %s rows", f"{len(df_parking):,}")
    return df_parking


def add_lane_blockage(df: pd.DataFrame) -> pd.DataFrame:
    """Stage 2: Compute lane_blockage_factor from violation_type."""
    log.info("Computing lane_blockage_factor …")
    df["lane_blockage_factor"] = df["violation_type"].apply(compute_lane_blockage)
    log.info("  Distribution:\n%s", df["lane_blockage_factor"].value_counts().to_string())
    return df


def add_duration(df: pd.DataFrame) -> pd.DataFrame:
    """
    Stage 3: Assign duration_min from domain-informed defaults.

    NOTE: closed_datetime is 100% NULL in this dataset. These are
    conservative estimates informed by typical violation-type behavior,
    NOT measured data. Documented for Q&A defensibility.
    """
    log.info("Assigning duration_min (domain defaults — closed_datetime is 100%% NULL) …")
    df["duration_min"] = df["violation_type"].apply(assign_duration)
    log.info("  Duration stats:\n%s", df["duration_min"].describe().to_string())
    return df


def add_pce(df: pd.DataFrame) -> pd.DataFrame:
    """Stage 4: Map vehicle_type → PCE (IRC:106-2015)."""
    log.info("Mapping vehicle_type → PCE …")
    df["pce"] = df["vehicle_type"].apply(map_pce)
    log.info("  PCE distribution:\n%s", df["pce"].value_counts().sort_index().to_string())
    return df


def build_junction_lookup(df: pd.DataFrame) -> dict[str, tuple[float, float]]:
    """
    Build a lookup table {junction_name: (lat, lon)} from rows that
    have a real junction name (not 'No Junction' / NaN).

    Uses the first occurrence's lat/lon as the reference coordinates.
    """
    mask = (
        df["junction_name"].notna()
        & (df["junction_name"].str.strip() != "")
        & (df["junction_name"].str.lower() != "no junction")
    )
    jdf = df.loc[mask, ["junction_name", "latitude", "longitude"]].drop_duplicates(
        subset="junction_name", keep="first"
    )
    lookup = {
        row["junction_name"]: (row["latitude"], row["longitude"])
        for _, row in jdf.iterrows()
    }
    log.info("  Junction lookup: %d unique junctions", len(lookup))
    return lookup


def add_junction_sensitivity(df: pd.DataFrame, token: str) -> pd.DataFrame:
    """
    Stage 5: Compute junction_sensitivity for every row.

    Formula: junction_sensitivity = 1 + exp(-distance_m / 100.0)
      - At junction (0 m): 2.0 (maximum sensitivity)
      - At 100 m: ~1.37
      - At 500 m: ~1.007
      - Beyond 1 km: ~1.0 (baseline)

    Strategy:
      - Rows WITH a junction_name → Haversine to that junction's reference coords.
      - Rows WITHOUT ("No Junction") → nearest junction from lookup table,
        enriched with MapmyIndia reverse geocode (cached).
    """
    log.info("Computing junction_sensitivity …")

    junction_lookup = build_junction_lookup(df)
    if not junction_lookup:
        log.warning("  No junctions found — assigning default sensitivity 1.5")
        df["junction_sensitivity"] = 1.5
        return df

    # Prepare junction arrays for vectorized nearest-junction search
    jnames = list(junction_lookup.keys())
    jcoords = np.array([junction_lookup[n] for n in jnames])  # (M, 2)

    # Split into "has junction" and "no junction"
    has_jn = (
        df["junction_name"].notna()
        & (df["junction_name"].str.strip() != "")
        & (df["junction_name"].str.lower() != "no junction")
    )

    # ── Rows WITH junction_name ──────────────────────────────────────────
    log.info("  Processing %s rows WITH junction_name …", f"{has_jn.sum():,}")
    dist_with = np.full(len(df), np.nan)
    for jname, (jlat, jlon) in junction_lookup.items():
        mask = df["junction_name"] == jname
        if mask.any():
            d = haversine_np(
                df.loc[mask, "latitude"].values,
                df.loc[mask, "longitude"].values,
                jlat, jlon,
            )
            dist_with[mask.values] = d

    # ── Rows WITHOUT junction_name → nearest junction ────────────────────
    no_jn_idx = df.index[~has_jn]
    log.info("  Processing %s rows WITHOUT junction_name …", f"{len(no_jn_idx):,}")

    if len(no_jn_idx) > 0:
        vlats = df.loc[no_jn_idx, "latitude"].values  # (N,)
        vlons = df.loc[no_jn_idx, "longitude"].values

        # Vectorized nearest-junction: broadcast (N,1) vs (M,)
        dists = haversine_np(
            vlats[:, None], vlons[:, None],
            jcoords[:, 0][None, :], jcoords[:, 1][None, :],
        )  # (N, M)
        min_dists = dists.min(axis=1)  # (N,)
        dist_with[~has_jn.values] = min_dists

    # ── MapmyIndia enrichment for "No Junction" rows ────────────────────
    cache = load_cache(CACHE_FILE)
    initial_cache_size = len(cache)

    # Deduplicate coordinates to minimize API calls
    if len(no_jn_idx) > 0:
        unique_coords = (
            df.loc[no_jn_idx, ["latitude", "longitude"]]
            .apply(lambda r: (round(r["latitude"], 4), round(r["longitude"], 4)), axis=1)
            .drop_duplicates()
        )
        uncached = [
            c for c in unique_coords
            if f"{c[0]},{c[1]}" not in cache
        ]
        log.info(
            "  MapmyIndia enrichment: %d unique coords, %d uncached (cache has %d entries)",
            len(unique_coords), len(uncached), initial_cache_size,
        )
        if uncached:
            log.info("  Calling reverse geocode for %d coordinates …", len(uncached))
            for i, (lat, lng) in enumerate(uncached):
                reverse_geocode_cached(token, lat, lng, cache)
                if _circuit_open:
                    log.info("    Circuit breaker tripped at call %d / %d", i + 1, len(uncached))
                    break
                if (i + 1) % 100 == 0:
                    log.info("    … %d / %d calls done", i + 1, len(uncached))
                    save_cache(cache, CACHE_FILE)  # periodic save
            save_cache(cache, CACHE_FILE)
            log.info("  ✓ Reverse geocode done — cache has %d entries (circuit_open=%s)",
                     len(cache), _circuit_open)

    # ── Compute junction_sensitivity ─────────────────────────────────────
    df["junction_distance_m"] = dist_with
    df["junction_sensitivity"] = 1.0 + np.exp(-df["junction_distance_m"] / 100.0)

    log.info("  Junction sensitivity stats:\n%s",
             df["junction_sensitivity"].describe().to_string())
    return df


def compute_cbm(df: pd.DataFrame) -> pd.DataFrame:
    """Stage 6: Compute the final CBM metric."""
    log.info("Computing CBM …")
    df["cbm"] = (
        df["duration_min"]
        * df["lane_blockage_factor"]
        * df["pce"]
        * df["junction_sensitivity"]
    )
    log.info("  CBM stats:\n%s", df["cbm"].describe().to_string())
    return df


def print_summary(df: pd.DataFrame) -> None:
    """Print a human-readable summary of the output dataset."""
    print("\n" + "=" * 70)
    print("  CurbOps: Parking enforcement intelligence — CBM Pipeline Summary")
    print("=" * 70)
    print(f"  Total rows:               {len(df):>10,}")
    print(f"  CBM columns added:        duration_min, lane_blockage_factor, pce,")
    print(f"                            junction_sensitivity, junction_distance_m, cbm")
    print()
    print("  ── Duration (min) ───────────────────────────────────────")
    print(f"    Mean:   {df['duration_min'].mean():.1f}")
    print(f"    Median: {df['duration_min'].median():.1f}")
    print(f"    Max:    {df['duration_min'].max():.1f}")
    print()
    print("  ── Lane Blockage Factor ─────────────────────────────────")
    for val, cnt in df["lane_blockage_factor"].value_counts().sort_index().items():
        print(f"    {val:.1f}  →  {cnt:>8,} rows ({cnt/len(df)*100:.1f}%)")
    print()
    print("  ── PCE ──────────────────────────────────────────────────")
    for val, cnt in df["pce"].value_counts().sort_index().items():
        print(f"    {val:.1f}  →  {cnt:>8,} rows ({cnt/len(df)*100:.1f}%)")
    print()
    print("  ── Junction Sensitivity ─────────────────────────────────")
    print(f"    Mean:   {df['junction_sensitivity'].mean():.4f}")
    print(f"    Min:    {df['junction_sensitivity'].min():.4f}")
    print(f"    Max:    {df['junction_sensitivity'].max():.4f}")
    print()
    print("  ── CBM (Capacity-Blockage Minutes) ──────────────────────")
    print(f"    Mean:   {df['cbm'].mean():.2f}")
    print(f"    Median: {df['cbm'].median():.2f}")
    print(f"    Max:    {df['cbm'].max():.2f}")
    print(f"    Total:  {df['cbm'].sum():,.0f}")
    print()

    # Top 10 zones by total CBM
    if "police_station" in df.columns:
        top_zones = (
            df.groupby("police_station")["cbm"]
            .agg(["sum", "count", "mean"])
            .sort_values("sum", ascending=False)
            .head(10)
        )
        print("  ── Top 10 Enforcement Zones (by total CBM) ──────────────")
        for ps, row in top_zones.iterrows():
            print(f"    {ps:<35s}  CBM={row['sum']:>10,.0f}  "
                  f"violations={row['count']:>5,}  avg={row['mean']:.1f}")
    print("=" * 70)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

def main() -> None:
    """Orchestrate the full CBM data pipeline."""
    t_start = time.time()
    log.info("=" * 60)
    log.info("CurbOps: Parking enforcement intelligence — CBM Pipeline starting")
    log.info("=" * 60)

    # Validate input file exists
    if not os.path.exists(INPUT_CSV):
        log.error("Input file not found: %s", INPUT_CSV)
        sys.exit(1)

    # Stage 1: Load & Filter
    df = load_and_filter(INPUT_CSV)
    if df.empty:
        log.error("No rows after filtering — aborting.")
        sys.exit(1)

    # Stage 2: Lane Blockage Factor
    df = add_lane_blockage(df)

    # Stage 3: Duration
    df = add_duration(df)

    # Stage 4: PCE
    df = add_pce(df)

    # Stage 5: Junction Sensitivity (includes MapmyIndia calls)
    token = get_access_token()
    df = add_junction_sensitivity(df, token)

    # Stage 6: CBM
    df = compute_cbm(df)

    # Save output
    log.info("Saving output to %s …", OUTPUT_CSV)
    df.to_csv(OUTPUT_CSV, index=False)
    log.info("✓ Saved %s rows to %s", f"{len(df):,}", OUTPUT_CSV)

    elapsed = time.time() - t_start
    log.info("Pipeline complete in %.1f seconds", elapsed)

    # Summary
    print_summary(df)


if __name__ == "__main__":
    main()
