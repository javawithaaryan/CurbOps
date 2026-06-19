
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
=======
# 🚀 CurbOps: Parking enforcement intelligence: Repo Structure & Dashboard Handoff

*This document outlines exactly what needs to be pushed to your final GitHub repository for the Gridlock 2.0 submission, followed by crucial instructions for your UI/Dashboard team.*

---

## 📁 1. Project Repo

To ensure a clean, professional submission that the judges can easily review, structure your repository exactly like this:

```text
CurbOps/
│
├── README.md                           # Project overview, setup, and submission links
├── .gitignore                          # Ignore raw CSVs, API keys, Python cache, node_modules
│
├── CurbOps_Pipeline/                   # Data Engineering & Spatial Clustering
│   ├── build_cbm_dataset.py            # Stage 1: Data Engineering
│   ├── run_clustering.py               # Stage 2: Spatial Clustering
│   ├── requirements.txt                # Dependencies
│   └── dataset/                        # Processed outputs (version-controlled)
│       ├── zones.geojson               # Map data (2,021 zones)
│       └── zone_summary.json           # Table/Dashboard data
│
├── dashboard/                          # Stage 3 – UI (React + FastAPI)
│   ├── backend/                        # FastAPI server workspace
│   ├── frontend/                       # React app (create‑react‑app or Vite)
│   └── README.md                       # Setup instructions for both backend and frontend
│
├── documentation/                      # Walkthroughs & submission materials
│   ├── pipeline_walkthrough.md         # Full data pipeline explanation
│   ├── clustering_walkthrough.md       # HDBSCAN decisions, challenges, and results
│   └── demo_script.md                  # (To be added) 90‑second demo script
│
├── submission/                         # Final deliverables for the hackathon form
│   ├── pitch_deck.pptx                 # (To be added) 5‑slide presentation
│   ├── screenshots/                    # (To be added) 3 PNGs for the submission
│   └── demo_video.mp4                  # (To be added) 4K backup video
│
└── assets/                             # Logos, banners, or any static assets used in the dashboard
>>>>>>> e729ddb3747c35e9acb59bec4ce561186f1e78a3
```

---

<<<<<<< HEAD
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

=======
## 💻 Tech Stack Overview

The dashboard UI is built with speed, aesthetics, and type-safety in mind, perfectly aligning with the hackathon constraints.

*   **React + Vite + TypeScript:** Fast development, type safety catches bugs early, and Vite provides instant hot-reload.
*   **Tailwind CSS:** Build clean, professional UI very quickly — critical for the "eye-catching" requirement.
*   **React Router:** Two views (Map + Priority Table) without a page reload.
*   **Recharts:** Lightweight, React-native charts — exactly what you need for pie/bar charts in the drill-down.
*   **react-leaflet:** The best React wrapper for Leaflet; supports MapmyIndia tiles via a custom tile layer.
*   **FastAPI:** Minimal, fast, auto-generated docs — perfect to serve the two static JSON files with CORS.
*   **Static JSON:** Zero backend processing; the dashboard simply fetches the pre-computed data. This aligns perfectly with the hackathon’s “no live API” constraint.

---

## 🎨 Handoff Notes for the Dashboard Team

The Data Engineering and Clustering pipelines are 100% complete. You do not need to run any heavy data processing. **Everything you need is pre-calculated and ready inside `dataset/zones.geojson` and `dataset/zone_summary.json`.**

**1. Rendering the Map**
There are 2,021 enforcement zones in the GeoJSON. Render these using **react-leaflet**. You can bind the circle radius to the `radius_m` property so judges can see the physical size of the congestion hotspots!

**2. The Data is Already Sorted**
You do not need to write complex sorting logic in the UI. `zone_summary.json` is **already sorted by `zone_CBM_sum` descending**. The absolute worst, highest-priority hotspots in Bengaluru are at index `[0]`, `[1]`, `[2]`. Just slice `[:5]` to populate your "Top 5 Priorities" UI cards.

**3. The "Low Confidence" Flag (Crucial UI Feature)**
Every zone has a `low_confidence` boolean (True/False). If it is `True`, it means this zone had fewer than 5 total violations.
👉 **UI Task:** Add a toggle switch in your UI: `[x] Hide low-confidence zones`. If checked, filter these out.

**4. The Recommended Patrol Window**
Every zone has a `recommended_window` (e.g., "07:00-08:00" or "19:00-20:00"). Highlight this prominently in your tables so BTP officers know exactly what hour they need to be at that zone.

**5. Formatting the JSON Arrays**
In the JSON, `top_vehicle_types` and `top_violation_types` are nested arrays (e.g., `[{"type": "SCOOTER", "count": 466}]`). 
👉 **UI Task:** Use **Recharts** to unpack these cleanly into small bar or pie charts in your UI drill-down view.
>>>>>>> e729ddb3747c35e9acb59bec4ce561186f1e78a3
