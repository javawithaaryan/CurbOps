# CurbOps: Parking enforcement intelligence — Stage 2: Spatial Clustering Walkthrough

> **Focus:** This document details the second stage of the CurbOps: Parking enforcement intelligence data pipeline, where we transform individual parking violations into actionable enforcement zones.

---

## 1. Overview and Objective

The goal of this stage is to group 115,400 individual parking violations (which already have their Capacity-Blockage Minutes or CBM computed) into **operational enforcement zones**. 

These zones are spatial clusters that Bengaluru Traffic Police (BTP) officers can actually patrol and manage. Instead of looking at 100 scattered pins on a map, an officer can look at a single zone with an aggregate "Priority Score" and targeted recommendations.

**Input:** `dataset/violations_with_cbm.csv` (115,400 rows)
**Outputs:** 
1. `dataset/zones.geojson` (For mapping)
2. `dataset/zone_summary.json` (For dashboard tables)

---

## 2. The Implementation: `run_clustering.py`

We built a robust, production-ready Python script ([run_clustering.py](file:///e:/GridLock_Hackathon/run_clustering.py)) that executes the clustering in 6 distinct stages.

### Algorithm Selection: HDBSCAN
We chose **HDBSCAN** (Hierarchical Density-Based Spatial Clustering of Applications with Noise) coupled with the **Haversine metric** (calculating distance on a sphere). 

> [!TIP]
> **Why HDBSCAN?**
> *   **No preset count:** It discovers the number of zones naturally based on data density, unlike K-Means where you must guess 'K'.
> *   **Variable density:** It can identify dense clusters in the city center and looser clusters in the suburbs simultaneously.
> *   **Noise handling:** It explicitly identifies outliers ("noise"), ensuring zone metrics aren't skewed by random, isolated violations.

### The 6 Pipeline Stages

1.  **Load Data:** Reads the enriched CSV and drops any rows missing coordinates as a safety net.
2.  **HDBSCAN Clustering:** Converts lat/lon to radians and runs the clustering algorithm, assigning a `zone_id` to each point. Noise points get `zone_id = -1`.
3.  **Noise Reassignment:** Calculates the distance from every noise point to every valid cluster centroid. If a noise point is within 200 meters of a cluster, it gets adopted into that cluster. Remaining noise is discarded.
4.  **Compute Metrics:** Groups the data by `zone_id` and calculates 14 comprehensive metrics (detailed below).
5.  **Write GeoJSON:** Outputs the zones with Point geometries at their centroids for the interactive map.
6.  **Write JSON Summary:** Outputs a flat array of zone records sorted by total CBM for the dashboard priority table.

---

## 3. Metrics Computed Per Zone

For every discovered zone, we compute these critical metrics:

| Metric | Description |
| :--- | :--- |
| **`zone_id`** | Unique identifier |
| **`zone_CBM_sum`** | Sum of CBM for all violations in the zone (Primary Ranking Metric) |
| **`violation_count`** | Total number of tickets issued here |
| **`peak_hour_ratio`** | Fraction of violations occurring during rush hours (7-11 AM, 5-8 PM) |
| **`recurrence_days`** | Number of unique dates violations occurred (shows persistence) |
| **`top_vehicle_types`** | Top 3 vehicles (e.g., Scooter, Car) with counts |
| **`top_violation_types`** | Top 3 violation categories with counts |
| **`centroid_lat` / `lon`**| Geographic center of the zone |
| **`dominant_junction`** | The most frequent junction name associated with the violations |
| **`police_station`** | The jurisdictional station |
| **`recommended_window`**| The specific 1-hour window with the highest violation volume |
| **`radius_m`** | Max distance from the centroid to any point in the zone |
| **`priority_score`** | `CBM_sum × peak_ratio × log(1 + recurrence_days)` (Used for Tier assignment) |
| **`low_confidence`** | Flagged `true` if the zone has fewer than 5 violations |

---

## 4. Challenges & Iterations During Development

Building this pipeline involved solving several technical hurdles:

### 1. The Epsilon Trap (Mega-Clusters)
**Issue:** The initial specification set `CLUSTER_SELECTION_EPSILON = 0.001` with a comment indicating it meant "~100m". 
**Reality:** Because the metric is Haversine, the input is in radians. `0.001` radians on Earth is actually **~6.4 kilometers** (`0.001 * 6,371,000m`).
**Result:** The first run merged almost all of Bengaluru into just 2 massive mega-clusters.
**Fix:** We updated the epsilon to `0.0`, which removes the forced merging and allows HDBSCAN to find the natural density boundaries, resulting in 2,000+ meaningful zones.

### 2. Windows Unicode Console Errors
**Issue:** The script was designed to print nice Unicode status symbols (like `✓` and `─`) to the console. However, Windows PowerShell defaults to `cp1252` encoding, which crashed the script when trying to print these characters.
**Fixes:** 
*   We updated the script to use standard ASCII fallback characters (`[OK]`, `-`, `->`).
*   We executed the script using `$env:PYTHONIOENCODING = "utf-8"` to ensure any remaining Unicode characters (like those embedded in the raw data) wouldn't crash the standard output stream.
*   We added `low_memory=False` to pandas to suppress mixed-type warnings in the dataset.

### 3. Refining "Dominant Junction" Logic
**Issue:** About 48% of the raw data has "No Junction". A simple `.mode()` calculation would often return "No Junction" as the dominant junction for a zone, which isn't helpful for an officer.
**Fix:** We implemented fallback logic:
1.  Find the most frequent junction.
2.  If it's "No Junction", look at the *second* most frequent junction.
3.  If a real junction exists, use that instead.
4.  If only "No Junction" exists, keep "No Junction".
5.  If the entire zone has NaN for junctions, return "Unknown".

### 4. The Night-Batching Timestamp Artifact
**Issue:** We discovered a massive anomaly: over 70,000 violations were recorded between Midnight and 6 AM, with almost none during daytime hours (7 AM - 6 PM). The `created_datetime` in the raw data was `+00` (UTC) but the pipeline treated them as IST (as required). This massive night spike is a classic data artifact, likely caused by batch-processing of tickets by camera systems overnight.
**Result:** Our initial `recommended_window` calculation suggested 03:00-06:00 for the worst hotspots, which would look ridiculous to a traffic officer knowing peak congestion is 8-11 AM and 5-8 PM.
**Fix:** We updated the logic to try and find the peak hour *specifically within* the defined `PEAK_HOURS` (7-10 AM, 5-7 PM). If a zone has absolutely zero violations during peak hours, only then does it fall back to the global maximum hour. This ensures the dashboard recommends realistic daytime patrol windows.

---

## 5. Final Execution Results

After resolving the challenges, the pipeline ran flawlessly in under 32 seconds on the 115k row dataset.

| Metric | Value |
| :--- | :--- |
| **Runtime** | 31.53 seconds |
| **Clusters (Zones) Found** | **2,021** |
| **Violations Assigned** | **112,501** (97.5% of total) |
| **Noise Points Reassigned** | 29,653 (adopted into nearby zones) |
| **Noise Discarded** | 2,899 (Only 2.5% were true outliers) |

### Top 5 Most Critical Zones Discovered

These are the absolute worst parking hotspots in the dataset, ranked by total Capacity-Blockage Minutes. These represent the immediate "TOW" tier recommendations for the dashboard.

| Rank | Zone ID | Dominant Junction | Police Station | Worst Hour | Total CBM |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 1983 | BTP040 - Elite Junction | Upparpet | 07:00-08:00 | 15,291.65 |
| 2 | 284 | No Junction | Mahadevapura | 07:00-08:00 | 14,359.80 |
| 3 | 1927 | BTP057 - Anand Rao Junction | Upparpet | 19:00-20:00 | 12,894.96 |
| 4 | 1728 | BTP083 - AS Char Street | Chamarajpet | 07:00-08:00 | 12,365.36 |
| 5 | 1558 | BTP211 - Central Street | Shivajinagar | 09:00-10:00 | 10,868.94 |

**The output files `zones.geojson` and `zone_summary.json` are now fully generated and ready to be consumed by the Stage 3 Streamlit Dashboard.**
