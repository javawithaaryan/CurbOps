'use client';

// ---------------------------------------------------------------------------
// CurbOps — DrillDownPanel (TypeScript port)
// Floating glass-morphism card opened when a zone is clicked.
// ---------------------------------------------------------------------------

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from 'recharts';
import {
  cleanViolationLabel,
  explainZone,
  getJunctionDisplayName,
  parseWindow,
} from '@/lib/dashboard/tiers';
import { TIER_COLOR_FLAT } from '@/lib/tierColors';
import type { Zone } from '@/lib/dashboard/types';

const PIE_PALETTE = [
  '#dc2626',
  '#f97316',
  '#eab308',
  '#22d3ee',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#10b981',
];

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 clip-corner-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: accent }} />
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
        {label}
      </div>
      <div className="tabular text-lg font-semibold text-slate-900 mt-0.5 leading-none">
        {value}
      </div>
      {sub && <div className="text-[9px] text-slate-400 mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function MiniHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[#3b82f6]">{icon}</span>
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
          {title}
        </div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

export default function DrillDownPanel({
  zone,
  onClose,
  simulate,
}: {
  zone: Zone;
  onClose: () => void;
  simulate: boolean;
}) {
  if (!zone) return null;

  const tier = zone.action_tier || 'MONITOR';
  const tierColor = TIER_COLOR_FLAT[tier] || TIER_COLOR_FLAT.MONITOR;
  const junctionName = getJunctionDisplayName(zone);

  const rawViolations = zone.top_violation_types || [];
  const aggregatedViolations: Record<string, number> = {};
  for (const v of rawViolations) {
    const cleanName = cleanViolationLabel(v.type);
    aggregatedViolations[cleanName] = (aggregatedViolations[cleanName] || 0) + v.count;
  }

  const violationData = Object.entries(aggregatedViolations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value], i) => ({
      name,
      value,
      color: PIE_PALETTE[i % PIE_PALETTE.length],
    }));

  const vehicleData = (zone.top_vehicle_types || []).slice(0, 6).map((v) => ({
    name: (v.type || 'UNKNOWN').toLowerCase(),
    count: v.count,
  }));

  const win = parseWindow(zone.recommended_window);
  const winLabel = win
    ? `${String(win.start).padStart(2, '0')}:00 – ${String(win.end).padStart(2, '0')}:00`
    : zone.recommended_window || 'N/A';

  return (
    <div
      key={zone.zone_id}
      className="absolute top-4 right-4 bottom-4 w-[420px] z-[1000] bg-white rounded-[14px] border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_24px_60px_rgba(15,23,42,0.25)] flex flex-col overflow-hidden animate-slideIn"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-200/60 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="tier-chip text-white"
              style={{ background: tierColor, boxShadow: `0 0 0 1px ${tierColor}40` }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" style={{ boxShadow: `0 0 4px #fff` }} />
              {tier}
            </span>
            <span className="text-[10px] font-mono text-slate-500">ZONE #{zone.zone_id}</span>
          </div>
          <h2 className="text-[17px] font-semibold text-slate-900 leading-tight tracking-tight truncate" title={junctionName}>
            {junctionName}
          </h2>
          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
            <span className="text-slate-700 font-semibold">{zone.police_station}</span> PS · Priority {Math.round(zone.priority_score).toLocaleString('en-IN')}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-2 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition flex-shrink-0"
          aria-label="Close"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Amber low-confidence warning banner */}
      {zone.low_confidence && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 flex items-start gap-2 animate-fadeIn">
          <svg className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M8 1 L15 14 H1 Z" stroke="currentColor" strokeWidth="1.4" fill="rgba(245,158,11,0.15)" strokeLinejoin="round" />
            <path d="M8 6 V9.5 M8 11.5 V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Low-Confidence Prediction
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5 leading-snug">
              This zone's signal is below the reliability threshold. Cross-verify with on-ground intelligence before dispatching enforcement.
            </div>
          </div>
        </div>
      )}


      {/* Body */}
      <div className="flex-1 overflow-y-auto scroll-thin px-4 py-3 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total CBM" value={Math.round(zone.zone_CBM_sum).toLocaleString('en-IN')} sub="congestion minutes" accent={tierColor} />
          <MetricCard label="Violations" value={zone.violation_count.toLocaleString('en-IN')} sub="recorded events" accent="#f97316" />
          <MetricCard label="Peak Hour %" value={`${(zone.peak_hour_ratio * 100).toFixed(1)}%`} sub="of hourly volume" accent="#3b82f6" />
          <MetricCard label="Recurrence" value={zone.recurrence_days} sub="active days" accent="#a855f7" />
        </div>

        {/* Recommended window callout */}
        <div
          className="relative rounded-lg overflow-hidden clip-corner-sm"
          style={{
            background: `linear-gradient(135deg, ${tierColor}10, ${tierColor}05)`,
            border: `1px solid ${tierColor}40`,
          }}
        >
          <div className="absolute top-0 left-0 w-1 h-full" style={{ background: tierColor }} />
          <div className="px-3 py-2.5 pl-4">
            <div className="text-[9px] uppercase tracking-[0.14em] font-semibold text-slate-500 mb-0.5">
              Recommended Enforcement Window
            </div>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-xl font-semibold" style={{ color: tierColor }}>
                {winLabel}
              </span>
              <span className="text-[10px] text-slate-500">· {zone.radius_m.toFixed(0)} m radius</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5">
              <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
                <path d="M6 1 L10 5 L6 11 L2 5 Z" stroke="#3b82f6" strokeWidth="1.2" fill="#3b82f620" />
              </svg>
              <span>
                Dispatch to <strong className="text-slate-800">{zone.police_station}</strong> PS
              </span>
            </div>
          </div>
        </div>

        {/* Pie chart */}
        <div>
          <MiniHeader
            icon={
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                <path d="M6 1 A5 5 0 1 1 1 6 L6 6 Z" fill="currentColor" opacity="0.7" />
                <path d="M6 1 A5 5 0 0 1 11 6 L6 6 Z" fill="currentColor" />
              </svg>
            }
            title="Violation Type Mix"
            sub="top contributors"
          />
          <div className="bg-white border border-slate-200 rounded-lg p-2 h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={violationData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={55} paddingAngle={2} stroke="#fff" strokeWidth={1.5}>
                  {violationData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(59,130,246,0.4)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#e2e8f0',
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {violationData.map((v, i) => (
              <div key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                <span className="w-2 h-2 rounded-sm" style={{ background: v.color }} />
                <span className="truncate max-w-[80px]">{v.name}</span>
                <span className="font-mono text-slate-400">{v.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div>
          <MiniHeader
            icon={
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                <rect x="1" y="6" width="2" height="5" fill="currentColor" />
                <rect x="4" y="3" width="2" height="8" fill="currentColor" opacity="0.7" />
                <rect x="7" y="5" width="2" height="6" fill="currentColor" opacity="0.5" />
                <rect x="10" y="7" width="1" height="4" fill="currentColor" opacity="0.3" />
              </svg>
            }
            title="Vehicle Type Mix"
            sub="involved units"
          />
          <div className="bg-white border border-slate-200 rounded-lg p-2 h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vehicleData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <RTooltip
                  cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(59,130,246,0.4)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#e2e8f0',
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {vehicleData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3b82f6' : '#22d3ee'} fillOpacity={1 - i * 0.18} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Explainability sentence */}
        <div className="bg-[#0f172a]/95 rounded-lg p-3 clip-corner-sm">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-[#22d3ee]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path
                  d="M6 1 V2 M6 10 V11 M1 6 H2 M10 6 H11 M2.5 2.5 L3 3 M9 9 L9.5 9.5 M2.5 9.5 L3 9 M9 3 L9.5 2.5"
                  stroke="#22d3ee"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <circle cx="6" cy="6" r="2" stroke="#22d3ee" strokeWidth="1" fill="#22d3ee30" />
              </svg>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-[0.14em] text-[#22d3ee] font-semibold mb-1">
                CurbOps · Explainability
              </div>
              <p className="text-[11px] text-slate-200 leading-relaxed">{explainZone(zone)}</p>
            </div>
          </div>
        </div>

        {simulate && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-[11px] text-emerald-800">
            <strong className="font-semibold">Sim active:</strong> this zone is receiving simulated TOW + PATROL capacity. Projected CBM after recovery:{' '}
            <span className="font-mono font-semibold">
              {Math.round(zone.zone_CBM_sum * 0.4).toLocaleString('en-IN')} min
            </span>{' '}
            (–60%).
          </div>
        )}
      </div>
    </div>
  );
}
