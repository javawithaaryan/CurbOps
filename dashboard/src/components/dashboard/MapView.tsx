'use client';

// ---------------------------------------------------------------------------
// CurbOps — MapView
// Full-bleed map with geographic <Circle> markers coloured by action_tier.
// Basemap strategy: MapmyIndia (primary, judge's browser can reach it) with
// automatic fallback to Esri World Imagery + OSM (sandbox + offline-friendly).
// A small basemap switcher lets the demo toggle between layers live.
//
// Circle logic:
//   • radius = Math.max(8, zone.radius_m || 20)  — metres, with 8m floor
//   • colour from centralised src/lib/tierColors.ts
//   • Simulate ON: MONITOR fades to 0.1 opacity; TOW/PATROL get a halo
//     (radius × 2, 10% opacity glow underneath)
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react';
import { MapContainer, TileLayer, Circle, Tooltip, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { getJunctionDisplayName } from '@/lib/dashboard/tiers';
import {
  TIER_COLORS,
  TIER_FILL_OPACITY,
  TIER_STROKE,
  HALO_RADIUS_MULTIPLIER,
} from '@/lib/tierColors';
import type { ActionTier, Zone } from '@/lib/dashboard/types';

// ---------------------------------------------------------------------------
// Place search bar (Nominatim – free, no API key, bounded to Bengaluru)
// ---------------------------------------------------------------------------
interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

function MapSearchBar() {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' Bengaluru')}&viewbox=77.4,13.1,77.8,12.8&bounded=1&limit=5`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data: SearchResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 350);
  };

  const handleSelect = (r: SearchResult) => {
    map.flyTo([parseFloat(r.lat), parseFloat(r.lon)] as LatLngExpression, 16, { duration: 1.0 });
    setQuery(r.display_name.split(',')[0]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="absolute top-3 left-14 z-[500] w-72">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search places…"
          className="w-full pl-8 pr-3 py-2 text-[12px] font-mono rounded-md glass-dark text-white placeholder:text-slate-500 border border-white/10 focus:border-[#22d3ee]/50 focus:outline-none transition"
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[#22d3ee] border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="mt-1 rounded-md glass-dark border border-white/10 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-[11px] font-mono text-slate-200 hover:bg-white/10 hover:text-[#22d3ee] transition border-b border-white/5 last:border-b-0"
            >
              {r.display_name.length > 60 ? r.display_name.slice(0, 60) + '…' : r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BENGALURU_CENTER: [number, number] = [12.9716, 77.5946];
const BENGALURU_ZOOM = 12;

// ---------------------------------------------------------------------------
// Basemap definitions
// ---------------------------------------------------------------------------
// CartoDB Dark Matter — clean, dark-themed OpenStreetMap layer that matches
// the dashboard's dark-blue/ink aesthetic and doesn't distract from the
// brightly coloured enforcement zones. Reachable from any network (Fastly
// CDN, no API key, CORS-enabled, retina-capable).
//
// Tile URL: https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
//   • {s}  → tile subdomain (a/b/c/d) for parallel fetching
//   • {r}  → "@2x" on retina screens, "" otherwise
//
// We offer three visually distinct basemaps:
//   • Dark Matter — dramatic dark map with labels (default, "night ops" look)
//   • Light       — CartoDB Positron, bright grey standard map (command-room default)
//   • Satellite   — Esri World Imagery (real-world street-level context)
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Esri World Imagery (satellite) — kept as a switcher option for street-level
// context during the demo. CORS-enabled, no key needed.
const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

type BasemapKey = 'dark' | 'light' | 'satellite';

const BASEMAPS: { key: BasemapKey; label: string; color: string }[] = [
  { key: 'dark', label: 'Dark Matter', color: '#22d3ee' },
  { key: 'light', label: 'Light', color: '#a855f7' },
  { key: 'satellite', label: 'Satellite', color: '#10b981' },
];

// ---------------------------------------------------------------------------
// Fly-to controller
// ---------------------------------------------------------------------------
function FlyToController({
  flyToZone,
}: {
  flyToZone: { lat: number; lon: number; radius_m: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!flyToZone) return;
    const { lat, lon } = flyToZone;
    map.flyTo([lat, lon] as LatLngExpression, Math.max(map.getZoom(), 15), {
      duration: 0.9,
      easeLinearity: 0.25,
    });
  }, [flyToZone, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Custom recenter + reset controls
// ---------------------------------------------------------------------------
function MapControls({ onReset }: { onReset: () => void }) {
  const map = useMap();
  return (
    <div className="absolute bottom-6 right-3 z-[500] flex flex-col gap-2">
      <button
        onClick={() =>
          map.flyTo(BENGALURU_CENTER as LatLngExpression, BENGALURU_ZOOM, {
            duration: 0.7,
          })
        }
        className="w-9 h-9 rounded-md glass-dark text-slate-200 hover:text-[#22d3ee] flex items-center justify-center transition"
        title="Recenter on Bengaluru"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          <path
            d="M8 1 V3 M8 13 V15 M1 8 H3 M13 8 H15"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        onClick={onReset}
        className="w-9 h-9 rounded-md glass-dark text-slate-200 hover:text-[#22d3ee] flex items-center justify-center transition"
        title="Reset view"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
          <path
            d="M3 8 A5 5 0 1 1 8 13 L8 13"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M3 4 V8 H7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Basemap switcher (top-right of map)
// ---------------------------------------------------------------------------
function BasemapSwitcher({
  current,
  onChange,
}: {
  current: BasemapKey;
  onChange: (k: BasemapKey) => void;
}) {
  return (
    <div className="absolute top-3 right-3 z-[500] glass-dark rounded-md flex overflow-hidden">
      {BASEMAPS.map((bm) => {
        const active = bm.key === current;
        return (
          <button
            key={bm.key}
            onClick={() => onChange(bm.key)}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition flex items-center gap-1.5 ${
              active
                ? 'bg-white/15 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
            title={`Switch basemap to ${bm.label}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: bm.color,
                boxShadow: active ? `0 0 6px ${bm.color}` : 'none',
              }}
            />
            {bm.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------
interface MapViewProps {
  zones: Zone[];
  simulate: boolean;
  onSelect: (z: Zone) => void;
  selectedZone: Zone | null;
  flyToZone: { lat: number; lon: number; radius_m: number } | null;
}

export default function MapView({
  zones,
  simulate,
  onSelect,
  selectedZone,
  flyToZone,
}: MapViewProps) {
  const mapRef = useRef<{ flyTo: (c: LatLngExpression, z: number, opts?: unknown) => void } | null>(null);
  // CartoDB Dark Matter is the default — it loads reliably from any network
  // (Fastly CDN, no API key), matches the dashboard's dark aesthetic, and
  // keeps the brightly coloured enforcement zones as the visual focus.
  const [basemap, setBasemap] = useState<BasemapKey>('dark');

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={BENGALURU_CENTER as LatLngExpression}
        zoom={BENGALURU_ZOOM}
        minZoom={10}
        maxZoom={18}
        zoomControl={true}
        attributionControl={true}
        className="h-full w-full"
        ref={(m) => {
          (mapRef as { current: unknown }).current = m as unknown;
        }}
        preferCanvas={true}
      >
        {basemap === 'dark' && (
          <TileLayer
            url={CARTO_DARK}
            attribution={CARTO_ATTR}
            maxZoom={20}
            keepBuffer={5}
            updateWhenZooming={false}
            updateWhenIdle={true}
            key="carto-dark"
          />
        )}
        {basemap === 'light' && (
          <TileLayer
            url={CARTO_LIGHT}
            attribution={CARTO_ATTR}
            maxZoom={20}
            keepBuffer={5}
            updateWhenZooming={false}
            updateWhenIdle={true}
            key="carto-light"
          />
        )}
        {basemap === 'satellite' && (
          <>
            <TileLayer url={ESRI_TILES} attribution={ESRI_ATTR} maxZoom={19} keepBuffer={5} updateWhenZooming={false} updateWhenIdle={true} key="esri-base" />
            <TileLayer url={ESRI_LABELS_TILES} attribution="" maxZoom={19} keepBuffer={5} updateWhenZooming={false} updateWhenIdle={true} key="esri-labels" />
          </>
        )}

        <MapSearchBar />
        <FlyToController flyToZone={flyToZone} />

        {zones.map((z) => {
          const tier: ActionTier = z.action_tier || 'MONITOR';
          const palette = TIER_COLORS[tier] || TIER_COLORS.MONITOR;
          // Geographic radius in metres — minimum 8m so very small zones
          // remain visible when zoomed out.
          const radius = Math.max(8, z.radius_m || 20);
          const isSelected = selectedZone && selectedZone.zone_id === z.zone_id;

          // Simulation logic:
          //  • MONITOR zones fade out (opacity 0.35 → 0.1)
          //  • TOW / PATROL get a halo: a second, larger circle (radius × 2)
          //    rendered underneath at 10% opacity, creating a glow effect
          //    that represents the projected area of influence.
          const isDeployable = tier === 'TOW' || tier === 'PATROL';
          const fillOpacity = simulate
            ? isDeployable
              ? TIER_FILL_OPACITY.simulateDeployable
              : TIER_FILL_OPACITY.simulateMonitor
            : isSelected
              ? TIER_FILL_OPACITY.selected
              : TIER_FILL_OPACITY.normal;

          return (
            <Fragment key={z.zone_id}>
              {/* Halo: projected area-of-influence ring under deployable zones
                  when Simulate is ON. Rendered first so the main circle sits
                  on top of it. */}
              {simulate && isDeployable && (
                <Circle
                  center={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
                  radius={radius * HALO_RADIUS_MULTIPLIER}
                  pathOptions={{
                    color: palette.fill,
                    weight: 0,
                    opacity: 0,
                    fillColor: palette.fill,
                    fillOpacity: TIER_FILL_OPACITY.halo,
                    interactive: false,
                  }}
                />
              )}

              {/* Main circle */}
              <Circle
                center={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
                radius={radius}
                pathOptions={basemap === 'satellite' ? {
                  color: '#ffffff',
                  weight: isSelected ? 2 : 1,
                  opacity: isSelected ? 1 : 0.8,
                  fillColor: palette.fill,
                  fillOpacity: isSelected ? 0.9 : (simulate ? (isDeployable ? 0.85 : 0.15) : 0.75),
                } : basemap === 'light' ? {
                  color: palette.stroke,
                  weight: isSelected ? 2 : 1,
                  opacity: isSelected ? 1 : 0.7,
                  fillColor: palette.fill,
                  fillOpacity: isSelected ? 0.9 : (simulate ? (isDeployable ? 0.85 : 0.15) : 0.75),
                } : {
                  color: palette.stroke,
                  weight: isSelected ? TIER_STROKE.weightSelected : TIER_STROKE.weight,
                  opacity: isSelected ? TIER_STROKE.opacitySelected : TIER_STROKE.opacity,
                  fillColor: palette.fill,
                  fillOpacity,
                }}
                eventHandlers={{ click: () => onSelect(z) }}
              >
                <Tooltip
                  direction="top"
                  className="curbops-tooltip"
                  opacity={1}
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[12px] text-white">
                      {getJunctionDisplayName(z)}
                    </div>
                    <div className="text-[10px] text-slate-300 font-mono">
                      CBM: {Math.round(z.zone_CBM_sum).toLocaleString('en-IN')} ·{' '}
                      {(z.peak_hour_ratio * 100).toFixed(1)}% peak
                    </div>
                    <div className="text-[10px] text-[#22d3ee] font-mono">
                      Window: {z.recommended_window}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">
                      {tier} · {z.police_station}
                    </div>
                  </div>
                </Tooltip>
              </Circle>
            </Fragment>
          );
        })}

        <MapControls
          onReset={() => {
            (mapRef.current as { flyTo?: (c: LatLngExpression, z: number, opts?: unknown) => void } | null)?.flyTo?.(
              BENGALURU_CENTER as LatLngExpression,
              BENGALURU_ZOOM,
              { duration: 0.7 }
            );
          }}
        />
      </MapContainer>

      <BasemapSwitcher current={basemap} onChange={setBasemap} />

      <div className="scanline-overlay pointer-events-none" />
    </div>
  );
}
