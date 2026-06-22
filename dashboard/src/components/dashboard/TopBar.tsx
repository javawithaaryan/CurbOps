'use client';

// ---------------------------------------------------------------------------
// CurbOps - TopBar
// Slim status strip and GIS control panel above the map / table.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type { Zone } from '@/lib/dashboard/types';
import { getJunctionDisplayName } from '@/lib/dashboard/tiers';
import MapSearch, { type PlaceResult } from './MapSearch';

function LiveClock() {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 flex-shrink-0">
      <span className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-emerald-600 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        LIVE
      </span>
      <span className="text-slate-600 font-semibold">
        {hh}:{mm}:{ss}
      </span>
      <span className="text-slate-400">IST</span>
    </div>
  );
}

interface TopBarProps {
  simulate: boolean;
  visibleCount: number;
  totalCount: number;
  view: 'map' | 'table' | 'trends';
  stationFilter: string;
  setStationFilter: (station: string) => void;
  zones: Zone[];
  onSelectZone: (z: Zone) => void;
  showCbmSize: boolean;
  setShowCbmSize: (val: boolean) => void;
  showPatrolRoute: boolean;
  setShowPatrolRoute: (val: boolean) => void;
  setPlaceResult: (p: PlaceResult | null) => void;
  placeResult: PlaceResult | null;
}

export default function TopBar({
  simulate,
  visibleCount,
  totalCount,
  view,
  stationFilter,
  setStationFilter,
  zones,
  onSelectZone,
  showCbmSize,
  setShowCbmSize,
  showPatrolRoute,
  setShowPatrolRoute,
  setPlaceResult,
  placeResult,
}: TopBarProps) {
  const title = view === 'map' ? 'Map View' : view === 'trends' ? 'City Trends' : 'Priority Table';

  return (
    <header className="h-11 bg-white border-b border-slate-200 flex justify-between items-center px-5 flex-shrink-0 z-20 font-mono w-full">
      {/* Breadcrumbs (Left) */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium flex-shrink-0">
        <span className="text-slate-700 font-bold">{title}</span>
        <span className="text-slate-300">/</span>
        <span>
          {stationFilter === 'ALL' ? 'All Stations' : stationFilter}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-600 font-semibold whitespace-nowrap">
          {visibleCount} Zones
        </span>
      </div>

      {/* Center Inline GIS Controls & Legend Toolbar */}
      {view === 'map' ? (
        <div className="flex items-center justify-center gap-4 flex-1 px-4 max-w-4xl">
          {/* Priority Color Code Legend */}
          <div className="flex items-center gap-3 text-[10px] uppercase font-bold text-slate-500 flex-shrink-0">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" style={{ boxShadow: '0 0 4px #dc2626' }} />
              <span>TOW</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" style={{ boxShadow: '0 0 4px #f97316' }} />
              <span>PATROL</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" style={{ boxShadow: '0 0 4px #eab308' }} />
              <span>MONITOR</span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

          {/* Display Controls */}
          <div className="flex items-center gap-3 text-[10px] uppercase font-bold text-slate-500 flex-shrink-0">
            {/* CBM Size Checkbox */}
            <button
              onClick={() => setShowCbmSize(!showCbmSize)}
              className="flex items-center gap-1.5 transition text-slate-600 hover:text-slate-950 cursor-pointer"
            >
              <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 ${
                showCbmSize ? 'bg-blue-500 border-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.6)]' : 'border-slate-400 bg-white'
              }`} />
              <span>SIZE = CBM</span>
            </button>

            {/* Patrol Route Checkbox */}
            <button
              onClick={() => setShowPatrolRoute(!showPatrolRoute)}
              className="flex items-center gap-1.5 transition text-slate-600 hover:text-slate-950 cursor-pointer"
            >
              <span className={`font-bold tracking-widest text-[9px] flex-shrink-0 ${
                showPatrolRoute ? 'text-red-500 font-extrabold' : 'text-slate-300'
              }`}>
                ---
              </span>
              <span>PATROL ROUTE</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

          {/* Search Console Inside White Header */}
          <div className="flex-shrink-0 z-[1000]">
            <MapSearch
              theme="header"
              zones={zones}
              stationFilter={stationFilter}
              placeResult={placeResult}
              onSelect={(p) => {
                setPlaceResult(p);
                setStationFilter('ALL');
                onSelectZone(p.zone);
              }}
              onSelectStation={(station) => {
                setStationFilter(station);
                const match = zones
                  .filter((z) => z.police_station === station)
                  .sort((a, b) => b.priority_score - a.priority_score)[0];
                if (match) {
                  setPlaceResult({
                    placeId: match.zone_id,
                    lat: match.centroid_lat,
                    lon: match.centroid_lon,
                    label: getJunctionDisplayName(match),
                    detail: `BTP${String(match.zone_id).padStart(3, '0')} · ${match.police_station} PS`,
                    zone: match,
                  });
                  onSelectZone(match);
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Clock + Live (Right) */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {simulate && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-bold uppercase tracking-wider leading-none">
            Sim Mode
          </span>
        )}
        <LiveClock />
      </div>
    </header>
  );
}
