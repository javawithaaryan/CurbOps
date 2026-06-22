'use client';

// ---------------------------------------------------------------------------
// CurbOps — BTP Command Centre
// Main dashboard page.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { type PlaceResult } from '@/components/dashboard/MapSearch';

import Sidebar from '@/components/dashboard/Sidebar';
import TopBar from '@/components/dashboard/TopBar';
import DrillDownPanel from '@/components/dashboard/DrillDownPanel';
import PriorityTable from '@/components/dashboard/PriorityTable';
import CityTrendsPanel from '@/components/dashboard/CityTrendsPanel';

import { DEPLOYABLE_TIERS, getZoneConfidence } from '@/lib/dashboard/tiers';

import type {
  AnalyticsPayload,
  CityStats,
  Zone,
} from '@/lib/dashboard/types';

// Leaflet must only render on the client.
const MapView = dynamic(() => import('@/components/dashboard/MapView'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b1220]">
      <div className="text-slate-400 font-mono text-xs">Loading map…</div>
    </div>
  ),
});

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'map' | 'table' | 'trends'>('map');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [hideLowConfidence, setHideLowConfidence] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [stationFilter, setStationFilter] = useState('ALL');
  const [flyToZone, setFlyToZone] = useState<{ lat: number; lon: number; radius_m: number } | null>(null);
  const [showCbmSize, setShowCbmSize] = useState(true);
  const [showPatrolRoute, setShowPatrolRoute] = useState(true);
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [zRes, sRes, aRes] = await Promise.all([
          fetch('/api/zones'),
          fetch('/api/stats'),
          fetch('/api/analytics'),
        ]);
        if (!zRes.ok || !sRes.ok) throw new Error('API request failed');
        const [z, s, a] = await Promise.all([
          zRes.json() as Promise<Zone[]>,
          sRes.json() as Promise<CityStats>,
          aRes.json() as Promise<AnalyticsPayload>,
        ]);
        if (cancelled) return;
        setZones(z);
        setStats(s);
        setAnalytics(a);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load zones');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Zones now carry their `action_tier` directly from the dataset, so no
  // client-side tier computation is needed. We just memoize for stability.
  const annotatedZones = useMemo(() => zones, [zones]);

  const filteredZones = useMemo(() => {
    let out = annotatedZones;
    if (hideLowConfidence) out = out.filter((z) => getZoneConfidence(z) >= 70);
    if (stationFilter !== 'ALL') out = out.filter((z) => z.police_station === stationFilter);
    return out;
  }, [annotatedZones, hideLowConfidence, stationFilter]);

  // Deployable zones = TOW + PATROL (the ones that get active enforcement
  // capacity in the Simulate-Optimized-Enforcement scenario). Used to compute
  // the recovered-CBM counter.
  const deployableZones = useMemo(
    () => filteredZones.filter((z) => DEPLOYABLE_TIERS.includes(z.action_tier)),
    [filteredZones]
  );

  // In Simulate mode we keep ALL filtered zones on the map (MONITOR zones fade
  // via reduced fillOpacity inside MapView, while TOW/PATROL get halos). This
  // matches the spec: MONITOR zones are still visible but pushed into the
  // background, instead of being removed entirely.
  const visibleZones = simulate ? filteredZones : filteredZones;

  const totalCBM = useMemo(() => filteredZones.reduce((s, z) => s + (z.zone_CBM_sum || 0), 0), [filteredZones]);
  const deployableCBM = useMemo(
    () => deployableZones.reduce((s, z) => s + (z.zone_CBM_sum || 0), 0),
    [deployableZones]
  );
  const recoveredCBM = deployableCBM * 0.4;

  // -------------------------------------------------------------------
  // When the police-station filter changes, fly the map to the
  // highest-CBM zone in that station's jurisdiction so the user
  // immediately sees the relevant area.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (stationFilter === 'ALL') {
      setSelectedZone(null);
      setFlyToZone(null);
      setPlaceResult(null);
      return;
    }
    // Find the highest-CBM zone for this station (the source data is sorted
    // by CBM desc in the source dataset, so the first match is the worst).
    const target = filteredZones.find((z) => z.police_station === stationFilter);
    if (!target) return;
    setFlyToZone({
      lat: target.centroid_lat,
      lon: target.centroid_lon,
      radius_m: target.radius_m,
    });
  }, [stationFilter, filteredZones]);

  useEffect(() => {
    if (!selectedZone) return;
    if (!filteredZones.some((z) => z.zone_id === selectedZone.zone_id)) {
      setSelectedZone(null);
    }
  }, [filteredZones, selectedZone]);

  const handleSelectFromTable = (zone: Zone) => {
    setSelectedZone(zone);
    setView('map');
    setFlyToZone({ lat: zone.centroid_lat, lon: zone.centroid_lon, radius_m: zone.radius_m });
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-mono text-sm">Loading CurbOps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center max-w-md">
          <div className="text-[#dc2626] text-4xl mb-3">⚠</div>
          <p className="text-slate-800 font-semibold mb-1">API unreachable</p>
          <p className="text-slate-500 text-sm font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-[#f8fafc] overflow-hidden">
      <Sidebar
        totalCBM={totalCBM}
        totalZones={filteredZones.length}
        totalViolations={filteredZones.reduce((s, z) => s + (z.violation_count || 0), 0)}
        recoveredCBM={recoveredCBM}
        simulate={simulate}
        hideLowConfidence={hideLowConfidence}
        setHideLowConfidence={setHideLowConfidence}
        setSimulate={setSimulate}
        stationFilter={stationFilter}
        setStationFilter={setStationFilter}
        stations={stats?.police_stations ?? []}
        view={view}
        setView={setView}
        visibleCount={visibleZones.length}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <TopBar
          simulate={simulate}
          visibleCount={visibleZones.length}
          totalCount={zones.length}
          view={view}
          stationFilter={stationFilter}
          setStationFilter={setStationFilter}
          zones={zones}
          onSelectZone={setSelectedZone}
          showCbmSize={showCbmSize}
          setShowCbmSize={setShowCbmSize}
          showPatrolRoute={showPatrolRoute}
          setShowPatrolRoute={setShowPatrolRoute}
          setPlaceResult={setPlaceResult}
          placeResult={placeResult}
        />

        <div className="flex-1 relative min-h-0">
          {view === 'map' ? (
            <>
              <MapView
                zones={visibleZones}
                allZones={zones}
                simulate={simulate}
                onSelect={setSelectedZone}
                selectedZone={selectedZone}
                flyToZone={flyToZone}
                setStationFilter={setStationFilter}
                stationFilter={stationFilter}
                showCbmSize={showCbmSize}
                showPatrolRoute={showPatrolRoute}
                placeResult={placeResult}
                setPlaceResult={setPlaceResult}
              />
              {selectedZone && (
                <DrillDownPanel zone={selectedZone} onClose={() => setSelectedZone(null)} simulate={simulate} />
              )}
            </>
          ) : view === 'trends' ? (
            <CityTrendsPanel daily={analytics?.daily ?? []} />
          ) : (
            <PriorityTable zones={filteredZones} onRowClick={handleSelectFromTable} stationFilter={stationFilter} />
          )}
        </div>
      </main>
    </div>
  );
}