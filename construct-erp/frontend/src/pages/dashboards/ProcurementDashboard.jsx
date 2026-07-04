import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Users, Hammer, TrendingUp, ClipboardList, IndianRupee,
  CheckCircle2, ChevronRight, AlertTriangle, Clock,
} from 'lucide-react';
import { poAPI, quotationAPI, vendorAPI, subcontractorAPI, mrsAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { inrCompact, Badge } from './DashKPI';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const PO_STATUS_COLORS = {
  draft:          { bg: 'bg-slate-100',  text: 'text-slate-600',  bar: '#94A3B8' },
  pending:        { bg: 'bg-amber-50',   text: 'text-amber-700',  bar: '#F59E0B' },
  verified_audit: { bg: 'bg-sky-50',     text: 'text-sky-700',    bar: '#0EA5E9' },
  released_mgmt:  { bg: 'bg-violet-50',  text: 'text-violet-700', bar: '#8B5CF6' },
  approved:       { bg: 'bg-emerald-50', text: 'text-emerald-700',bar: '#10B981' },
  part_received:  { bg: 'bg-cyan-50',    text: 'text-cyan-700',   bar: '#06B6D4' },
  received:       { bg: 'bg-blue-50',    text: 'text-blue-700',   bar: '#3B82F6' },
  cancelled:      { bg: 'bg-red-50',     text: 'text-red-600',    bar: '#EF4444' },
};
const WO_STATUS_CLS = {
  draft:      'bg-slate-100 text-slate-600',
  pending:    'bg-amber-50 text-amber-700',
  approved:   'bg-emerald-50 text-emerald-700',
  active:     'bg-teal-50 text-teal-700',
  completed:  'bg-blue-50 text-blue-700',
  terminated: 'bg-red-50 text-red-600',
};

// ── Section title with icon badge (mirrors QSDashboardPage) ────────────────
function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[10px] text-slate-400 uppercase tracking-wider">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// Donut chart (pure SVG) — identical construction to QSDashboardPage
function DonutChart({ segments, size = 100, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke - 2} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke - 2}
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function ProgressPanel({ label, value, max, color, left, right }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-base font-bold" style={{ color }}>{Math.round(w)}%</span>
      </div>
      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

// ── Compact table (white/slate style matching QS recent bills table) ───────
function DataTable({ cols, rows, empty = 'No records' }) {
  if (!rows?.length) return (
    <div className="py-10 text-center text-xs text-slate-400">{empty}</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-y border-slate-100">
            {cols.map(c => (
              <th key={c.key} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${c.right ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              {cols.map(c => (
                <td key={c.key} className={`px-4 py-3 text-xs ${c.right ? 'text-right' : ''} ${c.cls || 'text-slate-700'}`}>
                  {c.render ? c.render(row) : (row[c.key] ?? <span className="text-slate-300">—</span>)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcurementDashboard() {
  const { user } = useAuthStore();
  const thisMonth = dayjs().format('YYYY-MM');

  const { data: pos = [], isLoading: loadP } = useQuery({
    queryKey: ['proc-dash-pos'],
    queryFn: () => poAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: quotations = [], isLoading: loadQ } = useQuery({
    queryKey: ['proc-dash-quotations'],
    queryFn: () => quotationAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-dash-vendors'],
    queryFn: () => vendorAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: wos = [] } = useQuery({
    queryKey: ['proc-dash-wos'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data ?? []),
  });
  const { data: mrsList = [] } = useQuery({
    queryKey: ['proc-dash-mrs'],
    queryFn: () => mrsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ['proc-dash-low-stock'],
    queryFn: () => inventoryAPI.lowStock().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const pendingPOs   = pos.filter(p => p.status === 'pending');
  const approvedPOs  = pos.filter(p => p.status === 'approved');
  const thisMonthPOs = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonth);
  const poValueMonth = thisMonthPOs.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const poValueTotal = pos.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const pendingQuotes= quotations.filter(q => q.status === 'sent' || q.status === 'draft');
  const pendingWOs   = wos.filter(w => w.status === 'pending' || w.status === 'draft');
  const activeWOs    = wos.filter(w => ['submitted', 'approved', 'active'].includes(w.status));
  const thisMonthWOs = wos.filter(w => dayjs(w.wo_date || w.created_at).format('YYYY-MM') === thisMonth);
  const woValueTotal = wos.reduce((s, w) => s + parseFloat(w.total_value || 0), 0);
  const pendingMRS   = mrsList.filter(m => m.status === 'pending' || m.status === 'draft');

  const poStatusBuckets = {};
  for (const p of pos) {
    const s = p.status || 'draft';
    if (!poStatusBuckets[s]) poStatusBuckets[s] = { count: 0, amount: 0 };
    poStatusBuckets[s].count++;
    poStatusBuckets[s].amount += parseFloat(p.grand_total || p.total_amount || 0);
  }
  const donutSegments = Object.entries(poStatusBuckets).map(([s, d]) => ({
    label: s, value: d.count, color: PO_STATUS_COLORS[s]?.bar || '#94A3B8',
  }));

  const receivedValue = pos
    .filter(p => p.status === 'received' || p.status === 'fully_received' || p.status === 'part_received')
    .reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);

  const poCols = [
    { key: 'po_number',   label: 'PO No.',  cls: 'font-bold text-indigo-700' },
    { key: 'vendor_name', label: 'Vendor',  cls: 'text-slate-700 font-medium truncate max-w-[160px]' },
    { key: 'grand_total', label: 'Value',   right: true, cls: 'font-semibold text-slate-800', render: r => inrCompact(r.grand_total || r.total_amount) },
    { key: 'po_date',     label: 'Date',    cls: 'text-slate-500', render: r => r.po_date ? dayjs(r.po_date).format('DD MMM YY') : '—' },
    { key: 'status',      label: 'Status',  render: r => (
      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
        PO_STATUS_COLORS[r.status || 'draft']?.bg, PO_STATUS_COLORS[r.status || 'draft']?.text)}>
        {r.status || 'draft'}
      </span>
    ) },
  ];
  const woCols = [
    { key: 'wo_number',   label: 'WO No.',      cls: 'font-bold text-indigo-700' },
    { key: 'vendor_name', label: 'Contractor',  cls: 'text-slate-700 font-medium truncate max-w-[160px]' },
    { key: 'total_value', label: 'Value',       right: true, cls: 'font-semibold text-slate-800', render: r => inrCompact(r.total_value) },
    { key: 'status',      label: 'Status',      render: r => <Badge label={r.status || 'draft'} cls={`text-[10px] px-1.5 py-0.5 rounded-full ${WO_STATUS_CLS[r.status] || WO_STATUS_CLS.draft}`} /> },
  ];
  const qtCols = [
    { key: 'quotation_number', label: 'Ref',      cls: 'font-bold text-indigo-700' },
    { key: 'vendor_name',      label: 'Vendor',   cls: 'text-slate-700 font-medium truncate max-w-[140px]' },
    { key: 'subject',          label: 'Material', cls: 'text-slate-500 truncate max-w-[150px]' },
    { key: 'created_at',       label: 'Date',     cls: 'text-slate-500', render: r => r.created_at ? dayjs(r.created_at).format('DD MMM YY') : '—' },
  ];
  const mrsCols = [
    { key: 'mrs_number',   label: 'MRS No.',  cls: 'font-bold text-indigo-700' },
    { key: 'project_name', label: 'Project',  cls: 'text-slate-700 font-medium truncate max-w-[160px]' },
    { key: 'created_at',   label: 'Date',     cls: 'text-slate-500', render: r => r.created_at ? dayjs(r.created_at).format('DD MMM YY') : '—' },
    { key: 'status',       label: 'Status',   render: r => <Badge label={r.status || 'draft'} cls="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700" /> },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Procurement Dashboard"
        subtitle="Purchase orders, work orders, vendors & inventory overview"
        breadcrumbs={[{ label: 'Dashboards' }, { label: 'Procurement' }]}
        actions={
          <>
            <Link to="/procurement/po/new"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <ShoppingCart className="w-3.5 h-3.5" /> New PO
            </Link>
            <Link to="/procurement/vendors"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <Users className="w-3.5 h-3.5" /> Vendors
            </Link>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={ShoppingCart}   label="POs This Month"   value={thisMonthPOs.length}      color="blue"    sub={inrCompact(poValueMonth)} />
          <ThemeKpiCard icon={IndianRupee}    label="Total PO Spend"   value={inrCompact(poValueTotal)} color="emerald" sub={`${pos.length} orders`} />
          <ThemeKpiCard icon={Hammer}         label="Total WO Spend"   value={inrCompact(woValueTotal)} color="violet"  sub={`${wos.length} work orders`} />
          <ThemeKpiCard icon={TrendingUp}     label="Quotes Pending"   value={pendingQuotes.length}     color="orange"  sub="Awaiting evaluation" />
          <ThemeKpiCard icon={ClipboardList}  label="MRS Pending"      value={pendingMRS.length}        color="amber"   sub="Awaiting approval" />
          <ThemeKpiCard icon={Users}          label="Vendors"          value={vendors.length}           color="slate"   sub="Registered" />
        </div>

        {/* ── Alert banners ── */}
        {(pendingPOs.length > 0 || lowStock.length > 0) && (
          <div className="flex flex-col gap-2">
            {pendingPOs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Clock size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {pendingPOs.length} purchase order{pendingPOs.length > 1 ? 's' : ''} pending audit
                </span>
                <Link to="/procurement/po" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
            {lowStock.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800">
                  {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below reorder level
                </span>
                <Link to="/procurement/inventory" className="ml-auto text-xs font-semibold text-red-700 underline whitespace-nowrap">View Inventory →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Progress panels + Work Order summary ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProgressPanel
            label="PO Fulfilment"
            value={receivedValue} max={poValueTotal}
            color="#10B981"
            left={`Received: ${inrCompact(receivedValue)}`}
            right={`Total: ${inrCompact(poValueTotal)}`}
          />
          <ProgressPanel
            label="WO Progress"
            value={activeWOs.length} max={wos.length}
            color="#3B82F6"
            left={`Active: ${activeWOs.length}`}
            right={`Total: ${wos.length}`}
          />
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Hammer size={14} className="text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Work Order Summary</span>
              <span className="ml-auto text-[10px] text-slate-400">{dayjs().format('MMM YYYY')}</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'This Month',       value: thisMonthWOs.length },
                { label: 'Pending Approval', value: pendingWOs.length },
                { label: 'Active WOs',       value: activeWOs.length },
                { label: 'Total WO Value',   value: inrCompact(woValueTotal) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-sm font-bold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main Grid: PO Status Breakdown + Vendors ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* PO Status Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={ShoppingCart} title="PO Status Breakdown" subtitle={`${pos.length} total POs`} />
            <div className="flex items-center gap-5 mb-4">
              <div className="relative flex-shrink-0">
                {donutSegments.length > 0
                  ? <DonutChart segments={donutSegments} size={110} stroke={24} />
                  : <div className="w-[110px] h-[110px] rounded-full border-[22px] border-slate-100" />
                }
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-slate-900">{pos.length}</span>
                  <span className="text-[9px] text-slate-400 font-semibold uppercase">POs</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {Object.entries(poStatusBuckets).map(([status, d]) => (
                  <div key={status} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: PO_STATUS_COLORS[status]?.bar || '#94A3B8' }} />
                      <span className="text-[11px] font-medium text-slate-600 capitalize truncate">{status.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-400">{inrCompact(d.amount)}</span>
                      <span className="text-xs font-bold text-slate-800 w-4 text-right">{d.count}</span>
                    </div>
                  </div>
                ))}
                {Object.keys(poStatusBuckets).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No purchase orders yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Vendors */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
            <SectionTitle icon={Users} title="Vendors"
              subtitle={`${vendors.length} registered`}
              action={
                <Link to="/procurement/vendors" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                  View All <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
            {vendors.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No vendors registered</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vendors.slice(0, 12).map(v => (
                  <div key={v.id} className="px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50 transition-colors">
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">{v.name}</p>
                    <p className="text-[10px] text-slate-400">{v.vendor_type || 'Vendor'}</p>
                  </div>
                ))}
                {vendors.length > 12 && (
                  <div className="px-3 py-2 rounded-xl border border-dashed border-slate-300 flex items-center">
                    <span className="text-xs text-slate-400">+{vendors.length - 12} more</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent Purchase Orders table ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 pb-0">
            <SectionTitle icon={ShoppingCart} title="Recent Purchase Orders"
              subtitle="Latest procurement activity"
              action={
                <Link to="/procurement/po" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                  All Orders <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          </div>
          {loadP ? (
            <div className="p-5 space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <DataTable cols={poCols} rows={pos.slice(0, 8)} empty="No purchase orders found" />
          )}
        </div>

        {/* ── Work Orders + Quotations ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={Hammer} title="Recent Work Orders"
                subtitle={`${wos.length} total`}
                action={<Link to="/procurement/work-orders" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">View All <ChevronRight className="w-3 h-3" /></Link>}
              />
            </div>
            <DataTable cols={woCols} rows={wos.slice(0, 6)} empty="No work orders found" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={TrendingUp} title="Quotations Pending"
                subtitle={`${pendingQuotes.length} awaiting evaluation`}
                action={<Link to="/procurement/quotations" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">View All <ChevronRight className="w-3 h-3" /></Link>}
              />
            </div>
            {loadQ ? (
              <div className="p-5 space-y-2">{[1,2,3].map(n=><div key={n} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : (
              <DataTable cols={qtCols} rows={pendingQuotes.slice(0, 6)} empty="No pending quotations" />
            )}
          </div>
        </div>

        {/* ── MRS + Low Stock ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={ClipboardList} title="Material Requests Pending"
                subtitle={`${pendingMRS.length} awaiting approval`}
                action={<Link to="/procurement/material-request" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">View All <ChevronRight className="w-3 h-3" /></Link>}
              />
            </div>
            <DataTable cols={mrsCols} rows={pendingMRS.slice(0, 6)} empty="No pending material requests" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={AlertTriangle} title="Low Stock Alerts"
              subtitle={`${lowStock.length} item${lowStock.length !== 1 ? 's' : ''}`}
              action={<Link to="/procurement/inventory" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">Inventory <ChevronRight className="w-3 h-3" /></Link>}
            />
            {lowStock.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                <p className="text-xs text-slate-400">All stock levels healthy</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {lowStock.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-[55%]">{item.item_name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-bold text-red-600">{item.current_stock ?? 0}</span>
                      <span className="text-[10px] text-slate-400">/ {item.reorder_level ?? '—'} {item.unit || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
