'use client';

// ---------------------------------------------------------------------------
// CurbOps — MapView
// Full-bleed map with geographic <Circle> markers colored by action_tier.
// Basemap strategy: CartoDB Dark Matter with fallback to Light and Satellite.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { MapContainer, TileLayer, Circle, Tooltip, useMap, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { getJunctionDisplayName, parseWindow } from '@/lib/dashboard/tiers';
import { type PlaceResult } from './MapSearch';
import {
  TIER_COLORS,
  TIER_FILL_OPACITY,
  TIER_STROKE,
  HALO_RADIUS_MULTIPLIER,
} from '@/lib/tierColors';
import type { ActionTier, Zone } from '@/lib/dashboard/types';

const BENGALURU_CENTER: [number, number] = [12.9716, 77.5946];
const BENGALURU_ZOOM = 12;

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

const STATION_COORDINATES: Record<string, [number, number]> = {
  'UPPARPET': [12.9774, 77.5768],
  'HAL OLD AIRPORT': [12.9602, 77.6439],
  'YELAHANKA': [13.1006, 77.5963],
  'WHITEFIELD': [12.9698, 77.7499],
};

function getStationCoordinate(stationName: string, fallbackCentroid: [number, number]): [number, number] {
  const key = stationName.toUpperCase().replace(/\s+PS$/i, '').trim();
  return STATION_COORDINATES[key] || [fallbackCentroid[0] + 0.003, fallbackCentroid[1] - 0.003];
}

const PLACE_PIN_ICON = typeof window !== 'undefined' ? L.divIcon({
  className: 'curbops-place-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <path d="M15 1.5 C8.6 1.5 3.5 6.4 3.5 12.5 C3.5 19.5 15 28.5 15 28.5 C15 28.5 26.5 19.5 26.5 12.5 C26.5 6.4 21.4 1.5 15 1.5 Z"
      fill="#22d3ee" fill-opacity="0.25" stroke="#22d3ee" stroke-width="1.6"/>
    <circle cx="15" cy="12.5" r="4" fill="#22d3ee"/>
  </svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25],
}) : (null as unknown as L.DivIcon);

const createRouteStopIcon = (index: number) => {
  if (typeof window === 'undefined') return null as unknown as L.DivIcon;
  return L.divIcon({
    className: 'route-stop-pin',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#dc2626;border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(220,38,38,0.5)">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
};

const createStationStartIcon = () => {
  if (typeof window === 'undefined') return null as unknown as L.DivIcon;
  return L.divIcon({
    className: 'station-start-pin',
    html: `<div style="width:32px;height:32px;border-radius:6px;background:#3b82f6;border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:10px;font-weight:700;box-shadow:0 2px 8px rgba(59,130,246,0.5);padding:2px;text-align:center;line-height:1">HQ</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14],
  });
};

// Fly-to controller for selected zones
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

// Search-result fly-to controller
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

// Fit map bounds to all stations when stationFilter === 'ALL'
function MapResetController({
  stationFilter,
  allZones,
}: {
  stationFilter: string;
  allZones: Zone[];
}) {
  const map = useMap();
  const prevFilterRef = useRef(stationFilter);

  useEffect(() => {
    if (stationFilter === 'ALL' && prevFilterRef.current !== 'ALL') {
      if (allZones.length > 0) {
        const points = allZones.map((z) => [z.centroid_lat, z.centroid_lon] as [number, number]);
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, {
          padding: [80, 80],
          animate: true,
          duration: 0.9,
        });
      }
    }
    prevFilterRef.current = stationFilter;
  }, [stationFilter, allZones, map]);

  return null;
}

// Recenter, Reset + Zoom custom controls (styled dark glass, small radius, blue border, hover glow)
function MapControls({ onReset }: { onReset: () => void }) {
  const map = useMap();
  return (
    <div className="absolute bottom-8 right-5 z-[500] flex flex-col gap-2">
      <button
        onClick={() => map.zoomIn()}
        className="w-9 h-9 rounded bg-[#071022]/92 border border-[rgba(80,140,255,0.18)] text-[#DDE8FF] hover:text-[#22d3ee] hover:border-[#508cff]/40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_0_8px_rgba(80,140,255,0.25)] flex items-center justify-center transition cursor-pointer font-bold text-lg"
        title="Zoom In"
      >
        +
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-9 h-9 rounded bg-[#071022]/92 border border-[rgba(80,140,255,0.18)] text-[#DDE8FF] hover:text-[#22d3ee] hover:border-[#508cff]/40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_0_8px_rgba(80,140,255,0.25)] flex items-center justify-center transition cursor-pointer font-bold text-lg"
        title="Zoom Out"
      >
        −
      </button>
      <button
        onClick={() =>
          map.flyTo(BENGALURU_CENTER as LatLngExpression, BENGALURU_ZOOM, {
            duration: 0.7,
          })
        }
        className="w-9 h-9 rounded bg-[#071022]/92 border border-[rgba(80,140,255,0.18)] text-[#DDE8FF] hover:text-[#22d3ee] hover:border-[#508cff]/40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_0_8px_rgba(80,140,255,0.25)] flex items-center justify-center transition cursor-pointer"
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
        className="w-9 h-9 rounded bg-[#071022]/92 border border-[rgba(80,140,255,0.18)] text-[#DDE8FF] hover:text-[#22d3ee] hover:border-[#508cff]/40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_0_8px_rgba(80,140,255,0.25)] flex items-center justify-center transition cursor-pointer"
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

// Floating basemap switcher (premium glass style override)
function BasemapSwitcher({
  current,
  onChange,
}: {
  current: BasemapKey;
  onChange: (k: BasemapKey) => void;
}) {
  return (
    <div
      className="rounded-xl flex overflow-hidden border border-[rgba(80,140,255,0.18)] h-11 items-center transition-all duration-150"
      style={{
        background: 'rgba(7, 18, 40, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {BASEMAPS.map((bm) => {
        const active = bm.key === current;
        return (
          <button
            key={bm.key}
            onClick={() => onChange(bm.key)}
            className={`px-3.5 h-full text-[10px] font-mono uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
              active
                ? 'bg-white/10 text-white font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title={`Switch basemap to ${bm.label}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
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

interface MapViewProps {
  zones: Zone[];
  allZones: Zone[];
  simulate: boolean;
  onSelect: (z: Zone) => void;
  selectedZone: Zone | null;
  flyToZone: { lat: number; lon: number; radius_m: number } | null;
  setStationFilter: (station: string) => void;
  stationFilter: string;
  showCbmSize: boolean;
  showPatrolRoute: boolean;
  placeResult: PlaceResult | null;
  setPlaceResult: (p: PlaceResult | null) => void;
}

export default function MapView({
  zones,
  allZones,
  simulate,
  onSelect,
  selectedZone,
  flyToZone,
  setStationFilter,
  stationFilter,
  showCbmSize,
  showPatrolRoute,
  placeResult,
  setPlaceResult,
}: MapViewProps) {
  const mapRef = useRef<{ flyTo: (c: LatLngExpression, z: number, opts?: unknown) => void } | null>(null);
  const [basemap, setBasemap] = useState<BasemapKey>('dark');

  // Deployment expanded/collapsed state (persisted)
  const [deploymentExpanded, setDeploymentExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('curbops_deployment_expanded');
      return saved === 'true';
    }
    return false; // Default collapsed
  });

  const toggleDeploymentExpanded = (val: boolean) => {
    setDeploymentExpanded(val);
    localStorage.setItem('curbops_deployment_expanded', String(val));
  };

  // Compute Patrol Deployment Plan Route (TOW priority zones sorted by priority score desc)
  const routeZones = useMemo(() => {
    const towZones = zones.filter((z) => z.action_tier === 'TOW');
    const sorted = [...towZones].sort((a, b) => b.priority_score - a.priority_score);
    return sorted.slice(0, 5);
  }, [zones]);

  const startStationCoordinate = useMemo(() => {
    if (routeZones.length === 0) return null;
    return getStationCoordinate(routeZones[0].police_station, [routeZones[0].centroid_lat, routeZones[0].centroid_lon]);
  }, [routeZones]);

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

  const expectedRouteRecovery = useMemo(() => {
    return routeZones.reduce((s, z) => s + (z.zone_CBM_sum || 0) * 0.4, 0);
  }, [routeZones]);

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={BENGALURU_CENTER as LatLngExpression}
        zoom={BENGALURU_ZOOM}
        minZoom={10}
        maxZoom={18}
        zoomControl={false} // Custom controls positioning active
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

        <FlyToController flyToZone={flyToZone} />
        <PlaceFlyToController place={placeResult} />
        <MapResetController stationFilter={stationFilter} allZones={allZones} />

        {/* Temporary Search Result Pin */}
        {placeResult && (
          <Marker
            position={[placeResult.lat, placeResult.lon] as LatLngExpression}
            icon={PLACE_PIN_ICON}
            eventHandlers={{ add: (e) => e.target.openPopup() }}
          >
            <Popup className="curbops-place-popup">
              <div className="space-y-1 text-[11px] text-[#DDE8FF] font-mono">
                <div className="text-[9px] uppercase tracking-wider text-[#22d3ee] font-bold border-b border-cyan-500/20 pb-0.5">
                  SEARCH MATCH
                </div>
                <div className="font-semibold">{placeResult.label}</div>
                {placeResult.detail && (
                  <div className="text-[10px] text-slate-300">{placeResult.detail}</div>
                )}
                <div className="text-[9px] text-[#22d3ee] uppercase tracking-wider">
                  {placeResult.lat.toFixed(4)}°, {placeResult.lon.toFixed(4)}°
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Main Zone Circles */}
        {zones.map((z) => {
          const tier: ActionTier = z.action_tier || 'MONITOR';
          const palette = TIER_COLORS[tier] || TIER_COLORS.MONITOR;
          const radius = showCbmSize ? Math.max(8, z.radius_m || 20) : 15;
          const isSelected = selectedZone && selectedZone.zone_id === z.zone_id;

          const isInactive = selectedZone !== null && !isSelected;
          const isDeployable = tier === 'TOW' || tier === 'PATROL';

          // Visual Hierarchy logic overrides (Selected: 95%, Tow: 80%, Patrol: 75%, Monitor: 55%, Inactive background: 25%)
          let fillOpacity = isSelected 
            ? 0.95
            : tier === 'TOW' 
              ? 0.8 
              : tier === 'PATROL' 
                ? 0.75 
                : 0.55;

          if (isInactive) {
            fillOpacity = 0.25; // Background clusters 25%
          }

          let strokeOpacity = isSelected 
            ? 0.95 
            : tier === 'TOW' 
              ? 0.8 
              : tier === 'PATROL' 
                ? 0.75 
                : 0.55;

          if (isInactive) {
            strokeOpacity = 0.25; // Background clusters 25%
          }

          return (
            <Fragment key={z.zone_id}>
              {/* Halo glow when simulation is active */}
              {simulate && isDeployable && (
                <Circle
                  center={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
                  radius={radius * HALO_RADIUS_MULTIPLIER}
                  pathOptions={{
                    color: palette.fill,
                    weight: 0,
                    opacity: 0,
                    fillColor: palette.fill,
                    fillOpacity: isInactive ? TIER_FILL_OPACITY.halo * 0.25 : TIER_FILL_OPACITY.halo,
                    interactive: false,
                  }}
                />
              )}

              {/* Main Zone Circle */}
              <Circle
                center={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
                radius={radius}
                pathOptions={basemap === 'satellite' ? {
                  color: '#ffffff',
                  weight: isSelected ? 2 : 1,
                  opacity: isSelected ? 0.95 : (isInactive ? 0.25 : 0.8),
                  fillColor: palette.fill,
                  fillOpacity: isSelected ? 0.95 : (simulate ? (isDeployable ? 0.85 : 0.15) : (isInactive ? 0.15 : fillOpacity)),
                } : basemap === 'light' ? {
                  color: palette.stroke,
                  weight: isSelected ? 2 : 1,
                  opacity: isSelected ? 0.95 : (isInactive ? 0.15 : strokeOpacity),
                  fillColor: palette.fill,
                  fillOpacity: isSelected ? 0.95 : (simulate ? (isDeployable ? 0.85 : 0.15) : (isInactive ? 0.15 : fillOpacity)),
                } : {
                  color: palette.stroke,
                  weight: isSelected ? TIER_STROKE.weightSelected : TIER_STROKE.weight,
                  opacity: isSelected ? TIER_STROKE.opacitySelected : strokeOpacity,
                  fillColor: palette.fill,
                  fillOpacity,
                }}
                eventHandlers={{ click: () => onSelect(z) }}
              >
                <Tooltip
                  direction="top"
                  className="curbops-tooltip font-mono"
                  opacity={1}
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[12px] text-white">
                      {getJunctionDisplayName(z)}
                    </div>
                    <div className="text-[10px] text-slate-300">
                      CBM: {Math.round(z.zone_CBM_sum).toLocaleString('en-IN')} ·{' '}
                      {(z.peak_hour_ratio * 100).toFixed(1)}% peak
                    </div>
                    <div className="text-[10px] text-[#22d3ee]">
                      Window: {z.recommended_window}
                    </div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider">
                      {tier} · {z.police_station}
                    </div>
                  </div>
                </Tooltip>
              </Circle>
            </Fragment>
          );
        })}

        {/* Suggested Route Polyline */}
        {showPatrolRoute && stationFilter !== 'ALL' && routeZones.length >= 2 && startStationCoordinate && (
          <Polyline
            positions={[
              startStationCoordinate,
              ...routeZones.map((z) => [z.centroid_lat, z.centroid_lon] as [number, number])
            ]}
            pathOptions={{
              color: '#dc2626',
              weight: 3.5,
              opacity: selectedZone ? 0.3 : 1.0, // Selected route 100%
              dashArray: '8, 8',
              className: 'animated-patrol-route',
            }}
          />
        )}

        {/* Station Start HQ Indicator */}
        {showPatrolRoute && stationFilter !== 'ALL' && routeZones.length > 0 && startStationCoordinate && (
          <Marker
            position={startStationCoordinate as LatLngExpression}
            icon={createStationStartIcon() as L.DivIcon}
          >
            <Popup className="curbops-place-popup">
              <div className="space-y-1.5 text-[11px] text-[#DDE8FF] font-mono">
                <div className="text-[9px] uppercase tracking-wider text-[#3b82f6] font-bold border-b border-blue-500/20 pb-0.5">
                  ROUTE HQ
                </div>
                <div>
                  <span className="text-[#6E7F9E]">Station:</span> BTP{String(routeZones[0].zone_id).padStart(3, '0')}
                </div>
                <div>
                  <span className="text-[#6E7F9E]">Coverage:</span> {routeZones.length} Zones
                </div>
                <div>
                  <span className="text-[#6E7F9E]">Recovery:</span> {Math.round(expectedRouteRecovery).toLocaleString('en-IN')} CBM
                </div>
                <div>
                  <span className="text-[#6E7F9E]">Status:</span> <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Suggested Enforcement Route Stop Markers */}
        {showPatrolRoute && stationFilter !== 'ALL' && routeZones.map((z, idx) => {
          const icon = createRouteStopIcon(idx);
          if (!icon) return null;
          return (
            <Marker
              key={`route-stop-${z.zone_id}`}
              position={[z.centroid_lat, z.centroid_lon] as LatLngExpression}
              icon={icon}
            >
              <Popup className="curbops-place-popup">
                <div className="space-y-1 text-[11px] text-[#DDE8FF]">
                  <div className="text-[9px] uppercase tracking-wider text-red-400 font-bold border-b border-red-500/20 pb-0.5">
                    STOP #{idx + 1}
                  </div>
                  <div className="font-semibold">{getJunctionDisplayName(z)}</div>
                  <div>
                    <span className="text-[#6E7F9E]">Priority:</span> {Math.round(z.priority_score)}
                  </div>
                  <div>
                    <span className="text-[#6E7F9E]">Window:</span> {z.recommended_window}
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

      {/* Grid container aligning left floater (Patrol Deployment) and right floater (MapStyle) */}
      <div className="absolute top-3 left-3 right-3 z-[600] flex justify-between items-start pointer-events-none">
        
        {/* Left floater: Collapsible Patrol Deployment Plan */}
        <div className="pointer-events-auto flex-shrink-0">
          {routeZones.length > 0 && (
            <>
              {/* Collapsed view */}
              {!deploymentExpanded && (
                <button
                  onClick={() => toggleDeploymentExpanded(true)}
                  className="w-[220px] h-[48px] glass-dark rounded-lg px-3 py-2 text-slate-200 border border-red-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-200 hover:border-red-500/40 text-left font-mono flex flex-col justify-between cursor-pointer"
                >
                  <div className="text-[11px] tracking-wider uppercase font-bold text-red-400 flex items-center gap-1.5 leading-none">
                    <span>🚓</span> Patrol Deployment
                  </div>
                  <div className="text-[9px] text-slate-400 leading-none flex justify-between">
                    <span>Shift: {shift}</span>
                    <span>{routeZones.length} Zones</span>
                  </div>
                </button>
              )}

              {/* Expanded view */}
              {deploymentExpanded && (
                <div
                  className="w-[320px] glass-dark rounded-lg p-3 text-slate-200 border border-red-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-slideIn transition-all duration-300 font-mono"
                >
                  <div className="flex items-center justify-between mb-2 border-b border-red-500/20 pb-1.5">
                    <span className="text-[11px] tracking-wider uppercase font-semibold text-red-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      Patrol Deployment Plan
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 uppercase tracking-widest border border-red-500/20 font-semibold">
                        TOW OPS
                      </span>
                      <button
                        onClick={() => toggleDeploymentExpanded(false)}
                        className="text-slate-400 hover:text-slate-200 transition text-[10px] px-1 cursor-pointer"
                        title="Collapse Panel"
                      >
                        ◀
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs mb-2">
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
                      <div className="font-semibold text-emerald-300 mt-0.5">{Math.round(expectedRouteRecovery).toLocaleString('en-IN')} CBM</div>
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
                        className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-[10px] text-left transition cursor-pointer"
                      >
                        <span className="truncate pr-2 text-slate-300">
                          <strong className="text-red-400 pr-1">#{idx + 1}</strong> {getJunctionDisplayName(z)}
                        </span>
                        <span className="text-[9px] text-slate-500 flex-shrink-0">
                          Score: {Math.round(z.priority_score)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right floater: Basemap Style Switcher (re-styled & floating on map) */}
        <div className="pointer-events-auto flex-shrink-0">
          <BasemapSwitcher current={basemap} onChange={setBasemap} />
        </div>

      </div>

      <div className="map-brand-badge font-mono">
        <div className="glass-dark rounded-md px-2.5 py-1.5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse" />
          <span className="text-[10px] text-slate-300 tracking-wider uppercase">
            CurbOps · Live Map
          </span>
        </div>
      </div>

      <div className="scanline-overlay pointer-events-none" />
    </div>
  );
}
