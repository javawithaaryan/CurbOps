# 🚀 CurbOps: Parking Enforcement Intelligence

> **Gridlock 2.0 Hackathon** | Backend & Spatial Clustering Pipeline

Welcome to the **CurbOps** backend pipeline! This repository contains the data engineering and spatial clustering engine that powers our parking enforcement intelligence platform. 

Our pipeline takes raw, scattered parking violations and transforms them into highly actionable, patrol-ready enforcement zones using our core metric: **Capacity-Blockage Minutes (CBM)**.

---

## 📂 Repository Structure

This is a clean, production-ready backend repository.

```text
CurbOps_Pipeline/
├── README.md                      # You are here!
├── requirements.txt               # Pipeline dependencies
│
├── build_cbm_dataset.py           # Stage 1: The Data Engineering Pipeline
├── run_clustering.py              # Stage 2: The Spatial Clustering Engine
│
└── dataset/                       # Output artifacts (Ready for Dashboard)
    ├── zones.geojson              # Geospatial map data
    └── zone_summary.json          # Pre-sorted table data
```

---

## ⚙️ How It Works

Our architecture is completely decoupled into two independent stages:

### Stage 1: Data Engineering (`build_cbm_dataset.py`)
This script ingests the raw BTP (Bengaluru Traffic Police) data and calculates the **Capacity-Blockage Minutes (CBM)** for every single ticket.
*   **What is CBM?** CBM measures the actual physical impact a vehicle has on traffic flow, derived from: `Duration × Lane Blockage Factor × Passenger Car Equivalent (PCE) × Junction Sensitivity`.
*   *Output:* A clean, enriched CSV where every violation has a quantified traffic impact score.

### Stage 2: Spatial Clustering (`run_clustering.py`)
This script takes 115,000+ scattered violations and mathematically groups them into actionable areas using **HDBSCAN**.
*   **Why HDBSCAN?** It finds natural, density-based hotspots across the city without forcing us to guess how many zones exist. We use the **Haversine metric** to calculate true distance over the curve of the Earth.
*   **Smart Time Windows:** We designed a custom algorithm to filter out overnight batch-processing artifacts, ensuring that the dashboard recommends realistic, daytime patrol windows (e.g., 07:00-08:00 AM rush hour).
*   *Output:* 2,021 distinct enforcement zones, output as a GeoJSON and JSON array, perfectly pre-sorted by total CBM.

---

## 💻 For the Dashboard UI Team

The files in the `dataset/` folder are 100% ready for your Streamlit application:

1. **Map Visualization:** Use **PyDeck** (`st.pydeck_chart`) to render `dataset/zones.geojson`. You can bind the circle radius to the `radius_m` property.
2. **Priority Tables:** Load `dataset/zone_summary.json`. It is **already sorted** from worst hotspot to best. Just slice the top 5 or 10 elements for your priority UI cards!
3. **Data Quality Filter:** Use the `low_confidence` boolean to let users toggle off zones that have fewer than 5 violations.
4. **Patrol Recommendations:** Highlight the `recommended_window` property—this tells the police exactly what hour they need to be at that zone.

---

*Built with ❤️ by the CurbOps Team for Gridlock 2.0*
