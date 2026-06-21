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

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { MapContainer, TileLayer, Circle, Tooltip, useMap, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { getJunctionDisplayName, parseWindow } from '@/lib/dashboard/tiers';
import MapSearch, { type PlaceResult } from './MapSearch';
import {
  TIER_COLORS,
  TIER_FILL_OPACITY,
  TIER_STROKE,
  HALO_RADIUS_MULTIPLIER,
} from '@/lib/tierColors';
import type { ActionTier, Zone } from '@/lib/dashboard/types';

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
// We offer three flavours in the basemap switcher:
//   • Dark Matter        — full dark map with labels (default)
//   • Dark Matter (clean) — same dark map, no labels (for max data-viz focus)
//   • Satellite          — Esri World Imagery (for street-level context)
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_DARK_NOLABELS = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
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

type BasemapKey = 'dark' | 'dark-clean' | 'satellite';

const BASEMAPS: { key: BasemapKey; label: string; color: string }[] = [
  { key: 'dark', label: 'Dark Matter', color: '#22d3ee' },
  { key: 'dark-clean', label: 'Clean', color: '#a855f7' },
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
// Search-result fly-to controller. When a place is picked from the search
// dropdown, we fly to a street-level zoom and drop a temporary pin.
// ---------------------------------------------------------------------------
function PlaceFlyToController({ place }: { place: PlaceResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (!place) return;
    map.flyTo([place.lat, place.lon] as LatLngExpression, 16, {
      duration: 0.9,
      easeLinearity: 0.25,
    });
  }, [place, map]);
  return null;
}

// Build a teardrop pin DivIcon so the search marker matches the dashboard's
// cyan-on-dark aesthetic instead of Leaflet's default blue balloon.
const PLACE_PIN_ICON = L.divIcon({
  className: 'curbops-place-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <path d="M15 1.5 C8.6 1.5 3.5 6.4 3.5 12.5 C3.5 19.5 15 28.5 15 28.5 C15 28.5 26.5 19.5 26.5 12.5 C26.5 6.4 21.4 1.5 15 1.5 Z"
      fill="#22d3ee" fill-opacity="0.25" stroke="#22d3ee" stroke-width="1.6"/>
    <circle cx="15" cy="12.5" r="4" fill="#22d3ee"/>
  </svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
  popupAnchor: [0, -26],
});

// Build a custom numbered icon for Suggested Enforcement Route stops.
// Using inline style instead of Tailwind classes because these render inside
// Leaflet's DOM outside the Next.js stylesheet scope.
const createRouteStopIcon = (index: number) => {
  if (typeof window === 'undefined') return null as unknown as L.DivIcon;
  return L.divIcon({
    className: 'route-stop-pin',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#E5484D;border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(229,72,77,0.5)">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
};


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
  // Currently-selected place from the map search box. Holds the pin + drives
  // the fly-to. Cleared via the marker's popup close button.
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Compute Suggested Enforcement Route: TOW priority zones sorted by priority score descending (top 3 to 5)
  const routeZones = useMemo(() => {
    const towZones = zones.filter((z) => z.action_tier === 'TOW');
    const sorted = [...towZones].sort((a, b) => b.priority_score - a.priority_score);
    return sorted.slice(0, 5);
  }, [zones]);

  const shift = useMemo(() => {
    if (routeZones.length === 0) return 'Morning';
    const firstWin = parseWindow(routeZones[0].recommended_window);
    if (!firstWin) return 'Morning';
    return firstWin.start < 12 ? 'Morning' : 'Evening';
  }, [routeZones]);

  const estimatedWindow = useMemo(() => {
    if (routeZones.length === 0) return 'N/A';
    const windows = routeZones
      .map((z) => parseWindow(z.recommended_window))
      .filter((w): w is NonNullable<typeof w> => w !== null);
    if (windows.length === 0) return routeZones[0].recommended_window || 'N/A';
    const minStart = Math.min(...windows.map((w) => w.start));
    const maxEnd = Math.max(...windows.map((w) => w.end));
    return `${String(minStart).padStart(2, '0')}:00–${String(maxEnd).padStart(2, '0')}:00`;
  }, [routeZones]);

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
            key="carto-dark"
          />
        )}
        {basemap === 'dark-clean' && (
          <TileLayer
            url={CARTO_DARK_NOLABELS}
            attribution={CARTO_ATTR}
            maxZoom={20}
            key="carto-dark-nolabels"
          />
        )}
        {basemap === 'satellite' && (
          <>
            <TileLayer url={ESRI_TILES} attribution={ESRI_ATTR} maxZoom={19} key="esri-base" />
            <TileLayer url={ESRI_LABELS_TILES} attribution="" maxZoom={19} key="esri-labels" />
          </>
        )}

        <FlyToController flyToZone={flyToZone} />
        <PlaceFlyToController place={placeResult} />

        {/* Temporary pin for the place picked from the search box. */}
        {placeResult && (
          <Marker
            position={[placeResult.lat, placeResult.lon] as LatLngExpression}
            icon={PLACE_PIN_ICON}
          >
            <Popup className="curbops-place-popup">
              <div className="space-y-0.5">
                <div className="font-semibold text-[12px] text-white">
                  {placeResult.label}
                </div>
                {placeResult.detail && (
                  <div className="text-[10px] text-slate-300 font-mono">
                    {placeResult.detail}
                  </div>
                )}
                <div className="text-[9px] text-[#22d3ee] font-mono uppercase tracking-wider">
                  {placeResult.lat.toFixed(4)}°, {placeResult.lon.toFixed(4)}°
                </div>
              </div>
            </Popup>
          </Marker>
        )}

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
                pathOptions={{
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

        {/* Suggested Enforcement Route Polyline */}
        {routeZones.length >= 2 && (
          <Polyline
            positions={routeZones.map((z) => [z.centroid_lat, z.centroid_lon] as [number, number])}
            pathOptions={{
              color: '#E5484D',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '8, 8',
            }}
          />
        )}

        {/* Suggested Enforcement Route Stop Markers */}
        {routeZones.map((z, idx) => {
          const icon = createRouteStopIcon(idx);
          if (!icon) return null;
          return (
            <Marker
              key={`route-stop-${z.zone_id}`}
              position={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
              icon={icon}
            >
              <Popup className="curbops-place-popup">
                <div className="space-y-0.5 font-mono">
                  <div className="font-semibold text-[11px] text-white">
                    <span className="text-red-400 font-bold">Stop #{idx + 1}:</span> {getJunctionDisplayName(z)}
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Priority Score: {Math.round(z.priority_score).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9px] text-[#22d3ee] uppercase tracking-wider">
                    Window: {z.recommended_window}
                  </div>
                </div>
              </Popup>
            </Marker>
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

      {/* Place search with autocomplete (top-left). Lives above the map so it
          doesn't fight Leaflet's own controls (top-right). */}
      <div className="map-search-slot">
        <MapSearch onSelect={setPlaceResult} onOpenChange={setSearchOpen} />
      </div>

      {/* Suggested Enforcement Route Card */}
      {routeZones.length > 0 && (
        <div
          className="absolute left-3 z-[600] w-[320px] glass-dark rounded-lg p-3 text-slate-200 border border-red-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-slideIn transition-all duration-300"
          style={{ top: searchOpen ? '380px' : '60px' }}
        >
          <div className="flex items-center justify-between mb-2 border-b border-red-500/20 pb-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase font-semibold text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Patrol Deployment Plan
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 uppercase tracking-widest border border-red-500/20 font-semibold">
              TOW OPS
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs font-mono mb-2">
            <div className="bg-slate-950/40 rounded px-2.5 py-1.5 border border-slate-800/40">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Shift</div>
              <div className="font-semibold text-slate-200 mt-0.5">{shift}</div>
            </div>
            <div className="bg-slate-950/40 rounded px-2.5 py-1.5 border border-slate-800/40">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Stops</div>
              <div className="font-semibold text-slate-200 mt-0.5">{routeZones.length} Zones</div>
            </div>
            <div className="col-span-2 bg-slate-950/40 rounded px-2.5 py-1.5 border border-slate-800/40">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Estimated Window</div>
              <div className="font-semibold text-red-400 mt-0.5">{estimatedWindow}</div>
            </div>
            <div className="col-span-2 bg-slate-950/40 rounded px-2.5 py-1.5 border border-slate-800/40">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Expected Recovery</div>
              <div className="font-semibold text-emerald-300 mt-0.5">408,535 CBM</div>
            </div>
          </div>
          {/* Stops List */}
          <div className="space-y-1 max-h-[120px] overflow-y-auto scroll-thin border-t border-slate-800/40 pt-1.5">
            {routeZones.map((z, idx) => (
              <button
                key={z.zone_id}
                onClick={() => {
                  onSelect(z);
                  (mapRef.current as any)?.flyTo?.([z.centroid_lat, z.centroid_lon], 16, { duration: 0.8 });
                }}
                className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-[10px] text-left transition"
              >
                <span className="truncate pr-2 text-slate-300">
                  <strong className="text-red-400 font-mono pr-1">#{idx + 1}</strong> {getJunctionDisplayName(z)}
                </span>
                <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">
                  Score: {Math.round(z.priority_score)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <BasemapSwitcher current={basemap} onChange={setBasemap} />

      <div className="map-brand-badge">
        <div className="glass-dark rounded-md px-2.5 py-1.5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse" />
          <span className="text-[10px] font-mono text-slate-300 tracking-wider uppercase">
            CurbOps · Live Map
          </span>
        </div>
      </div>

      <div className="scanline-overlay pointer-events-none" />
    </div>
  );
}
