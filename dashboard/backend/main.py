import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 1. Initialize the FastAPI app
app = FastAPI(
    title="CurbOps API",
    description="Backend API for the CurbOps Parking Enforcement Dashboard",
    version="1.0.0"
)

# 2. Set up CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Create React App
        "http://localhost:5173",  # Vite default port
        "http://127.0.0.1:5173"  # Vite alternative localhost
    ], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

# 3. Locate the dataset folder (Smart Pathing)
# We check both possible locations just in case the folder structure shifted
BASE_DIR = Path(__file__).resolve().parent.parent.parent

possible_paths = [
    BASE_DIR / "dataset",                      # Option A: At the root (CurbOps/dataset)
    BASE_DIR / "CurbOps_Pipeline" / "dataset"  # Option B: Inside the pipeline folder
]

DATA_DIR = None
for path in possible_paths:
    if path.exists() and (path / "zone_summary.json").exists():
        DATA_DIR = path
        break

if DATA_DIR is None:
    raise FileNotFoundError(
        f"Could not find 'zone_summary.json'! \n"
        f"Checked: {possible_paths[0]} and {possible_paths[1]}. \n"
        f"Please ensure the 'dataset' folder is in one of these locations."
    )

# 4. Helper function to load JSON safely
def load_json(filename):
    file_path = DATA_DIR / filename
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# 5. Load data into memory ONCE at startup (Fast & Efficient)
print(f"Loading data from: {DATA_DIR}")
zones_summary_data = load_json("zone_summary.json")
zones_geojson_data = load_json("zones.geojson")
print("Data loaded successfully!")

# --- API ENDPOINTS ---

@app.get("/")
def read_root():
    return {"message": "CurbOps Backend is running successfully!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# Endpoint 1: Serve the sorted summary data (for the table and stats)
@app.get("/api/zones")
def get_zones_summary():
    return zones_summary_data

# Endpoint 2: Serve the GeoJSON data (for the map)
@app.get("/api/zones/geojson")
def get_zones_geojson():
    return zones_geojson_data