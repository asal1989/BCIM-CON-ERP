import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Truck, ClipboardList, Package, AlertTriangle, ArrowRight,
  PackageCheck, TrendingDown, CheckCircle2, Clock, ShieldCheck,
  ArrowUpRight, BarChart3, Boxes,
} from 'lucide-react';
import { grnAPI, mrsAPI, minAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { DashSection, DashTable, Badge } from './DashKPI';
import dayjs from 'dayjs';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const GRN_CLS = {
  pending:         'bg-amber-100 text-amber-700',
  verified_stores: 'bg-blue-100 text-blue-700',
  approved:        'bg-emerald-100 text-emerald-700',
  rejected:        'bg-red-100 text-red-700',
};
const MRS_CLS = {
  pending:         'bg-amber-100 text-amber-700',
  stores_verified: 'bg-blue-100 text-blue-700',
  verified_tower:  'bg-blue-100 text-blue-700',
  approved_pm:     'bg-indigo-100 text-indigo-700',
  approved_srpm:   'bg-indigo-100 text-indigo-700',
  approved_mgmt:   'bg-purple-100 text-purple-700',
  approved_md:     'bg-emerald-100 text-emerald-700',
  issued:          'bg-teal-100 text-teal-700',
  rejected:        'bg-red-100 text-red-700',
};

const MRS_LABEL = {
  pending:         'Pending',
  stores_verified: 'Stores ✓',
  verified_tower:  'Tower ✓',
  approved_pm:     'PM Approved',
  approved_srpm:   'Sr PM Approved',
  approved_mgmt:   'Mgmt Approved',
  approved_md:     'MD Approved',
  issued:          'Issued',
  rejected:        'Rejected',
};

function StatBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-32 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-6 text-right">{value}</span>
    </div>
  );
}

export default function StoresDashboard() {
  const { user } = useAuthStore();

  const { data: grns = [], isLoading: loadG } = useQuery({
    queryKey: ['stores-dash-grns'],
    queryFn: () => grnAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: mrs = [], isLoading: loadM } = useQuery({
    queryKey: ['stores-dash-mrs'],
    queryFn: () => mrsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: issues = [], isLoading: loadI } = useQuery({
    queryKey: ['stores-dash-issues'],
    queryFn: () => minAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['stores-dash-inventory'],
    queryFn: () => inventoryAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const now = dayjs();

  // GRN breakdowns
  const grnThisMonth    = grns.filter(g => dayjs(g.grn_date || g.created_at).isSame(now, 'month'));
  const pendingGRNs     = grns.filter(g => (g.quality_status || g.status) === 'pending');
  const verifiedGRNs    = grns.filter(g => (g.quality_status || g.status) === 'verified_stores');
  const approvedGRNs    = grns.filter(g => (g.quality_status || g.status) === 'approved');
  const awaitingGRNs    = [...pendingGRNs, ...verifiedGRNs];

  // MRS breakdowns — use actual DB status values
  const MRS_CLOSED = ['issued', 'rejected', 'draft'];
  const MRS_IN_APPROVAL = ['stores_verified', 'verified_tower', 'approved_pm', 'approved_srpm', 'approved_mgmt', 'approved_md'];
  const openMRS     = mrs.filter(m => !MRS_CLOSED.includes(m.status));
  const pendingMRS  = mrs.filter(m => m.status === 'pending');
  const inApproval  = mrs.filter(m => MRS_IN_APPROVAL.includes(m.status));
  const issuedMRS   = mrs.filter(m => m.status === 'issued');

  // Issues
  const thisMonthIssues = issues.filter(i => dayjs(i.issue_date || i.created_at).isSame(now, 'month'));
  const recentIssues    = [...issues].sort((a, b) => dayjs(b.issue_date || b.created_at).valueOf() - dayjs(a.issue_date || a.created_at).valueOf()).slice(0, 8);

  // Inventory
  const lowStock = inventory.filter(i => {
    const closing = parseFloat(i.closing_stock ?? i.current_stock ?? 0);
    const min     = parseFloat(i.min_stock ?? i.reorder_level ?? 0);
    return min > 0 && closing <= min;
  });
  const totalItems = inventory.length;
  const outOfStock = inventory.filter(i => parseFloat(i.closing_stock ?? i.current_stock ?? 0) <= 0);

  const grnCols = [
    { key: 'grn_number',     label: 'GRN #',   cls: 'font-mono text-[11px] font-bold text-indigo-700' },
    { key: 'vendor_name',    label: 'Vendor',   cls: 'text-slate-700 max-w-[110px] truncate', render: r => r.supplier_name || r.vendor_name || '—' },
    { key: 'grn_date',       label: 'Date',     render: r => r.grn_date ? dayjs(r.grn_date).format('DD MMM') : '—', cls: 'text-slate-500' },
    { key: 'quality_status', label: 'Stage',    render: r => <Badge label={r.quality_status === 'verified_stores' ? 'Stores OK' : (r.quality_status || 'pending')} cls={GRN_CLS[r.quality_status] || GRN_CLS.pending} /> },
  ];

  const mrsCols = [
    { key: 'mrs_number',   label: 'MRS #',   cls: 'font-mono text-[11px] font-bold text-indigo-700',
      render: r => r.serial_no_formatted || r.mrs_number || '—' },
    { key: 'project_name', label: 'Project', cls: 'text-slate-700 max-w-[110px] truncate' },
    { key: 'created_at',   label: 'Date',    render: r => dayjs(r.created_at).format('DD MMM'), cls: 'text-slate-500' },
    { key: 'status',       label: 'Status',  render: r => (
        <Badge label={MRS_LABEL[r.status] || r.status || 'pending'} cls={MRS_CLS[r.status] || 'bg-slate-100 text-slate-600'} />
      )},
  ];

  const issueCols = [
    { key: 'min_number',    label: 'MIN #',     cls: 'font-mono text-[11px] font-bold text-indigo-700' },
    { key: 'project_name',  label: 'Project',   cls: 'text-slate-700 max-w-[110px] truncate' },
    { key: 'issued_to',     label: 'Issued To', cls: 'text-slate-600 max-w-[100px] truncate' },
    { key: 'issue_date',    label: 'Date',      render: r => r.issue_date ? dayjs(r.issue_date).format('DD MMM') : '—', cls: 'text-slate-500' },
    { key: 'status',        label: 'Status',    render: r => <Badge label={r.status || 'issued'} cls="bg-blue-100 text-blue-700" /> },
  ];

  const lowStockCols = [
    { key: 'material_name', label: 'Material',    cls: 'font-medium text-slate-800 max-w-[150px] truncate' },
    { key: 'category',      label: 'Category',    cls: 'text-slate-500 text-[11px]' },
    { key: 'closing_stock', label: 'In Stock',    right: true, render: r => <span className="font-mono text-red-600 font-semibold">{parseFloat(r.closing_stock ?? r.current_stock ?? 0).toFixed(2)}</span> },
    { key: 'min_stock',     label: 'Min Level',   right: true, render: r => <span className="font-mono text-slate-500">{parseFloat(r.min_stock ?? r.reorder_level ?? 0).toFixed(2)}</span> },
    { key: 'unit',          label: 'Unit',        cls: 'text-slate-400 text-[11px] uppercase' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title={`Good ${now.hour() < 12 ? 'morning' : now.hour() < 17 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={`Stores Dashboard — ${now.format('dddd, D MMMM YYYY')}`}
        breadcrumbs={[{ label: 'Stores' }, { label: 'Dashboard' }]}
      />

      <div className="p-6 space-y-5 max-w-7xl mx-auto">

        {/* ── Row 1: KPIs ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Truck}         label="Total GRNs"         value={grns.length}            color="slate"   />
          <ThemeKpiCard icon={PackageCheck}  label="GRNs This Month"    value={grnThisMonth.length}    color="indigo"  />
          <ThemeKpiCard icon={Clock}         label="Awaiting QC"        value={awaitingGRNs.length}    color="amber"   />
          <ThemeKpiCard icon={ClipboardList} label="Open Requisitions"  value={openMRS.length}         color="blue"    />
          <ThemeKpiCard icon={ArrowUpRight}  label="Issues This Month"  value={thisMonthIssues.length} color="emerald" />
          <ThemeKpiCard icon={AlertTriangle} label="Low Stock Alerts"   value={lowStock.length}        color="red"     />
        </div>

        {/* ── Row 2: Workflow status bars ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* GRN pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Truck size={14} className="text-teal-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">GRN Pipeline</span>
              <span className="ml-auto text-xs text-slate-400">{grns.length} total</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Pending QC"      value={pendingGRNs.length}  total={grns.length} color="bg-amber-400" />
              <StatBar label="Stores Verified" value={verifiedGRNs.length} total={grns.length} color="bg-blue-400" />
              <StatBar label="Approved"        value={approvedGRNs.length} total={grns.length} color="bg-emerald-400" />
            </div>
          </div>

          {/* MRS pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList size={14} className="text-blue-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">MRS Pipeline</span>
              <span className="ml-auto text-xs text-slate-400">{mrs.length} total</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Pending"     value={pendingMRS.length}  total={mrs.length} color="bg-amber-400" />
              <StatBar label="In Approval" value={inApproval.length}  total={mrs.length} color="bg-indigo-400" />
              <StatBar label="Issued"      value={issuedMRS.length}   total={mrs.length} color="bg-emerald-400" />
            </div>
          </div>

          {/* Inventory health */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Boxes size={14} className="text-slate-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Inventory Health</span>
              <span className="ml-auto text-xs text-slate-400">{totalItems} items</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Low Stock"   value={lowStock.length}                          total={totalItems} color="bg-red-400" />
              <StatBar label="Out of Stock" value={outOfStock.length}                       total={totalItems} color="bg-rose-600" />
              <StatBar label="Healthy"     value={totalItems - lowStock.length}             total={totalItems} color="bg-emerald-400" />
            </div>
          </div>
        </div>

        {/* ── Row 3: Alerts ──────────────────────────────────────── */}
        {(awaitingGRNs.length > 0 || lowStock.length > 0) && (
          <div className="flex flex-col gap-3">
            {awaitingGRNs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Clock size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {awaitingGRNs.length} GRN{awaitingGRNs.length > 1 ? 's' : ''} awaiting inspection / QC approval
                </span>
                <Link to="/stores/grn" className="ml-auto text-xs font-medium text-amber-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
            {lowStock.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <TrendingDown size={15} className="text-red-600 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800">
                  {lowStock.length} material{lowStock.length > 1 ? 's' : ''} at or below reorder level
                </span>
                <Link to="/stores/ledger" className="ml-auto text-xs font-medium text-red-700 underline whitespace-nowrap">View ledger →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Row 4: Three activity tables ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DashSection
            title="GRNs Awaiting Inspection"
            action={<Link to="/stores/grn" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All GRNs <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={grnCols} rows={awaitingGRNs.slice(0, 8)} empty="No GRNs pending ✅" loading={loadG} />
          </DashSection>

          <DashSection
            title="Open Requisitions (MRS)"
            action={<Link to="/stores/mrs" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All MRS <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={mrsCols} rows={openMRS.slice(0, 8)} empty="No open requisitions" loading={loadM} />
          </DashSection>

          <DashSection
            title="Recent Material Issues"
            action={<Link to="/stores/issue" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All Issues <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={issueCols} rows={recentIssues} empty="No issues recorded" loading={loadI} />
          </DashSection>
        </div>

        {/* ── Row 5: Low Stock table ───────────────────────────────── */}
        {lowStock.length > 0 && (
          <DashSection
            title={`Low Stock Items — ${lowStock.length} Material${lowStock.length > 1 ? 's' : ''} Need Reorder`}
            action={<Link to="/stores/ledger" className="text-xs text-red-600 flex items-center gap-1 hover:underline">Store Ledger <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={lowStockCols} rows={lowStock.slice(0, 15)} empty="All stock levels healthy" />
          </DashSection>
        )}

      </div>
    </div>
  );
}
