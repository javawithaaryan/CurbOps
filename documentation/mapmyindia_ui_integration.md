# 🗺️ MapmyIndia (Mappls) React-Leaflet Integration Guide

This guide is for the Frontend Team to quickly integrate MapmyIndia base maps directly into the `react-leaflet` component. 

By default, Leaflet uses OpenStreetMap. To switch it to MapmyIndia to fulfill the hackathon's mapping requirement, you simply need to change the `TileLayer` URL.

## 1. Get your REST API Key
Log in to your MapmyIndia (Mappls) developer portal and generate a **REST API Key**. 

> [!WARNING]
> **Use the correct key type!** Earlier in the backend pipeline (`build_cbm_dataset.py`), we used a **Client ID** and **Client Secret** to generate an OAuth token for the Reverse Geocoding API. 
> 
> You **cannot** use those OAuth credentials for the UI. The frontend React map requires a static **REST API Key** (specifically for Raster Maps/Interactive Maps).

## 2. React-Leaflet Implementation

Here is the exact React component snippet you need. Just drop this into your frontend map view!

```tsx
import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Replace this with your actual MapmyIndia REST API Key (store this in a .env file!)
const MAPMYINDIA_REST_KEY = import.meta.env.VITE_MAPMYINDIA_KEY || "YOUR_REST_API_KEY_HERE";

export default function DashboardMap({ zones }) {
  // Center map on Bengaluru
  const center = [12.9716, 77.5946];

  return (
    <MapContainer 
      center={center} 
      zoom={12} 
      style={{ height: '600px', width: '100%', borderRadius: '12px' }}
    >
      {/* 🟢 MAPMYINDIA TILE LAYER 🟢 */}
      <TileLayer
        url={`https://tiles.mappls.com/tiles/{z}/{x}/{y}.png?access_token=${MAPMYINDIA_REST_KEY}`}
        attribution='&copy; <a href="https://www.mapmyindia.com/">MapmyIndia</a>'
      />

      {/* Render the 2,021 Enforcement Zones */}
      {zones.map((zone) => (
        <CircleMarker
          key={zone.properties.zone_id}
          center={[zone.properties.centroid_lat, zone.properties.centroid_lon]}
          radius={Math.max(5, zone.properties.radius_m / 10)} // Scale visually
          pathOptions={{ 
            color: zone.properties.action_tier === 'TOW' ? 'red' : 
                   zone.properties.action_tier === 'PATROL' ? 'orange' : 'blue',
            fillOpacity: 0.6
          }}
        >
          <Popup>
            <strong>{zone.properties.dominant_junction}</strong><br/>
            Tier: {zone.properties.action_tier}<br/>
            Priority Score: {zone.properties.priority_score.toFixed(0)}<br/>
            Patrol Window: {zone.properties.recommended_window}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
```

### Tips for the UI:
1. **Dynamic Radius:** The `radius_m` property in the JSON tells you exactly how large the physical traffic jam hotspot is. Bind that to the `radius` prop in the `CircleMarker`!
2. **Color Coding:** Use the `action_tier` (TOW/PATROL/MONITOR) we generated in the backend to instantly color-code the circles on the map.
3. **Environment Variables:** Since you are using Vite, make sure you put `VITE_MAPMYINDIA_KEY=your_key_here` in a `.env` file at the root of your `frontend/` folder so the key isn't hardcoded.
