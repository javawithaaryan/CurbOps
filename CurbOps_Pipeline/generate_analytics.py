#!/usr/bin/env python3
# ═════════════════════════════════════════════════════════════════════════════
# CurbOps — generate_analytics.py
#
# Derives real daily parking-impact trends from violations_with_cbm.csv and
# writes dataset/analytics.json, consumed by the dashboard's "City Trends"
# panel (GET /api/analytics).
#
# All numbers trace back to rows in the CSV — nothing is fabricated.
#
# Reuses the EXACT filtering logic from build_cbm_dataset.py
# (validation_status == "approved" + PARKING_KEYWORDS regex), and the SAME
# timestamp handling as run_clustering.py (pd.to_datetime with no timezone
# conversion — the +00 suffix is treated as IST, by project convention, so
# the morning/evening buckets line up with the dashboard's recommended_window).
#
# Independent of run_clustering.py: run it any time after the CSV exists.
# If a `zone_id` column is present (e.g. once clustering writes it back out)
# active_zones is included; otherwise that field is omitted gracefully.
# ═════════════════════════════════════════════════════════════════════════════

import json
import logging
import sys
from pathlib import Path

import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
DATASET_DIR = Path(__file__).resolve().parent / "dataset"
INPUT_CSV = DATASET_DIR / "violations_with_cbm.csv"
OUTPUT_JSON = DATASET_DIR / "analytics.json"

# Same keywords as build_cbm_dataset.py — kept inline so this script is
# self-contained and can be run on its own.
PARKING_KEYWORDS = [
    "parking", "no parking", "double park", "bus stop", "bustop",
    "footpath", "obstruction", "wrong parking",
]

# Time-of-day windows (hours, treated as IST). Morning = AM peak,
# evening = PM peak, offpeak = everything else.
MORNING_HOURS = {7, 8, 9, 10}
EVENING_HOURS = {17, 18, 19}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("analytics")


# ═════════════════════════════════════════════════════════════════════════════
# FILTER (mirrors build_cbm_dataset.load_and_filter)
# ═════════════════════════════════════════════════════════════════════════════
def load_and_filter(filepath: Path) -> pd.DataFrame:
    """Load the CSV and keep only approved, parking-related rows."""
    log.info("Loading %s …", filepath)
    # low_memory=False silences the mixed-type warning on the scita timestamp col.
    df = pd.read_csv(filepath, low_memory=False)
    log.info("  Loaded %s rows × %s cols", f"{len(df):,}", len(df.columns))

    # approved only
    df = df[df["validation_status"] == "approved"].copy()
    log.info("  After approved filter: %s rows", f"{len(df):,}")

    # parking-related (scan violation_type + offence_code, case-insensitive)
    pattern = "|".join(PARKING_KEYWORDS)
    vt_match = df["violation_type"].str.lower().str.contains(pattern, na=False)
    oc_match = df["offence_code"].astype(str).str.lower().str.contains(pattern, na=False)
    df = df[vt_match | oc_match].copy()
    log.info("  After parking filter: %s rows", f"{len(df):,}")
    return df


# ═════════════════════════════════════════════════════════════════════════════
# AGGREGATION
# ═════════════════════════════════════════════════════════════════════════════
def build_daily(df: pd.DataFrame) -> list[dict]:
    """Group by date and compute the per-day CBM breakdown."""
    has_zone = "zone_id" in df.columns

    # Parse timestamps exactly like run_clustering.py: no tz conversion.
    dt = pd.to_datetime(df["created_datetime"], errors="coerce")
    mask = dt.notna()
    df = df.loc[mask].copy()
    df["_date"] = dt[mask].dt.date
    df["_hour"] = dt[mask].dt.hour
    log.info("  Usable rows after datetime parse: %s", f"{len(df):,}")

    df["_morning"] = df["_hour"].isin(MORNING_HOURS)
    df["_evening"] = df["_hour"].isin(EVENING_HOURS)

    records: list[dict] = []
    for date, g in df.groupby("_date"):
        total = float(g["cbm"].sum())
        morning = float(g.loc[g["_morning"], "cbm"].sum())
        evening = float(g.loc[g["_evening"], "cbm"].sum())
        offpeak = round(total - morning - evening, 2)
        row = {
            "date": date.isoformat(),
            "total_cbm": round(total, 2),
            "morning_cbm": round(morning, 2),
            "evening_cbm": round(evening, 2),
            "offpeak_cbm": offpeak,
        }
        if has_zone:
            row["active_zones"] = int(g["zone_id"].nunique())
        records.append(row)

    records.sort(key=lambda r: r["date"])
    return records


# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
def main() -> int:
    if not INPUT_CSV.exists():
        log.error("Input CSV not found: %s", INPUT_CSV)
        return 1

    df = load_and_filter(INPUT_CSV)
    daily = build_daily(df)

    OUTPUT_JSON.write_text(json.dumps({"daily": daily}, indent=2), encoding="utf-8")
    log.info("✓ Wrote %s  ·  %d days  ·  %s",
             OUTPUT_JSON, len(daily),
             f"{daily[0]['date']} → {daily[-1]['date']}" if daily else "no data")
    print(f"Success: wrote {OUTPUT_JSON.name} with {len(daily)} days.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
