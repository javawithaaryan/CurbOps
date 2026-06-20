'use client';

// ---------------------------------------------------------------------------
// CurbOps — Sidebar (TypeScript port)
// Dark command-deck panel: brand, city-wide stats, toggles, station filter, nav.
// ---------------------------------------------------------------------------

import { useCountUp } from '@/lib/dashboard/useCountUp';

interface SidebarProps {
  totalCBM: number;
  totalZones: number;
  totalViolations: number;
  recoveredCBM: number;
  simulate: boolean;
  hideLowConfidence: boolean;
  setHideLowConfidence: (v: boolean | ((p: boolean) => boolean)) => void;
  setSimulate: (v: boolean | ((p: boolean) => boolean)) => void;
  stationFilter: string;
  setStationFilter: (v: string) => void;
  stations: string[];
  view: 'map' | 'table';
  setView: (v: 'map' | 'table') => void;
  visibleCount: number;
}

function StatBlock({
  label,
  value,
  sub,
  accent = '#22d3ee',
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="px-4 py-3 border-b border-[#1f2a44]/60 last:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">
        {label}
      </div>
      <div
        className="tabular text-[22px] font-semibold mt-1 leading-tight truncate"
        style={{ color: accent }}
        title={String(value)}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-slate-500 mt-1 font-mono truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#1f2a44]/40 transition group text-left"
    >
      <div className="min-w-0 pr-3">
        <div className="text-[12px] font-medium text-slate-200 group-hover:text-white">
          {label}
        </div>
        {hint && (
          <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
            {hint}
          </div>
        )}
      </div>
      <span className={`toggle-switch ${on ? 'on' : ''}`} aria-checked={on} />
    </button>
  );
}

function NavTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition relative ${
        active
          ? 'nav-tab-active text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2a44]/30'
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] font-mono text-slate-500">{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({
  totalCBM,
  totalZones,
  totalViolations,
  recoveredCBM,
  simulate,
  hideLowConfidence,
  setHideLowConfidence,
  setSimulate,
  stationFilter,
  setStationFilter,
  stations,
  view,
  setView,
  visibleCount,
}: SidebarProps) {
  const cbmShown = useCountUp(simulate ? recoveredCBM : totalCBM, {
    duration: simulate ? 1100 : 800,
  });
  const violShown = useCountUp(totalViolations, { duration: 800 });
  const zoneShown = useCountUp(totalZones, { duration: 600 });

  const fmtCBM = (n: number) =>
    Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <aside className="w-[300px] flex-shrink-0 h-full bg-[#0f172a] flex flex-col text-slate-200 relative">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1f2a44]/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <defs>
                <linearGradient id="brandg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <rect width="36" height="36" rx="9" fill="#0b1220" />
              <rect width="35" height="35" x="0.5" y="0.5" rx="8.5" stroke="url(#brandg)" strokeOpacity="0.4" />
              <circle cx="18" cy="18" r="10" stroke="url(#brandg)" strokeWidth="2" fill="none" />
              <circle cx="18" cy="18" r="3.5" fill="url(#brandg)" />
              <path d="M8 26 L26 8" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0f172a] animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] leading-tight text-white tracking-tight">
              CurbOps
            </div>
            <div className="text-[10px] text-slate-500 font-mono tracking-[0.18em] uppercase mt-0.5">
              BTP Command Centre
            </div>
          </div>
        </div>
      </div>

      {/* Live status strip */}
      <div className="px-5 py-2 flex items-center justify-between text-[10px] font-mono text-slate-500 border-b border-[#1f2a44]/60">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE FEED
        </span>
        <span>v2.0 · GRIDLOCK 2.0</span>
      </div>

      {/* City-wide stats */}
      <div className="border-b border-[#1f2a44]/60">
        <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
          City-Wide Telemetry
        </div>
        <StatBlock
          label={simulate ? 'Congestion Minutes Recovered' : 'Total CBM (min)'}
          value={fmtCBM(cbmShown)}
          sub={simulate ? 'TOW+PATROL · 60% capacity gain' : 'Congestion Burden Minutes'}
          accent={simulate ? '#34d399' : '#22d3ee'}
        />
        <div className="grid grid-cols-2 border-b border-[#1f2a44]/60">
          <StatBlock
            label="Zones"
            value={Number(zoneShown).toLocaleString('en-IN')}
            accent="#94a3b8"
          />
          <StatBlock
            label="Violations"
            value={Number(violShown).toLocaleString('en-IN')}
            accent="#f97316"
          />
        </div>
        <div className="px-4 py-2 text-[10px] text-slate-500 font-mono flex justify-between gap-2">
          <span className="truncate">Now visible:</span>
          <span className="text-[#22d3ee] whitespace-nowrap">{visibleCount} zones</span>
        </div>
      </div>

      {/* Toggles */}
      <div className="px-2 py-2 border-b border-[#1f2a44]/60">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
          Controls
        </div>
        <ToggleRow
          label="Hide low-confidence zones"
          hint="Filter out low-signal predictions"
          on={hideLowConfidence}
          onClick={() => setHideLowConfidence((v) => !v)}
        />
        <ToggleRow
          label="Simulate Optimized Enforcement"
          hint="TOW + PATROL deployment · 60% recovery"
          on={simulate}
          onClick={() => setSimulate((v) => !v)}
        />
        {simulate && (
          <div className="mx-2 mt-1 mb-1 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono animate-fadeIn">
            ▶ Simulation active — TOW + PATROL zones highlighted, MONITOR faded.
          </div>
        )}
      </div>

      {/* Station filter */}
      <div className="px-4 py-3 border-b border-[#1f2a44]/60">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold mb-1.5">
          Police Station
        </label>
        <div className="relative">
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="w-full appearance-none bg-[#0b1220] border border-[#1f2a44] text-slate-200 text-[12px] rounded-md px-3 py-2 pr-8 focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/40 font-mono"
          >
            <option value="ALL">ALL STATIONS ({stations.length})</option>
            {stations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M3 4.5 L6 7.5 L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="px-2 py-2 flex-1 overflow-y-auto scroll-thin">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
          Navigation
        </div>
        <NavTab
          active={view === 'map'}
          onClick={() => setView('map')}
          icon={
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M2 4 L6 2.5 L10 4 L14 2.5 V12 L10 13.5 L6 12 L2 13.5 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M6 2.5 V12 M10 4 V13.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
          label="Map View"
          badge={visibleCount}
        />
        <NavTab
          active={view === 'table'}
          onClick={() => setView('table')}
          icon={
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 6.5 H14 M2 9.5 H14 M6 3 V13" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
          label="Priority Table"
          badge={visibleCount}
        />
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#1f2a44]/60 text-[9px] text-slate-600 font-mono leading-relaxed">
        <div className="flex justify-between">
          <span>BENGALURU · 12.97°N 77.59°E</span>
        </div>
        <div className="flex justify-between mt-0.5">
          <span>{totalZones.toLocaleString('en-IN')} zones indexed</span>
          <span className="text-emerald-500/70">SYS · OK</span>
        </div>
      </div>
    </aside>
  );
}
