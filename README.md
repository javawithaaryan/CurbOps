# 🚀 CurbOps: Parking Enforcement Intelligence

> **Gridlock 2.0 Hackathon** | Backend & Spatial Clustering Pipeline

Welcome to the **CurbOps** backend pipeline! This repository contains the data engineering and spatial clustering engine that powers our parking enforcement intelligence platform. 

Our pipeline takes raw, scattered parking violations and transforms them into highly actionable, patrol-ready enforcement zones using our core metric: **Capacity-Blockage Minutes (CBM)**.

---

## 📂 Repository Structure

This is a clean, production-ready backend repository.

```text
CurbOps/
│
├── .gitignore
├── README.md                           
├── requirements.txt                    
│
├── CurbOps_Pipeline/                   # Data Engineering & Spatial Clustering
│   ├── build_cbm_dataset.py            # Stage 1: Data Engineering
│   ├── run_clustering.py               # Stage 2: Spatial Clustering
│   ├── requirements.txt                # Dependencies
│   └── dataset/                        # Processed outputs (version-controlled)
│       ├── zones.geojson               # Map data (2,021 zones)
│       └── zone_summary.json           # Table/Dashboard data
│
├── dashboard/                          # The UI Team's Unified Workspace
│   ├── README.md
│   ├── package.json                    
│   ├── package-lock.json               
│   ├── node_modules/                   
│   ├── backend/                        # FastAPI server workspace
│   └── frontend/                       # React app (Vite)
│
├── documentation/                      # Walkthroughs & submission materials
│   ├── pipeline_walkthrough.md         # Full data pipeline explanation
│   ├── clustering_walkthrough.md       # HDBSCAN decisions, challenges, and results
│   └── qa_verification_walkthrough.md  # Official QA report
│
└── submission/                         # Final deliverables for the hackathon form
    ├── pitch_deck.pptx                 # (To be added) 5‑slide presentation
    ├── screenshots/                    # (To be added) 3 PNGs for the submission
    └── demo_video.mp4                  # (To be added) 4K backup video
```

---

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

The Data Engineering and Clustering pipelines are 100% complete. You do not need to run any heavy data processing. **Everything you need is pre-calculated and ready inside `CurbOps_Pipeline/dataset/zones.geojson` and `CurbOps_Pipeline/dataset/zone_summary.json`.**

**1. Rendering the Map**
There are 2,021 enforcement zones in the GeoJSON. Render these using **react-leaflet**. You can bind the circle radius to the `radius_m` property so judges can see the physical size of the congestion hotspots!

**2. The Data is Already Sorted**
You do not need to write complex sorting logic in the UI. `zone_summary.json` is **already sorted by `priority_score` descending**. The absolute worst, highest-priority hotspots in Bengaluru are at index `[0]`, `[1]`, `[2]`. Just slice `[:5]` to populate your "Top 5 Priorities" UI cards.

**3. Action Tiers**
Each zone includes an `action_tier` field (TOW, PATROL, or MONITOR). Use this to color code the map or display a high-priority badge.

**4. The "Low Confidence" Flag (Crucial UI Feature)**
Every zone has a `low_confidence` boolean (True/False). If it is `True`, it means this zone had fewer than 5 total violations.
👉 **UI Task:** Add a toggle switch in your UI: `[x] Hide low-confidence zones`. If checked, filter these out.

**5. The Recommended Patrol Window**
Every zone has a `recommended_window` (e.g., "07:00-08:00" or "19:00-20:00"). Highlight this prominently in your tables so BTP officers know exactly what hour they need to be at that zone.

**6. Formatting the JSON Arrays**
In the JSON, `top_vehicle_types` and `top_violation_types` are nested arrays (e.g., `[{"type": "SCOOTER", "count": 466}]`). 
👉 **UI Task:** Use **Recharts** to unpack these cleanly into small bar or pie charts in your UI drill-down view.
