'use client';

// ---------------------------------------------------------------------------
// CausaFlow AI — TopBar (TypeScript port)
// Slim status strip above the map / table.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { TIER_COLOR_FLAT } from '@/lib/tierColors';
import type { ActionTier } from '@/lib/dashboard/types';

const TIER_LABELS: Record<ActionTier, string> = {
  TOW: 'TOW · IMMEDIATE DISPATCH',
  PATROL: 'PATROL · SUSTAINED PRESENCE',
  MONITOR: 'MONITOR · WATCH & REVIEW',
};

function TierLegend() {
  const tiers: { key: ActionTier; label: string; color: string }[] = [
    { key: 'TOW', label: TIER_LABELS.TOW, color: TIER_COLOR_FLAT.TOW },
    { key: 'PATROL', label: TIER_LABELS.PATROL, color: TIER_COLOR_FLAT.PATROL },
    { key: 'MONITOR', label: TIER_LABELS.MONITOR, color: TIER_COLOR_FLAT.MONITOR },
  ];
  return (
    <div className="flex items-center gap-3">
      {tiers.map((t) => (
        <div key={t.key} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: t.color, boxShadow: `0 0 6px ${t.color}80` }}
          />
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}

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
    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <span>
        {hh}:{mm}
        <span className="text-slate-400">:{ss}</span>
      </span>
      <span className="text-slate-400">IST</span>
    </div>
  );
}

export default function TopBar({
  simulate,
  visibleCount,
  totalCount,
  view,
  stationFilter,
}: {
  simulate: boolean;
  visibleCount: number;
  totalCount: number;
  view: 'map' | 'table' | 'trends';
  stationFilter: string;
}) {
  const title = view === 'map' ? 'Map View' : view === 'trends' ? 'City Trends' : 'Priority Table';
  return (
    <header className="h-11 bg-white border-b border-slate-200 flex items-center justify-between px-5 flex-shrink-0 z-20">
      <div className="flex items-center gap-3 text-[12px]">
        <span className="font-semibold text-slate-800">{title}</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 font-mono">
          {stationFilter === 'ALL' ? 'All stations' : stationFilter}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 font-mono">
          {visibleCount} / {totalCount} zones
        </span>
        {simulate && (
          <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sim Mode
          </span>
        )}
      </div>
      <div className="flex items-center gap-6">
        <TierLegend />
        <div className="h-4 w-px bg-slate-200" />
        <LiveClock />
      </div>
    </header>
  );
}
