// src/pages/finance/BudgetControlDashboard.jsx — Executive Budget Control dashboard (light theme)
import React, { useMemo, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useReactToPrint } from 'react-to-print';
import { clsx } from 'clsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  IndianRupee, TrendingUp, TrendingDown, Wallet, Percent, Receipt,
  Target, Clock, Search, Printer, ArrowUpRight, ArrowDownRight, Minus,
  Download, FileSpreadsheet, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Building2, CalendarRange, AlertTriangle, Info, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts';
import { boqBudgetAPI, raBillAPI, clientAdvanceAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { BOQPrintHeader } from '../qs/BOQBudgetBreakdownPage';

/* ─────────────────────────────────────────────────────────────────────────
 * Design tokens — clean light enterprise palette
 * ───────────────────────────────────────────────────────────────────── */
const T = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  primary: '#2563EB', primarySoft: '#EFF6FF',
  success: '#16A34A', successSoft: '#F0FDF4',
  warning: '#F59E0B', warningSoft: '#FFFBEB',
  danger: '#DC2626', dangerSoft: '#FEF2F2',
  purple: '#7C3AED', purpleSoft: '#F5F3FF',
  text: '#0F172A', textMuted: '#64748B',
};
const FONT = { fontFamily: "'Geist Variable', system-ui, -apple-system, sans-serif" };

const RA_MONTHS = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const RA_MONTHS_SHORT = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const num = (v) => parseFloat(v) || 0;
const inr = (v) => `₹${Math.round(num(v)).toLocaleString('en-IN')}`;
const inrCompact = (v) => {
  const n = num(v);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};
const pct = (v) => `${num(v).toFixed(1)}%`;

/* ─────────────────────────────────────────────────────────────────────────
 * Sparkline — lightweight inline SVG trend line
 * ───────────────────────────────────────────────────────────────────── */
function Sparkline({ data = [], color = T.primary, height = 32, width = 96 }) {
  const vals = data.length ? data : [0, 0];
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 3;
  const step = (width - pad * 2) / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const gid = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ProgressRing — animated circular completion gauge
 * ───────────────────────────────────────────────────────────────────── */
function ProgressRing({ percent = 0, size = 168, stroke = 14, color = T.primary }) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (clamped / 100) * c }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * KpiCard
 * ───────────────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, spark, sparkColor = T.primary, iconColor = T.primary, iconBg, delta, deltaGood = 'up', index = 0 }) {
  const bg = iconBg || `${iconColor}15`;
  const deltaUp = delta != null && delta >= 0;
  const deltaColor = delta == null ? T.textMuted
    : (deltaGood === 'up' ? deltaUp : !deltaUp) ? T.success : T.danger;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
      whileHover={{ y: -3, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${T.border}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
    >
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor }} />
        </div>
        {delta != null && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: deltaColor }}>
            {deltaUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-[12.5px] font-medium" style={{ color: T.textMuted }}>{label}</div>
      <div className="text-[22px] font-bold leading-tight mt-0.5" style={{ color: T.text }}>{value}</div>
      {sub && <div className="text-[11px] mt-1 truncate" style={{ color: T.textMuted }}>{sub}</div>}
      {spark && (
        <div className="mt-2.5">
          <Sparkline data={spark} color={sparkColor} />
        </div>
      )}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Card shell
 * ───────────────────────────────────────────────────────────────────── */
function Panel({ title, subtitle, action, children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={clsx('rounded-2xl bg-white overflow-hidden', className)}
      style={{ border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div>
            {title && <h3 className="text-[15px] font-bold" style={{ color: T.text }}>{title}</h3>}
            {subtitle && <p className="text-[11.5px] mt-0.5" style={{ color: T.textMuted }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reusable data table — search, sort, paginate, export
 * ───────────────────────────────────────────────────────────────────── */
function DataTable({ columns, rows, exportName, pageSize = 8, searchPlaceholder = 'Search…' }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((row) => columns.some((c) => String(c.searchValue ? c.searchValue(row) : row[c.key] ?? '').toLowerCase().includes(s)));
    }
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      r = [...r].sort((a, b) => {
        const va = col?.sortValue ? col.sortValue(a) : a[sort.key];
        const vb = col?.sortValue ? col.sortValue(b) : b[sort.key];
        const cmp = typeof va === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, search, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (key) => {
    setPage(0);
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const exportExcel = () => {
    const data = filtered.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.exportValue ? c.exportValue(r) : r[c.key]])));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, exportName);
    XLSX.writeFile(wb, `${exportName}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text(exportName, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [columns.map((c) => c.label)],
      body: filtered.map((r) => columns.map((c) => String(c.exportValue ? c.exportValue(r) : r[c.key] ?? ''))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`${exportName}_${dayjs().format('YYYY-MM-DD')}.pdf`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none"
            style={{ border: `1px solid ${T.border}` }}
          />
        </div>
        <div className="flex-1" />
        <button onClick={exportExcel} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition hover:bg-slate-50" style={{ border: `1px solid ${T.border}`, color: T.text }}>
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </button>
        <button onClick={exportPdf} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition hover:bg-slate-50" style={{ border: `1px solid ${T.border}`, color: T.text }}>
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.border}` }}>
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0">
            <tr style={{ background: T.primarySoft }}>
              {columns.map((c) => (
                <th key={c.key}
                  onClick={() => c.sortable !== false && toggleSort(c.key)}
                  className={clsx('px-3.5 py-2.5 font-semibold whitespace-nowrap select-none', c.align === 'right' ? 'text-right' : 'text-left', c.sortable !== false && 'cursor-pointer')}
                  style={{ color: '#1E3A8A' }}>
                  <span className={clsx('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="text-center py-8 text-xs" style={{ color: T.textMuted }}>No records found</td></tr>
            )}
            {pageRows.map((r, i) => (
              <tr key={r.id ?? i} className="hover:bg-slate-50 transition-colors" style={{ borderTop: `1px solid ${T.border}` }}>
                {columns.map((c) => (
                  <td key={c.key} className={clsx('px-3.5 py-2.5', c.align === 'right' ? 'text-right font-mono' : 'text-left')} style={{ color: T.text }}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between mt-3 text-[11.5px]" style={{ color: T.textMuted }}>
          <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 hover:bg-slate-50" style={{ border: `1px solid ${T.border}` }}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold" style={{ color: T.text }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 hover:bg-slate-50" style={{ border: `1px solid ${T.border}` }}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Main chart — Plan vs Actual RA Billing (gradient "floating column" bars)
 * ───────────────────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 text-xs" style={{ border: `1px solid ${T.border}`, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <div className="font-bold mb-1.5" style={{ color: T.text }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: T.textMuted }}>
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}
          </span>
          <span className="font-mono font-semibold" style={{ color: T.text }}>{inr(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const CHART3D_SERIES = [
  { key: 'planned',   name: 'Planned RA',   color: '#2563EB' },
  { key: 'actual',    name: 'Actual RA',    color: '#16A34A' },
  { key: 'remaining', name: 'Remaining BOQ', color: '#94A3B8' },
];

function PlanActualChart3D({ data }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  React.useEffect(() => {
    let disposed = false;
    let ro;
    (async () => {
      const echarts = await import('echarts');
      await import('echarts-gl');
      if (disposed || !ref.current) return;
      const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
      chartRef.current = chart;

      const months = data.map((d) => d.month);
      const gl3d = [];
      data.forEach((d, xi) => {
        CHART3D_SERIES.forEach((s, yi) => {
          gl3d.push([xi, yi, Math.round(num(d[s.key]))]);
        });
      });

      chart.setOption({
        tooltip: {
          formatter: (p) => {
            const s = CHART3D_SERIES[p.value[1]];
            return `<b>${months[p.value[0]]}</b><br/>${s.name}: ${inr(p.value[2])}`;
          },
        },
        xAxis3D: { type: 'category', data: months, axisLabel: { textStyle: { color: T.textMuted, fontSize: 11 } }, axisLine: { lineStyle: { color: T.border } } },
        yAxis3D: { type: 'category', data: CHART3D_SERIES.map((s) => s.name), axisLabel: { textStyle: { color: T.textMuted, fontSize: 11 } }, axisLine: { lineStyle: { color: T.border } } },
        zAxis3D: { type: 'value', axisLabel: { formatter: (v) => inrCompact(v), textStyle: { color: T.textMuted, fontSize: 10 } }, axisLine: { lineStyle: { color: T.border } }, splitLine: { lineStyle: { color: '#F1F5F9' } } },
        grid3D: {
          boxWidth: 130, boxDepth: 55, boxHeight: 60,
          viewControl: { projection: 'perspective', alpha: 24, beta: 32, distance: 165, autoRotate: true, autoRotateSpeed: 4, damping: 0.85 },
          light: { main: { intensity: 1.15, shadow: true, shadowQuality: 'medium', alpha: 40 }, ambient: { intensity: 0.35 } },
          environment: '#FFFFFF',
          postEffect: { enable: true, SSAO: { enable: true, quality: 'medium', radius: 2 } },
          temporalSuperSampling: { enable: true },
        },
        series: [{
          type: 'bar3D',
          data: gl3d,
          shading: 'lambert',
          bevelSize: 0.25,
          bevelSmoothness: 4,
          itemStyle: { color: (p) => CHART3D_SERIES[p.value[1]].color, opacity: 0.94 },
          emphasis: { itemStyle: { color: '#F59E0B' } },
          animationDurationUpdate: 800,
          animationEasing: 'cubicOut',
        }],
      });

      ro = new ResizeObserver(() => chart.resize());
      ro.observe(ref.current);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.dispose();
    };
  }, [data]);

  return (
    <div>
      <div ref={ref} style={{ width: '100%', height: 360 }} />
      <div className="flex items-center justify-center gap-5 pt-1 text-[11.5px]" style={{ color: T.textMuted }}>
        {CHART3D_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
        <span className="text-[10.5px]" style={{ color: T.textMuted }}>· drag to rotate</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Cumulative RA billing progress line
 * ───────────────────────────────────────────────────────────────────── */
function CumulativeLineChart({ data, boqValue }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: T.textMuted }} axisLine={{ stroke: T.border }} tickLine={false} />
        <YAxis tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} width={58} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={boqValue} stroke={T.purple} strokeDasharray="5 4" label={{ value: 'BOQ', position: 'insideTopRight', fontSize: 10, fill: T.purple, fontWeight: 700 }} />
        <Line name="Planned" type="monotone" dataKey="planned" stroke={T.primary} strokeWidth={2.25} dot={{ r: 3, fill: T.primary }} isAnimationActive animationDuration={1200} />
        <Line name="Actual" type="monotone" dataKey="actual" stroke={T.success} strokeWidth={2.25} dot={{ r: 3, fill: T.success }} isAnimationActive animationDuration={1200} animationBegin={150} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Cost Head Performance — horizontal bars
 * ───────────────────────────────────────────────────────────────────── */
function CostHeadPerformance({ rows, onSelect }) {
  const top = rows.filter((r) => !r.derived).sort((a, b) => b.budget - a.budget).slice(0, 10);
  const max = Math.max(...top.map((r) => Math.max(r.budget, r.actual)), 1);
  return (
    <div className="space-y-3.5">
      {top.map((r) => (
        <button key={r.cost_head} type="button" onClick={() => onSelect?.(r.cost_head)}
          className="w-full text-left group -mx-1 px-1 rounded-lg transition hover:bg-slate-50">
          <div className="flex items-center justify-between text-[11.5px] mb-1">
            <span className="font-semibold truncate flex items-center gap-1" style={{ color: T.text }}>
              {r.cost_head}
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
            </span>
            <span style={{ color: T.textMuted }}>{inrCompact(r.actual)} / {inrCompact(r.budget)}</span>
          </div>
          <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((r.budget / max) * 100, 100)}%` }} transition={{ duration: 0.8 }}
              className="absolute inset-y-0 left-0 rounded-full" style={{ background: T.primary, opacity: 0.28 }} />
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((r.actual / max) * 100, 100)}%` }} transition={{ duration: 0.9 }}
              className="absolute inset-y-0 left-0 rounded-full" style={{ background: r.actual > r.budget ? T.danger : T.success }} />
          </div>
        </button>
      ))}
      {top.length === 0 && <div className="text-center py-8 text-xs" style={{ color: T.textMuted }}>No cost-head budgets set yet</div>}
      <div className="flex items-center gap-4 pt-1 text-[10.5px]" style={{ color: T.textMuted }}>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: T.primary, opacity: 0.28 }} /> Budget</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: T.success }} /> Actual (within budget)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: T.danger }} /> Actual (over budget)</span>
        <span className="ml-auto italic">click a row → Details</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Monthly variance — waterfall
 * ───────────────────────────────────────────────────────────────────── */
function VarianceWaterfall({ data }) {
  let cum = 0;
  const rows = data.map((d) => {
    const base = d.variance >= 0 ? cum : cum + d.variance;
    cum += d.variance;
    return { ...d, base: Math.max(base, 0), abs: Math.abs(d.variance) };
  });
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: T.textMuted }} axisLine={{ stroke: T.border }} tickLine={false} />
        <YAxis tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} width={58} />
        <Tooltip formatter={(v, n, p) => [inr(p.payload.variance), 'Variance']} labelFormatter={(l) => l} contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${T.border}` }} />
        <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="abs" stackId="a" radius={[6, 6, 6, 6]} isAnimationActive animationDuration={900}>
          {rows.map((d, i) => <Cell key={i} fill={d.variance >= 0 ? T.success : T.danger} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Cash flow forecast — area
 * ───────────────────────────────────────────────────────────────────── */
function CashFlowForecast({ data }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.success} stopOpacity={0.32} />
            <stop offset="100%" stopColor={T.success} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.danger} stopOpacity={0.28} />
            <stop offset="100%" stopColor={T.danger} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: T.textMuted }} axisLine={{ stroke: T.border }} tickLine={false} />
        <YAxis tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} width={58} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Area name="Income" type="monotone" dataKey="income" stroke={T.success} fill="url(#gradIncome)" strokeWidth={2} strokeDasharray={(d) => d?.forecast ? '5 4' : '0'} isAnimationActive animationDuration={1000} />
        <Area name="Expense" type="monotone" dataKey="expense" stroke={T.danger} fill="url(#gradExpense)" strokeWidth={2} isAnimationActive animationDuration={1000} animationBegin={100} />
        <Line name="Net Cash Flow" type="monotone" dataKey="net" stroke={T.primary} strokeWidth={2} dot={false} isAnimationActive animationDuration={1000} animationBegin={200} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Budget consumption timeline
 * ───────────────────────────────────────────────────────────────────── */
function ConsumptionTimeline({ data, budget }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: T.textMuted }} axisLine={{ stroke: T.border }} tickLine={false} />
        <YAxis tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} width={58} />
        <Tooltip content={<CustomTooltip />} />
        {budget > 0 && <ReferenceLine y={budget} stroke={T.warning} strokeDasharray="5 4" label={{ value: 'Budget', position: 'insideTopRight', fontSize: 10, fill: T.warning, fontWeight: 700 }} />}
        <Line name="Cumulative Spend" type="monotone" dataKey="cumulative" stroke={T.primary} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive animationDuration={1400} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * MAIN COMPONENT
 * ───────────────────────────────────────────────────────────────────── */
export default function BudgetControlDashboard({ onJumpToDetails }) {
  const { selectedProjectId } = useAuthStore();
  const projectId = selectedProjectId || '';
  const printRef = useRef();
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: 'Budget_Control' });
  const [raFrom, setRaFrom] = useState(1);
  const [raTo, setRaTo] = useState(9);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then((r) => (Array.isArray(r?.data) ? r.data : r?.data?.data || [])).catch(() => []),
  });
  const selectedProject = projects.find((p) => p.id === projectId);

  const { data: summaryResp, isLoading } = useQuery({
    queryKey: ['bcd-costhead-summary', projectId],
    queryFn: () => boqBudgetAPI.costheadSummary(projectId).then((r) => r.data),
    enabled: !!projectId,
  });
  const costheadRows = summaryResp?.data || [];
  const totalBoqValue = num(summaryResp?.total_boq_value);
  const monthsElapsed = summaryResp?.months_elapsed || 1;
  const totalBudget = costheadRows.filter((r) => !r.derived).reduce((s, r) => s + num(r.budget), 0);
  const totalActual = costheadRows.filter((r) => !r.derived).reduce((s, r) => s + num(r.actual), 0);
  const totalReceived = costheadRows.filter((r) => !r.derived).reduce((s, r) => s + num(r.received), 0);
  const totalPaid = costheadRows.filter((r) => !r.derived).reduce((s, r) => s + num(r.paid), 0);

  const { data: raPlanRows = [] } = useQuery({
    queryKey: ['bcd-ra-plan', projectId],
    queryFn: () => boqBudgetAPI.raPlan(projectId).then((r) => r.data?.data ?? []).catch(() => []),
    enabled: !!projectId,
  });
  const { data: raActualsData } = useQuery({
    queryKey: ['bcd-ra-actuals', projectId],
    queryFn: () => boqBudgetAPI.raActuals(projectId).then((r) => r.data?.data ?? { bills: [], actuals: [] }).catch(() => ({ bills: [], actuals: [] })),
    enabled: !!projectId,
  });
  const { data: raBillsRaw = [] } = useQuery({
    queryKey: ['bcd-ra-bills', projectId],
    queryFn: () => raBillAPI.list({ project_id: projectId }).then((r) => r.data?.data || []).catch(() => []),
    enabled: !!projectId,
  });
  const { data: advanceStats } = useQuery({
    queryKey: ['bcd-client-advance', projectId],
    queryFn: () => clientAdvanceAPI.stats({ project_id: projectId }).then((r) => r.data?.data || {}).catch(() => ({})),
    enabled: !!projectId,
  });
  const { data: monthlyResp } = useQuery({
    queryKey: ['bcd-costhead-monthly', projectId],
    queryFn: () => boqBudgetAPI.costheadMonthly(projectId).then((r) => r.data).catch(() => ({ data: [], months: [] })),
    enabled: !!projectId,
  });

  // ── Plan vs Actual per RA index (1-9, chronological RA order) ──────────
  const planByIdx = useMemo(() => {
    const arr = Array(9).fill(0);
    raPlanRows.forEach((r) => { const i = num(r.ra_index) - 1; if (i >= 0 && i < 9) arr[i] += num(r.planned_amount); });
    return arr;
  }, [raPlanRows]);
  const actualByIdx = useMemo(() => {
    const arr = Array(9).fill(0);
    (raActualsData?.actuals || []).forEach((r) => { const i = num(r.ra_index) - 1; if (i >= 0 && i < 9) arr[i] += num(r.amount); });
    return arr;
  }, [raActualsData]);

  const chartData = useMemo(() => {
    let cumActual = 0;
    return RA_MONTHS_SHORT.map((m, i) => {
      cumActual += actualByIdx[i];
      return {
        month: m,
        planned: planByIdx[i],
        actual: actualByIdx[i],
        remaining: Math.max(totalBoqValue - cumActual, 0),
      };
    }).filter((_, i) => i + 1 >= raFrom && i + 1 <= raTo);
  }, [planByIdx, actualByIdx, totalBoqValue, raFrom, raTo]);

  const cumulativeData = useMemo(() => {
    let cp = 0, ca = 0;
    return RA_MONTHS_SHORT.map((m, i) => {
      cp += planByIdx[i]; ca += actualByIdx[i];
      return { month: m, planned: cp, actual: ca };
    });
  }, [planByIdx, actualByIdx]);

  const variancePlan = useMemo(() => RA_MONTHS_SHORT
    .map((m, i) => ({ month: m, variance: actualByIdx[i] - planByIdx[i] }))
    .filter((_, i) => i + 1 >= raFrom && i + 1 <= raTo), [planByIdx, actualByIdx, raFrom, raTo]);

  const overHeads = costheadRows.filter((r) => !r.derived && r.budget > 0 && r.actual > r.budget);
  const nearHeads = costheadRows.filter((r) => !r.derived && r.budget > 0 && r.actual <= r.budget && r.actual / r.budget >= 0.8);

  const planRaValue = planByIdx.reduce((s, v) => s + v, 0);
  const actualRaValue = actualByIdx.reduce((s, v) => s + v, 0);
  const variance = actualRaValue - planRaValue;

  const certifiedBills = raBillsRaw.filter((b) => ['certified', 'paid'].includes(b.status));
  const currentBill = certifiedBills[0];
  const cumulativeBilled = certifiedBills.reduce((s, b) => s + num(b.net_payable), 0);
  const cumulativeReceived = raBillsRaw.reduce((s, b) => s + num(b.amount_received), 0);
  const outstanding = cumulativeBilled - cumulativeReceived;

  const budgetUtilPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const forecastPct = totalBoqValue > 0 ? (actualRaValue / totalBoqValue) * 100 : 0;
  const monthlyBurn = monthsElapsed > 0 ? totalActual / monthsElapsed : 0;
  const monthsToComplete = monthlyBurn > 0 ? Math.ceil((totalBoqValue - totalActual) / monthlyBurn) : null;

  // ── Monthly expense series (real, from costhead-monthly) ───────────────
  const monthlyExpense = useMemo(() => {
    return (monthlyResp?.data || []).map((d) => ({
      month: dayjs(d.month + '-01').format('MMM YY'),
      total: Object.values(d.breakdown || {}).reduce((s, v) => s + num(v), 0),
    }));
  }, [monthlyResp]);

  const consumptionData = useMemo(() => {
    let cum = 0;
    return monthlyExpense.map((d) => { cum += d.total; return { month: d.month, cumulative: cum }; });
  }, [monthlyExpense]);

  // ── Cash flow: real income (RA bills received) vs real expense (monthly costhead spend) ──
  const cashFlowData = useMemo(() => {
    const incomeByMonth = {};
    raBillsRaw.forEach((b) => {
      if (!b.bill_date || !num(b.amount_received)) return;
      const k = dayjs(b.bill_date).format('YYYY-MM');
      incomeByMonth[k] = (incomeByMonth[k] || 0) + num(b.amount_received);
    });
    const expenseByMonth = {};
    (monthlyResp?.data || []).forEach((d) => {
      expenseByMonth[d.month] = Object.values(d.breakdown || {}).reduce((s, v) => s + num(v), 0);
    });
    const months = Array.from(new Set([...Object.keys(incomeByMonth), ...Object.keys(expenseByMonth)])).sort();
    const rows = months.map((k) => {
      const income = incomeByMonth[k] || 0;
      const expense = expenseByMonth[k] || 0;
      return { month: dayjs(k + '-01').format('MMM YY'), income, expense, net: income - expense, forecast: false };
    });
    if (rows.length >= 2) {
      const lastN = rows.slice(-3);
      const avgIncome = lastN.reduce((s, r) => s + r.income, 0) / lastN.length;
      const avgExpense = lastN.reduce((s, r) => s + r.expense, 0) / lastN.length;
      const lastMonth = months[months.length - 1];
      for (let i = 1; i <= 2; i++) {
        const fm = dayjs(lastMonth + '-01').add(i, 'month').format('MMM YY');
        rows.push({ month: fm, income: avgIncome, expense: avgExpense, net: avgIncome - avgExpense, forecast: true });
      }
    }
    return rows;
  }, [raBillsRaw, monthlyResp]);

  // ── KPI sparklines from real monthly series ─────────────────────────────
  const expenseSpark = monthlyExpense.map((d) => d.total);
  const plannedSpark = planByIdx;
  const actualSpark = actualByIdx;
  const varianceSpark = variancePlan.map((v) => v.variance);
  const cumActualSpark = cumulativeData.map((d) => d.actual);
  const billSpark = certifiedBills.slice(0, 8).reverse().map((b) => num(b.net_payable));
  const forecastSpark = cumulativeData.map((d) => totalBoqValue > 0 ? (d.actual / totalBoqValue) * 100 : 0);

  if (!projectId) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', ...FONT }} className="flex items-center justify-center">
        <div className="text-center">
          <Wallet className="w-12 h-12 mx-auto mb-4" style={{ color: T.border }} />
          <p className="font-semibold" style={{ color: T.text }}>Select a project from the top bar to view Budget Control</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', ...FONT }}>
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-white" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="max-w-[1680px] mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[280px]">
            <h1 className="text-[26px] font-bold tracking-tight" style={{ color: T.text }}>Budget Control</h1>
            <p className="text-[12.5px] mt-0.5" style={{ color: T.textMuted }}>Monitor budget allocation, planned billing, actual billing and project financial performance</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: T.primarySoft }}>
            <Building2 className="w-3.5 h-3.5" style={{ color: T.primary }} />
            <span className="text-[12px] font-semibold" style={{ color: T.primary }}>{selectedProject?.name || 'Project'}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: T.purpleSoft }}>
            <CalendarRange className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T.purple }} />
            <select value={raFrom} onChange={(e) => setRaFrom(Math.min(Number(e.target.value), raTo))}
              className="text-[12px] font-semibold bg-transparent outline-none" style={{ color: T.purple }}>
              {RA_MONTHS.map((m, i) => <option key={i} value={i + 1}>RA{i + 1} · {m}</option>)}
            </select>
            <span className="text-[12px]" style={{ color: T.purple }}>–</span>
            <select value={raTo} onChange={(e) => setRaTo(Math.max(Number(e.target.value), raFrom))}
              className="text-[12px] font-semibold bg-transparent outline-none" style={{ color: T.purple }}>
              {RA_MONTHS.map((m, i) => <option key={i} value={i + 1}>RA{i + 1} · {m}</option>)}
            </select>
          </div>
          {(overHeads.length > 0 || nearHeads.length > 0) && (
            <button onClick={() => onJumpToDetails?.({ filter: overHeads.length > 0 ? 'over' : 'near' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition hover:opacity-80"
              style={{ background: overHeads.length > 0 ? T.dangerSoft : T.warningSoft }}>
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: overHeads.length > 0 ? T.danger : T.warning }} />
              <span className="text-[12px] font-semibold" style={{ color: overHeads.length > 0 ? T.danger : T.warning }}>
                {overHeads.length > 0 ? `${overHeads.length} over budget` : `${nearHeads.length} near limit`}
              </span>
            </button>
          )}
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-bold rounded-lg text-white transition hover:opacity-90"
            style={{ background: T.primary }}>
            <Printer className="w-3.5 h-3.5" /> Print BOQ
          </button>
        </div>
      </div>

      {/* ── Print-only summary (letterhead + KPIs + cost-head table) ── */}
      <div ref={printRef} className="hidden print:block p-6">
        <BOQPrintHeader
          title="Budget Control Summary"
          subtitle="Budget allocation, planned billing and actual billing performance"
          projectName={selectedProject?.name}
          projectAddress={[selectedProject?.location, selectedProject?.city, selectedProject?.state].filter(Boolean).join(', ')}
          clientName={selectedProject?.client_name}
          meta={[
            ['BOQ Value', inrCompact(totalBoqValue)],
            ['Plan RA Value', inrCompact(planRaValue)],
            ['Actual RA Value', inrCompact(actualRaValue)],
            ['Variance', inrCompact(variance)],
            ['Budget Utilization', pct(budgetUtilPct)],
            ['Outstanding', inrCompact(outstanding)],
          ]}
        />
        <table className="w-full text-xs mt-3" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0B2E59', color: '#fff' }}>
              <th className="px-2 py-1.5 text-left">#</th>
              <th className="px-2 py-1.5 text-left">Cost Head</th>
              <th className="px-2 py-1.5 text-right">Budget</th>
              <th className="px-2 py-1.5 text-right">Actual</th>
              <th className="px-2 py-1.5 text-right">% Used</th>
              <th className="px-2 py-1.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {costheadRows.filter((r) => !r.derived).map((r, i) => (
              <tr key={r.cost_head} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td className="px-2 py-1">{i + 1}</td>
                <td className="px-2 py-1">{r.cost_head}</td>
                <td className="px-2 py-1 text-right">{inr(r.budget)}</td>
                <td className="px-2 py-1 text-right">{inr(r.actual)}</td>
                <td className="px-2 py-1 text-right">{r.budget > 0 ? pct((r.actual / r.budget) * 100) : '—'}</td>
                <td className="px-2 py-1 text-right">{inr(r.budget - r.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-[1680px] mx-auto px-6 py-6 space-y-6 print:hidden">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: '#F1F5F9' }} />)}</div>
        ) : (
          <>
            {certifiedBills.length === 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: T.primarySoft, border: `1px solid #BFDBFE` }}>
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: T.primary }} />
                <p className="text-[12.5px]" style={{ color: '#1E3A8A' }}>
                  <b>No RA bills certified yet</b> for this project — Actual RA Value, RA-billing charts, and the Actual RA Bills table
                  will stay at ₹0 until the first bill is certified. This reflects real project status, not missing data.
                </p>
              </div>
            )}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard index={0} icon={IndianRupee} label="BOQ Value" value={inrCompact(totalBoqValue)} sub="Total contract value" iconColor={T.primary} spark={cumActualSpark} sparkColor={T.primary} />
              <KpiCard index={1} icon={Target} label="Plan RA Value" value={inrCompact(planRaValue)} sub="Sum of planned RA1–RA9" iconColor="#0EA5E9" spark={plannedSpark} sparkColor="#0EA5E9" />
              <KpiCard index={2} icon={Receipt} label="Actual RA Value" value={inrCompact(actualRaValue)} sub={`${certifiedBills.length} certified bill${certifiedBills.length !== 1 ? 's' : ''}`} iconColor={T.success} spark={actualSpark} sparkColor={T.success} />
              <KpiCard index={3} icon={variance >= 0 ? TrendingUp : TrendingDown} label="Variance (Actual − Plan)" value={inrCompact(variance)} sub={variance >= 0 ? 'Ahead of plan' : 'Behind plan'} iconColor={variance >= 0 ? T.success : T.danger} spark={varianceSpark} sparkColor={variance >= 0 ? T.success : T.danger} delta={planRaValue > 0 ? (variance / planRaValue) * 100 : null} deltaGood="up" />
              <KpiCard index={4} icon={Percent} label="Budget Utilization" value={pct(budgetUtilPct)} sub={`${inrCompact(totalActual)} of ${inrCompact(totalBudget)}`} iconColor={T.warning} spark={expenseSpark} sparkColor={T.warning} />
              <KpiCard index={5} icon={Wallet} label="Current RA" value={currentBill ? inrCompact(currentBill.net_payable) : '—'} sub={currentBill?.bill_number || 'No certified bill yet'} iconColor="#4F46E5" spark={billSpark} sparkColor="#4F46E5" />
              <KpiCard index={6} icon={Clock} label="Outstanding Amount" value={inrCompact(outstanding)} sub="Billed minus received from client" iconColor={T.danger} spark={cumActualSpark} sparkColor={T.danger} deltaGood="down" />
              <KpiCard index={7} icon={Target} label="Forecast Completion" value={pct(forecastPct)} sub={monthsToComplete != null ? `~${monthsToComplete} mo at current pace` : 'Insufficient data'} iconColor={T.purple} spark={forecastSpark} sparkColor={T.purple} />
            </div>

            {/* ── Main chart + right panel ── */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
              <Panel title="Plan vs Actual RA Billing" subtitle={`Monthly planned, actual and remaining BOQ value (RA${raFrom}–RA${raTo})`} delay={0.05}>
                <PlanActualChart3D data={chartData} />
              </Panel>

              <div className="flex flex-col gap-6">
                <Panel title="Cumulative RA Billing Progress" delay={0.08}>
                  <CumulativeLineChart data={cumulativeData} boqValue={totalBoqValue} />
                </Panel>

                <Panel title="BOQ Completion" delay={0.11}>
                  <div className="flex flex-col items-center">
                    <div className="relative">
                      <ProgressRing percent={forecastPct} color={T.primary} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[26px] font-bold" style={{ color: T.text }}>{pct(forecastPct)}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>Complete</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 w-full mt-4">
                      <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg" style={{ background: T.successSoft }}>
                        <span style={{ color: T.textMuted }}>Current Billing</span>
                        <span className="font-bold" style={{ color: T.success }}>{inrCompact(actualRaValue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg" style={{ background: T.warningSoft }}>
                        <span style={{ color: T.textMuted }}>Remaining Amount</span>
                        <span className="font-bold" style={{ color: T.warning }}>{inrCompact(Math.max(totalBoqValue - actualRaValue, 0))}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-lg" style={{ background: T.purpleSoft }}>
                        <span style={{ color: T.textMuted }}>Forecast</span>
                        <span className="font-bold" style={{ color: T.purple }}>{monthsToComplete != null ? `~${monthsToComplete} months` : '—'}</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            {/* ── Tables ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Panel title="Plan RA Bills" subtitle={`Planned billing by RA number (RA${raFrom}–RA${raTo})`} delay={0.14}>
                <DataTable
                  exportName="Plan_RA_Bills"
                  searchPlaceholder="Search RA / month…"
                  columns={[
                    { key: 'ra', label: 'RA No.', render: (r) => `RA${r.idx + 1}` },
                    { key: 'month', label: 'Month' },
                    { key: 'planned', label: 'Planned Amount', align: 'right', render: (r) => inr(r.planned), sortValue: (r) => r.planned, exportValue: (r) => Math.round(r.planned) },
                    { key: 'cumulative', label: 'Cumulative Planned', align: 'right', render: (r) => inr(r.cumulative), sortValue: (r) => r.cumulative, exportValue: (r) => Math.round(r.cumulative) },
                    { key: 'pctBoq', label: '% of BOQ', align: 'right', render: (r) => pct(r.pctBoq), sortValue: (r) => r.pctBoq, exportValue: (r) => r.pctBoq.toFixed(1) },
                  ]}
                  rows={(() => {
                    let cum = 0;
                    return RA_MONTHS.map((m, i) => {
                      cum += planByIdx[i];
                      return { id: i, idx: i, month: m, planned: planByIdx[i], cumulative: cum, pctBoq: totalBoqValue > 0 ? (cum / totalBoqValue) * 100 : 0 };
                    }).filter((r) => r.idx + 1 >= raFrom && r.idx + 1 <= raTo);
                  })()}
                  pageSize={9}
                />
              </Panel>

              <Panel title="Actual RA Bills" subtitle="Certified / paid RA bills" delay={0.17}>
                <DataTable
                  exportName="Actual_RA_Bills"
                  searchPlaceholder="Search bill number / status…"
                  columns={[
                    { key: 'bill_number', label: 'Bill No.' },
                    { key: 'bill_date', label: 'Date', render: (r) => r.bill_date ? dayjs(r.bill_date).format('DD-MMM-YY') : '—', sortValue: (r) => r.bill_date || '' },
                    { key: 'status', label: 'Status', render: (r) => (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase" style={{
                        background: r.status === 'paid' ? T.successSoft : r.status === 'certified' ? T.primarySoft : T.warningSoft,
                        color: r.status === 'paid' ? T.success : r.status === 'certified' ? T.primary : T.warning,
                      }}>{r.status}</span>
                    ) },
                    { key: 'net_payable', label: 'Net Payable', align: 'right', render: (r) => inr(r.net_payable), sortValue: (r) => num(r.net_payable), exportValue: (r) => Math.round(num(r.net_payable)) },
                    { key: 'amount_received', label: 'Received', align: 'right', render: (r) => inr(r.amount_received), sortValue: (r) => num(r.amount_received), exportValue: (r) => Math.round(num(r.amount_received)) },
                    { key: 'balance', label: 'Balance', align: 'right', render: (r) => inr(num(r.net_payable) - num(r.amount_received)), sortValue: (r) => num(r.net_payable) - num(r.amount_received), exportValue: (r) => Math.round(num(r.net_payable) - num(r.amount_received)) },
                  ]}
                  rows={raBillsRaw}
                  pageSize={8}
                />
              </Panel>
            </div>

            {/* ── Bottom analytics ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Panel title="Cost Head Performance" subtitle="Top 10 cost heads — budget vs actual" delay={0.20}>
                <CostHeadPerformance rows={costheadRows} onSelect={(costHead) => onJumpToDetails?.({ costHead })} />
              </Panel>
              <Panel title="Monthly Variance" subtitle="Actual minus planned RA billing, by month" delay={0.23}>
                <VarianceWaterfall data={variancePlan} />
              </Panel>
              <Panel title="Cash Flow Forecast" subtitle="Income (received) vs expense (spend), with 2-month forecast" delay={0.26}>
                <CashFlowForecast data={cashFlowData} />
              </Panel>
              <Panel title="Budget Consumption Timeline" subtitle="Cumulative actual spend vs total budget" delay={0.29}>
                <ConsumptionTimeline data={consumptionData} budget={totalBudget} />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
