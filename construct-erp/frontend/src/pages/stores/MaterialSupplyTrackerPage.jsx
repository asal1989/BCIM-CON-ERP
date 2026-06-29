// src/pages/stores/MaterialSupplyTrackerPage.jsx
// Material Supply Tracker — end-to-end MR → PO → Delivery → Issue lifecycle
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Truck, CheckCircle2, Clock, AlertTriangle, XCircle,
  FileText, BarChart3, Search, X, ChevronDown, ChevronRight,
  RefreshCw, Download, Filter, TrendingUp, IndianRupee,
  ArrowRight, Circle, CheckCircle, Layers, ShoppingCart,
  ClipboardList, Warehouse, Zap,
} from 'lucide-react';
import { supplyTrackerAPI, projectAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

// ── Drag-to-scroll ────────────────────────────────────────────────────────────
function useDragScroll() {
  const ref = useRef(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onDown = (e) => {
      if (e.button !== 0) return;
      drag.current = { active: true, startX: e.pageX - el.offsetLeft, startY: e.pageY - el.offsetTop, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };
    const onUp = () => {
      drag.current.active = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    };
    const onMove = (e) => {
      if (!drag.current.active) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const y = e.pageY - el.offsetTop;
      el.scrollLeft = drag.current.scrollLeft - (x - drag.current.startX);
      el.scrollTop  = drag.current.scrollTop  - (y - drag.current.startY);
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('mousemove', onMove);
    el.style.cursor = 'grab';

    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('mousemove', onMove);
    };
  }, []);

  return ref;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const n = (v, d = 3) => parseFloat(v || 0).toFixed(d);
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YY') : '—');
const inr = (v) => Math.round(Number(v || 0)).toLocaleString('en-IN');

const STATUS_CFG = {
  'Draft':            { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
  'Pending Approval': { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  'PO Pending':       { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  'PO Created':       { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  'In Transit':       { bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  'Partial Delivery': { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500'  },
  'GRN Completed':    { bg: 'bg-teal-100',    text: 'text-teal-700',    dot: 'bg-teal-500'    },
  'Issued to Site':   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Closed':           { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  'Cancelled':        { bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
};

const PRIORITY_CFG = {
  critical: 'bg-red-100 text-red-700 border border-red-300',
  high:     'bg-orange-100 text-orange-700 border border-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 border border-yellow-300',
  low:      'bg-slate-100 text-slate-500 border border-slate-200',
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG['Draft'];
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap', cfg.bg, cfg.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {status}
    </span>
  );
}

function SupplyBar({ pct: p, overdue }) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-[9px] mb-0.5">
        <span className={overdue ? 'text-red-500 font-bold' : 'text-slate-400'}>{overdue ? '⚠ Overdue' : ''}</span>
        <span className={clsx('font-semibold', p >= 100 ? 'text-emerald-600' : p > 0 ? 'text-blue-600' : 'text-slate-400')}>{p}%</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', overdue ? 'bg-red-500' : p >= 100 ? 'bg-emerald-500' : 'bg-blue-500')}
          style={{ width: `${Math.min(p, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub, onClick, active }) {
  const colors = {
    slate:   { bg: 'bg-slate-50',   icon: 'text-slate-500',   val: 'text-slate-800'   },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-800'   },
    orange:  { bg: 'bg-orange-50',  icon: 'text-orange-600',  val: 'text-orange-800'  },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-800'    },
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-800'  },
    yellow:  { bg: 'bg-yellow-50',  icon: 'text-yellow-600',  val: 'text-yellow-800'  },
    red:     { bg: 'bg-red-50',     icon: 'text-red-600',     val: 'text-red-800'     },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-800' },
    green:   { bg: 'bg-green-50',   icon: 'text-green-600',   val: 'text-green-800'   },
  };
  const c = colors[color] || colors.slate;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all hover:shadow-md',
        active ? 'border-blue-400 shadow-md ring-2 ring-blue-200' : 'border-slate-200 shadow-sm',
        c.bg
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={clsx('w-4 h-4', c.icon)} />
        {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
      </div>
      <div className={clsx('text-2xl font-bold', c.val)}>{value}</div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </button>
  );
}

// ── Timeline Popup ────────────────────────────────────────────────────────────
function DetailPopup({ item, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['supply-detail', item.mr_id, item.item_id],
    queryFn: () => supplyTrackerAPI.detail(item.mr_id, item.item_id).then(r => r.data?.data),
    enabled: !!item.mr_id && !!item.item_id,
  });

  const detail = data;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">Material Supply Detail</div>
            <h2 className="font-bold text-white text-sm">{item.material_name}</h2>
            <p className="text-[11px] text-white/70 mt-0.5">{item.mr_number} · {item.project_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Requested', value: `${n(item.requested_qty)} ${item.unit}`, color: 'text-slate-700' },
                  { label: 'Ordered', value: item.ordered_qty ? `${n(item.ordered_qty)} ${item.unit}` : '—', color: 'text-blue-700' },
                  { label: 'Received', value: `${n(item.received_qty)} ${item.unit}`, color: 'text-emerald-700' },
                  { label: 'Balance', value: `${n(item.balance_qty)} ${item.unit}`, color: item.balance_qty > 0 ? 'text-red-600' : 'text-emerald-700' },
                ].map(k => (
                  <div key={k.label} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <div className="text-[10px] text-slate-400 mb-0.5">{k.label}</div>
                    <div className={clsx('text-sm font-bold', k.color)}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* MR Info + PO Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Material Request</h3>
                  <dl className="space-y-1">
                    {[
                      ['MR Number', item.mr_number],
                      ['Date', fmtDate(item.mr_date)],
                      ['Required By', fmtDate(item.required_date)],
                      ['Raised By', item.raised_by || '—'],
                      ['Department', item.department || '—'],
                      ['Cost Centre', item.cost_center || '—'],
                      ['Status', <StatusBadge key="s" status={item.mr_status} />],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-400">{k}</span>
                        <span className="font-medium text-slate-700 text-right">{v}</span>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Purchase Order</h3>
                  {item.po_number ? (
                    <dl className="space-y-1">
                      {[
                        ['PO Number', item.po_number],
                        ['PO Date', fmtDate(item.po_date)],
                        ['Vendor', item.vendor_name || '—'],
                        ['Expected Delivery', fmtDate(item.expected_delivery_date)],
                        ['Actual Delivery', fmtDate(item.actual_delivery_date)],
                        ['Ordered Qty', `${n(item.ordered_qty)} ${item.unit}`],
                        ['Unit Rate', item.unit_rate ? `₹${inr(item.unit_rate)}` : '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-slate-400">{k}</span>
                          <span className="font-medium text-slate-700 text-right">{v}</span>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="flex items-center justify-center h-24 text-slate-400 text-xs">No PO created yet</div>
                  )}
                </div>
              </div>

              {/* GRN Records */}
              {detail?.grns?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">IGN / Inward Records</h3>
                  <div className="space-y-2">
                    {detail.grns.map((g, i) => (
                      <div key={g.id || i} className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs">
                        <div>
                          <span className="font-bold text-teal-700">{g.ign_number || '—'}</span>
                          <span className="text-slate-400 ml-2">{fmtDate(g.ign_created)}</span>
                          {g.vehicle_no && <span className="text-slate-400 ml-2">· {g.vehicle_no}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-slate-700">{n(g.quantity_received, 3)} {item.unit}</span>
                          <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold',
                            g.ign_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {g.ign_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Timeline */}
              {detail?.timeline?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Full Activity Timeline</h3>
                  <div className="relative">
                    <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-200" />
                    <div className="space-y-2">
                      {detail.timeline.map((t, i) => {
                        const TYPE_CFG = {
                          mr:       { dot: 'bg-slate-700 border-slate-700',   text: 'text-slate-700',   sub: 'text-slate-400', tag: 'bg-slate-100 text-slate-600'   },
                          approval: { dot: 'bg-emerald-500 border-emerald-500', text: 'text-slate-800', sub: 'text-slateald-400', tag: 'bg-emerald-100 text-emerald-700' },
                          po:       { dot: 'bg-blue-500 border-blue-500',     text: 'text-blue-800',    sub: 'text-blue-400',   tag: 'bg-blue-100 text-blue-700'     },
                          ign:      { dot: 'bg-teal-500 border-teal-500',     text: 'text-teal-800',    sub: 'text-teal-400',   tag: 'bg-teal-100 text-teal-700'     },
                          invoice:  { dot: 'bg-purple-500 border-purple-500', text: 'text-purple-800',  sub: 'text-purple-400', tag: 'bg-purple-100 text-purple-700' },
                        };
                        const isPending = t.status === 'pending';
                        const isFuture  = t.status === 'future' || t.status === 'due';
                        const cfg = isPending || isFuture
                          ? { dot: 'bg-white border-slate-300', text: 'text-slate-400', sub: 'text-slate-300', tag: 'bg-slate-50 text-slate-400' }
                          : (TYPE_CFG[t.type] || TYPE_CFG.mr);

                        const ICONS = {
                          mr:       <FileText className="w-3 h-3" />,
                          approval: <CheckCircle2 className="w-3 h-3" />,
                          po:       <ShoppingCart className="w-3 h-3" />,
                          ign:      <Warehouse className="w-3 h-3" />,
                          invoice:  <IndianRupee className="w-3 h-3" />,
                        };
                        const icon = isPending || isFuture
                          ? <Clock className="w-3 h-3 text-slate-300" />
                          : (ICONS[t.type] || <CheckCircle2 className="w-3 h-3" />);

                        return (
                          <div key={i} className="flex items-start gap-3 relative">
                            <div className={clsx(
                              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 text-white',
                              cfg.dot,
                            )}>
                              {icon}
                            </div>
                            <div className="flex-1 pt-0.5 pb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={clsx('text-xs font-semibold', cfg.text)}>{t.event}</span>
                                {t.type && !isPending && (
                                  <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide', cfg.tag)}>
                                    {t.type === 'ign' ? 'GRN' : t.type}
                                  </span>
                                )}
                                {(isFuture || t.status === 'due') && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide bg-amber-100 text-amber-600">
                                    {t.status === 'due' ? 'Overdue' : 'Upcoming'}
                                  </span>
                                )}
                              </div>
                              <div className={clsx('text-[10px] mt-0.5', cfg.sub)}>
                                {t.date ? fmtDate(t.date) : 'Pending'}
                                {t.ref    && ` · ${t.ref}`}
                                {t.vendor && ` · ${t.vendor}`}
                                {t.by     && ` · ${t.by}`}
                                {t.qty    != null && ` · Qty: ${n(t.qty, 3)}`}
                                {t.dc     && ` · DC: ${t.dc}`}
                                {t.vehicle && ` · ${t.vehicle}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filters Panel ─────────────────────────────────────────────────────────────
function FiltersPanel({ filters, setFilters, projects, onReset }) {
  const inp = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none bg-white';

  const STATUS_OPTIONS = [
    'Draft','Pending Approval','PO Pending','PO Created','In Transit',
    'Partial Delivery','GRN Completed','Issued to Site','Closed','Cancelled',
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> Filters</h3>
        <button onClick={onReset} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors">Reset</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Project</label>
          <select className={inp} value={filters.project_id} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label>
          <select className={inp} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Priority</label>
          <select className={inp} value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
            <option value="">All</option>
            {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
          <input className={inp} placeholder="e.g. Steel, Cement…" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From Date</label>
          <input type="date" className={inp} value={filters.date_from}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To Date</label>
          <input type="date" className={inp} value={filters.date_to}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input className={clsx(inp, 'pl-6')} placeholder="MR No, PO No, Material, Vendor…"
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            {filters.search && (
              <button onClick={() => setFilters(f => ({ ...f, search: '' }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Tracker Table ────────────────────────────────────────────────────────
function TrackerTable({ rows, isLoading, onRowClick }) {
  const [expanded, setExpanded] = useState(null);
  const toggle = (id) => setExpanded(e => (e === id ? null : id));
  const scrollRef = useDragScroll();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-50 border-b border-slate-100 animate-pulse mx-4 my-1.5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 shadow-sm">
        <Layers className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No records found</p>
        <p className="text-xs mt-1">Adjust filters or check MR/PO data</p>
      </div>
    );
  }

  // Compact layout — drag to scroll in any direction
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <style>{`
        .supply-scroll::-webkit-scrollbar { width: 14px; height: 14px; }
        .supply-scroll::-webkit-scrollbar-track { background: #ffe4e6; border-radius: 8px; }
        .supply-scroll::-webkit-scrollbar-thumb { background: #f43f5e; border-radius: 8px; border: 2px solid #ffe4e6; }
        .supply-scroll::-webkit-scrollbar-thumb:hover { background: #e11d48; }
        .supply-scroll::-webkit-scrollbar-corner { background: #ffe4e6; }
      `}</style>
      <div
        ref={scrollRef}
        className="overflow-auto select-none supply-scroll"
        style={{ maxHeight: 'calc(100vh - 340px)', minHeight: 300, scrollbarWidth: 'auto', scrollbarColor: '#f43f5e #ffe4e6' }}
      >
        <table className="text-xs" style={{ minWidth: 1000, width: '100%' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 text-white">
              <th className="w-7 px-2 py-2" />
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">MR Number</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Material</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">UOM</th>
              <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Req Qty</th>
              <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Ordered</th>
              <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Received</th>
              <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Balance</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Supply %</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Status</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">PO / Vendor</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Exp. Delivery</th>
              <th className="px-2 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isExp = expanded === (row.item_id || idx);
              const overdue = row.is_overdue;
              const uid = row.item_id || idx;
              return (
                <React.Fragment key={uid}>
                  <tr
                    className={clsx(
                      'border-b border-slate-100 cursor-pointer transition-colors',
                      overdue ? 'bg-red-50/50 hover:bg-red-50' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50',
                      isExp && '!bg-blue-50/40',
                    )}
                    onClick={() => toggle(uid)}
                  >
                    <td className="px-2 py-2 text-center">
                      <ChevronRight className={clsx('w-3 h-3 text-slate-400 transition-transform', isExp && 'rotate-90')} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-mono font-bold text-blue-700 text-[11px] whitespace-nowrap">{row.mr_number}</div>
                      <div className="text-[9px] text-slate-400">{fmtDate(row.mr_date)}</div>
                    </td>
                    <td className="px-2 py-2 max-w-[180px]">
                      <div className="font-medium text-slate-800 text-[11px] truncate" title={row.material_name}>
                        {overdue && <AlertTriangle className="w-2.5 h-2.5 text-red-500 inline mr-0.5" />}
                        {row.material_name}
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">{row.project_name}</div>
                    </td>
                    <td className="px-2 py-2 text-slate-500 text-[11px]">{row.unit}</td>
                    <td className="px-2 py-2 text-right font-medium text-slate-700 text-[11px]">{n(row.requested_qty)}</td>
                    <td className="px-2 py-2 text-right font-medium text-blue-700 text-[11px]">{row.ordered_qty ? n(row.ordered_qty) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-right font-medium text-emerald-700 text-[11px]">{n(row.received_qty)}</td>
                    <td className={clsx('px-2 py-2 text-right font-bold text-[11px]', row.balance_qty > 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {n(row.balance_qty)}
                    </td>
                    <td className="px-2 py-2 w-20">
                      <SupplyBar pct={row.supply_pct} overdue={overdue} />
                    </td>
                    <td className="px-2 py-2"><StatusBadge status={row.overall_status} /></td>
                    <td className="px-2 py-2 max-w-[130px]">
                      {row.po_number
                        ? <div className="font-mono text-[10px] text-slate-700 truncate">{row.po_number}</div>
                        : <span className="text-slate-300 text-[10px]">No PO</span>
                      }
                      {row.vendor_name && <div className="text-[9px] text-slate-400 truncate">{row.vendor_name}</div>}
                    </td>
                    <td className={clsx('px-2 py-2 text-[11px] whitespace-nowrap', overdue ? 'text-red-600 font-bold' : 'text-slate-500')}>
                      {fmtDate(row.expected_delivery_date)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={e => { e.stopPropagation(); onRowClick(row); }}
                        className="px-1.5 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-100 rounded transition-colors whitespace-nowrap"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>

                  {/* Expanded inline row */}
                  {isExp && (
                    <tr className="border-b border-blue-100 bg-blue-50/30">
                      <td colSpan={13} className="px-4 py-3">
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-3 text-[11px]">
                          {[
                            ['MR Date', fmtDate(row.mr_date)],
                            ['Required By', fmtDate(row.required_date)],
                            ['Raised By', row.raised_by || '—'],
                            ['Department', row.department || '—'],
                            ['Category', row.material_category || '—'],
                            ['GRN Count', row.grn_count || '0'],
                            ['Actual Delivery', fmtDate(row.actual_delivery_date)],
                            ['Unit Rate', row.unit_rate ? `₹${inr(row.unit_rate)}` : '—'],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{k}</div>
                              <div className="font-medium text-slate-700">{v}</div>
                            </div>
                          ))}
                        </div>
                        {row.mr_remarks && (
                          <div className="mt-2 text-[11px] text-slate-500 italic bg-white px-3 py-1.5 rounded-lg border border-slate-100">
                            Remarks: {row.mr_remarks}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-800 text-white font-bold text-[11px]">
                <td colSpan={4} className="px-2 py-2 text-slate-300 text-[10px] uppercase">
                  {rows.length} items total
                </td>
                <td className="px-2 py-2 text-right">{n(rows.reduce((s, r) => s + parseFloat(r.requested_qty || 0), 0))}</td>
                <td className="px-2 py-2 text-right text-blue-300">{n(rows.reduce((s, r) => s + parseFloat(r.ordered_qty || 0), 0))}</td>
                <td className="px-2 py-2 text-right text-emerald-300">{n(rows.reduce((s, r) => s + parseFloat(r.received_qty || 0), 0))}</td>
                <td className="px-2 py-2 text-right text-red-300">{n(rows.reduce((s, r) => s + parseFloat(r.balance_qty || 0), 0))}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────
function SummaryTab({ projectId }) {
  const [groupBy, setGroupBy] = useState('vendor');
  const { data = [], isLoading } = useQuery({
    queryKey: ['supply-summary', projectId, groupBy],
    queryFn: () => supplyTrackerAPI.summary({ project_id: projectId || undefined, group_by: groupBy }).then(r => r.data?.data || []),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold text-slate-500">Group by:</label>
        {['vendor', 'category', 'project'].map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
            className={clsx('px-3 py-1.5 text-xs font-bold rounded-lg transition-colors capitalize',
              groupBy === g ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
            {g}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Name', 'Items', 'Requested Qty', 'Ordered Qty', 'Received Qty', 'POs', 'GRNs', 'Supply %'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const supplyPct = pct(r.received_qty, r.ordered_qty || r.requested_qty);
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.label}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.item_count}</td>
                    <td className="px-4 py-2.5 text-slate-700">{n(r.requested_qty)}</td>
                    <td className="px-4 py-2.5 text-blue-700 font-medium">{n(r.ordered_qty)}</td>
                    <td className="px-4 py-2.5 text-emerald-700 font-medium">{n(r.received_qty)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.po_count}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.grn_count}</td>
                    <td className="px-4 py-2.5 w-32"><SupplyBar pct={supplyPct} /></td>
                  </tr>
                );
              })}
              {!data.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-xs">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const EMPTY_FILTERS = { project_id: '', status: '', priority: '', category: '', date_from: '', date_to: '', search: '' };

export default function MaterialSupplyTrackerPage() {
  const [tab, setTab]       = useState('tracker');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detail, setDetail] = useState(null);
  const [kpiFilter, setKpiFilter] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  const { data: kpis = {} } = useQuery({
    queryKey: ['supply-dashboard', filters.project_id],
    queryFn: () => supplyTrackerAPI.dashboard({ project_id: filters.project_id || undefined }).then(r => r.data?.data || {}),
    refetchInterval: 60_000,
  });

  const queryFilters = useMemo(() => {
    const f = { ...filters };
    if (kpiFilter) f.status = kpiFilter;
    return f;
  }, [filters, kpiFilter]);

  const { data: trackerData, isLoading, refetch } = useQuery({
    queryKey: ['supply-tracker', queryFilters],
    queryFn: () => supplyTrackerAPI.list(queryFilters).then(r => r.data?.data || []),
    enabled: tab === 'tracker',
  });

  const rows = trackerData || [];

  const handleKpiClick = useCallback((statusFilter) => {
    setKpiFilter(prev => prev === statusFilter ? null : statusFilter);
    setTab('tracker');
  }, []);

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setKpiFilter(null);
  };

  const KPIS = [
    { key: 'total_mrs',       label: 'Total MRs',       icon: ClipboardList,  color: 'slate',   filter: null },
    { key: 'pending_approvals', label: 'Pending Approval', icon: Clock,        color: 'amber',   filter: 'Pending Approval' },
    { key: 'pending_po',      label: 'PO Pending',      icon: ShoppingCart,   color: 'orange',  filter: 'PO Pending' },
    { key: 'open_pos',        label: 'Open POs',        icon: FileText,       color: 'blue',    filter: 'PO Created' },
    { key: 'in_transit',      label: 'In Transit',      icon: Truck,          color: 'indigo',  filter: 'In Transit' },
    { key: 'partial_delivery', label: 'Partial Delivery', icon: Package,       color: 'yellow',  filter: 'Partial Delivery' },
    { key: 'pending_grn',     label: 'Pending GRN',     icon: Warehouse,      color: 'red',     filter: 'GRN Completed' },
    { key: 'overdue',         label: 'Overdue',         icon: AlertTriangle,  color: 'red',     filter: null },
    { key: 'closed',          label: 'Closed',          icon: CheckCircle2,   color: 'green',   filter: 'Closed' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Material Supply Tracker"
        subtitle="End-to-end tracking: MR → PO → Delivery → GRN → Site Issue"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Material Supply Tracker' }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-white/15 text-white hover:bg-white/25 border border-white/20">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-3">
          {KPIS.map(k => (
            <KpiCard
              key={k.key}
              icon={k.icon}
              label={k.label}
              value={kpis[k.key] ?? 0}
              color={k.color}
              active={kpiFilter === k.filter && k.filter !== null}
              onClick={() => k.filter && handleKpiClick(k.filter)}
            />
          ))}
        </div>

        {/* Active KPI filter chip */}
        {kpiFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Filtering by:</span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
              <StatusBadge status={kpiFilter} />
              <button onClick={() => setKpiFilter(null)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm w-fit">
          {[
            { key: 'tracker', label: 'Tracker Grid', icon: Layers },
            { key: 'summary', label: 'Summary / Abstract', icon: BarChart3 },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors',
                tab === t.key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <FiltersPanel filters={filters} setFilters={setFilters} projects={projects} onReset={resetFilters} />

        {/* Content */}
        {tab === 'tracker' && (
          <TrackerTable rows={rows} isLoading={isLoading} onRowClick={setDetail} />
        )}
        {tab === 'summary' && (
          <SummaryTab projectId={filters.project_id} />
        )}
      </div>

      {/* Detail popup */}
      {detail && <DetailPopup item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
