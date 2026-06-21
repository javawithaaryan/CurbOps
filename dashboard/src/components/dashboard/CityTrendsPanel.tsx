'use client';

// ---------------------------------------------------------------------------
// CurbOps — CityTrendsPanel
// Full-bleed "City Trends" view: real daily parking-impact trends over time,
// sourced entirely from analytics.json (every number traces back to a row in
// violations_with_cbm.csv). No fabricated data.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyAnalytics } from '@/lib/dashboard/types';

interface Props {
  daily: DailyAnalytics[];
}

// Palette aligned with the rest of the command-deck theme.
const COLORS = {
  morning: '#3b82f6',
  evening: '#f97316',
  offpeak: '#22d3ee',
  total: '#3b82f6',
};

const TOOLTIP_STYLE = {
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(59,130,246,0.4)',
  borderRadius: '8px',
  fontSize: '11px',
  color: '#e2e8f0',
} as const;

const enIN = (n: number) =>
  Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtDate = (iso: unknown) => {
  const d = new Date(String(iso) + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 clip-corner-sm relative overflow-hidden flex-1 min-w-[150px]">
      <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: accent }} />
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className="tabular text-xl font-semibold mt-1 leading-none"
        style={{ color: accent }}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="text-[9px] text-slate-400 mt-1 font-mono truncate">{sub}</div>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl clip-corner p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        {subtitle && (
          <span className="text-[10px] text-slate-400 font-mono">{subtitle}</span>
        )}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}

export default function CityTrendsPanel({ daily }: Props) {
  // Aggregate totals (real, derived only from the loaded daily array).
  const stats = useMemo(() => {
    if (daily.length === 0) return null;
    const total = daily.reduce((s, d) => s + d.total_cbm, 0);
    const morning = daily.reduce((s, d) => s + d.morning_cbm, 0);
    const evening = daily.reduce((s, d) => s + d.evening_cbm, 0);
    const offpeak = daily.reduce((s, d) => s + d.offpeak_cbm, 0);
    const peak = daily.reduce((a, b) => (b.total_cbm > a.total_cbm ? b : a), daily[0]);
    return { total, morning, evening, offpeak, peak, days: daily.length };
  }, [daily]);

  // Downsample the X-axis labels when there are many days so the axis stays
  // legible (data is unchanged — only tick rendering is thinned).
  const xInterval = useMemo(
    () => (daily.length > 30 ? Math.ceil(daily.length / 12) : 0),
    [daily.length]
  );

  // ---- Empty state: the analytics file hasn't been generated yet. --------
  if (!stats) {
    return (
      <div className="absolute inset-0 overflow-y-auto scroll-thin bg-[#f8fafc] flex items-center justify-center p-6 animate-fadeIn">
        <div className="bg-white border border-slate-200 rounded-2xl clip-corner max-w-lg w-full p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#0b1220] flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-6 4 4 6-8" />
              <path d="M3 21h18" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">No trend data yet</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            City Trends needs <code className="font-mono text-[#3b82f6]">analytics.json</code>,
            which is generated from the real violations CSV. Run this once:
          </p>
          <pre className="mt-4 text-left bg-[#0b1220] text-[#22d3ee] font-mono text-[11px] rounded-lg px-4 py-3 overflow-x-auto scroll-thin border border-[#1f2a44]">
python CurbOps_Pipeline/generate_analytics.py
          </pre>
          <p className="text-[11px] text-slate-400 mt-3 font-mono">
            Then copy dataset/analytics.json → dashboard/data/
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto scroll-thin bg-[#f8fafc] animate-fadeIn">
      <div className="max-w-[1400px] mx-auto p-5 space-y-5">
        {/* ---- Header ---- */}
        <div className="bg-[#0f172a] rounded-2xl clip-corner p-5 text-white relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(90deg,#3b82f6 0,#22d3ee 100%), repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(255,255,255,0.04) 28px,rgba(255,255,255,0.04) 29px)',
              backgroundBlendMode: 'overlay',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l5-6 4 4 6-8" />
                <path d="M3 21h18" />
              </svg>
              <h1 className="text-[17px] font-semibold tracking-tight">City Trends</h1>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.18em] ml-1">
                · Parking Impact Over Time
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 font-mono">
              {fmtDate(daily[0].date)} → {fmtDate(daily[daily.length - 1].date)} ·{' '}
              {stats.days} days · Congestion Burden Minutes (CBM)
            </p>

            {/* KPI chips */}
            <div className="flex flex-wrap gap-3 mt-4">
              <KpiCard
                label="Total CBM"
                value={enIN(stats.total)}
                sub={`${stats.days} days, all parking violations`}
                accent="#22d3ee"
              />
              <KpiCard
                label="Avg CBM / day"
                value={enIN(stats.total / stats.days)}
                sub="Daily mean burden"
                accent="#3b82f6"
              />
              <KpiCard
                label="Peak Day"
                value={enIN(stats.peak.total_cbm)}
                sub={fmtDate(stats.peak.date) + ' · highest daily CBM'}
                accent="#f97316"
              />
              <KpiCard
                label="Days Analyzed"
                value={String(stats.days)}
                sub="Approved, parking-related records"
                accent="#10b981"
              />
            </div>
          </div>
        </div>

        {/* ---- Hero: stacked area by time-of-day ---- */}
        <ChartCard
          title="Daily CBM by Time of Day"
          subtitle="stacked · morning 07–10 · evening 17–19 · off-peak"
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gMorning" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.morning} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COLORS.morning} stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="gEvening" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.evening} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COLORS.evening} stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="gOffpeak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.offpeak} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={COLORS.offpeak} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                interval={xInterval}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                tickFormatter={(v) => enIN(Number(v))}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <RTooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8' }}
                labelFormatter={fmtDate}
                formatter={(value, name) => [enIN(Number(value)), name]}
              />
              <Area
                type="monotone"
                dataKey="offpeak_cbm"
                name="Off-peak"
                stackId="1"
                stroke={COLORS.offpeak}
                strokeWidth={1.5}
                fill="url(#gOffpeak)"
              />
              <Area
                type="monotone"
                dataKey="evening_cbm"
                name="Evening"
                stackId="1"
                stroke={COLORS.evening}
                strokeWidth={1.5}
                fill="url(#gEvening)"
              />
              <Area
                type="monotone"
                dataKey="morning_cbm"
                name="Morning"
                stackId="1"
                stroke={COLORS.morning}
                strokeWidth={1.5}
                fill="url(#gMorning)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ---- Row: total trend line + time-of-day breakdown ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ChartCard
              title="Total Daily CBM Trend"
              subtitle="overall city-wide burden"
              height={240}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={daily} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.total} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={COLORS.total} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    interval={xInterval}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tickFormatter={(v) => enIN(Number(v))}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <RTooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                    labelFormatter={fmtDate}
                    formatter={(value) => [enIN(Number(value)) + ' min', 'Total CBM']}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_cbm"
                    name="Total CBM"
                    stroke={COLORS.total}
                    strokeWidth={2.2}
                    dot={false}
                    activeDot={{ r: 4, fill: COLORS.total }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard
            title="Time-of-Day Split"
            subtitle={`${fmtDate(daily[0].date)} → ${fmtDate(daily[daily.length - 1].date)}`}
            height={240}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'Morning', cbm: stats.morning, fill: COLORS.morning },
                  { name: 'Evening', cbm: stats.evening, fill: COLORS.evening },
                  { name: 'Off-peak', cbm: stats.offpeak, fill: COLORS.offpeak },
                ]}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  tickFormatter={(v) => enIN(Number(v))}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <RTooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                  formatter={(value) => [enIN(Number(value)) + ' min', 'CBM']}
                />
                <Bar dataKey="cbm" radius={[6, 6, 0, 0]}>
                  <Cell fill={COLORS.morning} />
                  <Cell fill={COLORS.evening} />
                  <Cell fill={COLORS.offpeak} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ---- Footer note: data provenance ---- */}
        <div className="text-[10px] text-slate-400 font-mono text-center pb-2">
          Source: violations_with_cbm.csv · approved, parking-related records · CBM treated as IST per project convention
        </div>
      </div>
    </div>
  );
}
