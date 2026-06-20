'use client';

// ---------------------------------------------------------------------------
// CausaFlow AI — PriorityTable (TypeScript port)
// Sortable, tier-coloured table. Click a row → fly to map + open drill-down.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { TIER_COLOR_FLAT } from '@/lib/tierColors';
import { getJunctionDisplayName } from '@/lib/dashboard/tiers';
import type { Zone, ActionTier } from '@/lib/dashboard/types';

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
  mono?: boolean;
  sortable?: boolean;
  width?: string;
}

const COLUMNS: Column[] = [
  { key: 'zone_id', label: 'Zone', align: 'left', mono: true, width: '60px' },
  { key: 'dominant_junction', label: 'Junction', align: 'left' },
  { key: 'police_station', label: 'Station', align: 'left' },
  { key: 'priority_score', label: 'Priority', align: 'right', mono: true, sortable: true },
  { key: 'zone_CBM_sum', label: 'CBM', align: 'right', mono: true, sortable: true },
  { key: 'peak_hour_ratio', label: 'Peak %', align: 'right', mono: true, sortable: true },
  { key: 'recurrence_days', label: 'Recurrence', align: 'right', mono: true, sortable: true },
  { key: 'recommended_window', label: 'Window', align: 'center', mono: true },
  { key: 'action_tier', label: 'Action', align: 'center', sortable: true },
];

function TierPill({ tier }: { tier: ActionTier }) {
  const color = TIER_COLOR_FLAT[tier] || TIER_COLOR_FLAT.MONITOR;
  return (
    <span className="tier-chip text-white" style={{ background: color, boxShadow: `0 0 0 1px ${color}30` }}>
      {tier}
    </span>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="opacity-30 ml-1">↕</span>;
  return <span className={`sort-arrow ml-1 ${dir === 'desc' ? 'desc' : ''}`}>↑</span>;
}

export default function PriorityTable({
  zones,
  onRowClick,
  stationFilter,
}: {
  zones: Zone[];
  onRowClick: (z: Zone) => void;
  stationFilter: string;
}) {
  const [sortKey, setSortKey] = useState<string>('priority_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState<string>('');

  const sorted = useMemo(() => {
    let arr = [...zones];
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (z) =>
          (z.dominant_junction || '').toLowerCase().includes(q) ||
          (z.police_station || '').toLowerCase().includes(q) ||
          String(z.zone_id).includes(q)
      );
    }
    arr.sort((a, b) => {
      let av: unknown = (a as Record<string, unknown>)[sortKey];
      let bv: unknown = (b as Record<string, unknown>)[sortKey];
      if (sortKey === 'action_tier') {
        const order: Record<ActionTier, number> = { TOW: 3, PATROL: 2, MONITOR: 1 };
        av = order[(av as ActionTier) ?? 'MONITOR'] ?? 0;
        bv = order[(bv as ActionTier) ?? 'MONITOR'] ?? 0;
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if ((av as number) < (bv as number)) return sortDir === 'asc' ? -1 : 1;
      if ((av as number) > (bv as number)) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [zones, sortKey, sortDir, query]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="absolute inset-0 bg-[#f8fafc] flex flex-col">
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Priority Zone Register</h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            {sorted.length} zones · sorted by {sortKey.replace('_', ' ')} ({sortDir}) ·{' '}
            {stationFilter === 'ALL' ? 'all stations' : stationFilter}
          </p>
        </div>
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search junction, station, or zone id…"
            className="w-full pl-9 pr-3 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#3b82f6] focus:bg-white focus:ring-2 focus:ring-[#3b82f6]/10 font-mono"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-200">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width, textAlign: col.align }}
                  className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-600 ${
                    col.sortable ? 'cursor-pointer hover:text-[#3b82f6] select-none' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    {col.sortable && <SortArrow active={sortKey === col.key} dir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((z) => {
              const rowTier = z.action_tier || 'MONITOR';
              return (
                <tr
                  key={z.zone_id}
                  className={`row-${rowTier === 'TOW' ? 'critical' : rowTier === 'PATROL' ? 'high' : 'watch'} border-b border-slate-100 cursor-pointer transition`}
                  onClick={() => onRowClick(z)}
                >
                  <td className="px-3 py-2.5 font-mono text-slate-700">#{z.zone_id}</td>
                  <td className="px-3 py-2.5 text-slate-900 max-w-[260px] truncate" title={getJunctionDisplayName(z)}>
                    {getJunctionDisplayName(z)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{z.police_station}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-800 font-semibold">
                    {Math.round(z.priority_score).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                    {Math.round(z.zone_CBM_sum).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                    {(z.peak_hour_ratio * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{z.recurrence_days}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-[#3b82f6]">{z.recommended_window}</td>
                  <td className="px-3 py-2.5 text-center">
                    <TierPill tier={rowTier} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-12 text-slate-400">
                  No zones match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
