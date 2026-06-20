// src/pages/dashboards/StoresDashboard.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Truck, ClipboardList, AlertTriangle, PackageCheck, Clock, Plus,
  ArrowUpRight, Boxes, FileText, ChevronRight,
} from 'lucide-react';
import { ignAPI, mrsAPI, minAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// ── Status maps ────────────────────────────────────────────────────────────────
const MRS_CLS = {
  pending:         'bg-amber-100 text-amber-700 border border-amber-200',
  stores_verified: 'bg-sky-100 text-sky-700 border border-sky-200',
  verified_tower:  'bg-sky-100 text-sky-700 border border-sky-200',
  approved_pm:     'bg-indigo-100 text-indigo-700 border border-indigo-200',
  approved_srpm:   'bg-indigo-100 text-indigo-700 border border-indigo-200',
  approved_mgmt:   'bg-violet-100 text-violet-700 border border-violet-200',
  approved_md:     'bg-emerald-100 text-emerald-700 border border-emerald-200',
  issued:          'bg-teal-100 text-teal-700 border border-teal-200',
  rejected:        'bg-red-100 text-red-700 border border-red-200',
};
const MRS_LABEL = {
  pending:         'Pending',
  stores_verified: 'Stores ✓',
  verified_tower:  'Tower ✓',
  approved_pm:     'PM Approved',
  approved_srpm:   'Sr PM Apvd',
  approved_mgmt:   'Mgmt Approved',
  approved_md:     'MD Approved',
  issued:          'Issued',
  rejected:        'Rejected',
};
const GRN_CLS = {
  pending:         'bg-amber-100 text-amber-700 border border-amber-200',
  verified_stores: 'bg-sky-100 text-sky-700 border border-sky-200',
  approved:        'bg-emerald-100 text-emerald-700 border border-emerald-200',
  rejected:        'bg-red-100 text-red-700 border border-red-200',
};

// ── MRS Workflow stages to track ───────────────────────────────────────────────
const MRS_STAGES = [
  { key: 'pending',                  label: 'Pending',      short: 'Pending',     dot: '#f59e0b' },
  { key: 'stores_verified',          label: 'Stores Appvd', short: 'Stores',      dot: '#0ea5e9' },
  { key: 'approved_pm',              label: 'PM Approved',  short: 'PM',          dot: '#6366f1' },
  { key: 'approved_mgmt',            label: 'Mgmt Appvd',   short: 'Mgmt',        dot: '#8b5cf6' },
  { key: 'approved_md',              label: 'MD Approved',  short: 'MD',          dot: '#10b981' },
  { key: 'issued',                   label: 'Issued',       short: 'Issued',      dot: '#14b8a6' },
];

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, gradient, loading }) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]" style={{ background: gradient }} />
      <div className="relative p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: gradient }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          {loading
            ? <div className="h-7 w-16 bg-slate-100 rounded animate-pulse mb-1" />
            : <p className="text-2xl font-bold text-slate-800 leading-tight">{value ?? 0}</p>
          }
          <p className="text-xs font-semibold text-slate-600 mt-0.5 leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Workflow dot tracker ───────────────────────────────────────────────────────
function MRSWorkflowBar({ mrs }) {
  const counts = {};
  MRS_STAGES.forEach(s => { counts[s.key] = 0; });
  mrs.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });

  return (
    <div className="flex items-center gap-0 w-full">
      {MRS_STAGES.map((s, idx) => (
        <React.Fragment key={s.key}>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="relative">
              <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm font-bold transition-all"
                style={counts[s.key] > 0
                  ? { background: s.dot, borderColor: s.dot, color: '#fff' }
                  : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' }
                }>
                {counts[s.key] > 0 ? counts[s.key] : idx + 1}
              </div>
              {counts[s.key] > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                </span>
              )}
            </div>
            <span className={`text-[9px] font-semibold text-center leading-tight ${counts[s.key] > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
              {s.short}
            </span>
          </div>
          {idx < MRS_STAGES.length - 1 && (
            <div className="h-[2px] flex-1 rounded-full bg-slate-100 mx-1 mb-4" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Inventory Category Pills ───────────────────────────────────────────────────
function InventoryCategoryBar({ inventory }) {
  const catCount = {};
  inventory.forEach(i => {
    const cat = i.category || 'Other';
    catCount[cat] = (catCount[cat] || 0) + 1;
  });
  const cats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = inventory.length;

  const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444'];
  return (
    <div className="space-y-2">
      {cats.map(([cat, count], i) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={cat} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
            <span className="text-[11px] text-slate-600 flex-1 truncate font-medium">{cat}</span>
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i] }} />
            </div>
            <span className="text-[11px] font-bold text-slate-500 w-5 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function StoresDashboard() {
  const { user } = useAuthStore();

  const { data: grns = [], isLoading: loadG } = useQuery({
    queryKey: ['stores-dash-igns'],
    queryFn: () => ignAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 60000,
  });
  const { data: mrs = [], isLoading: loadM } = useQuery({
    queryKey: ['stores-dash-mrs'],
    queryFn: () => mrsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 60000,
  });
  const { data: issues = [], isLoading: loadI } = useQuery({
    queryKey: ['stores-dash-issues'],
    queryFn: () => minAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 60000,
  });
  const { data: inventory = [], isLoading: loadInv } = useQuery({
    queryKey: ['stores-dash-inventory'],
    queryFn: () => inventoryAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 60000,
  });

  const now = dayjs();
  const hour = now.hour();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // IGN (replaces GRN)
  const grnThisMonth = grns.filter(g => dayjs(g.date_time || g.created_at).isSame(now, 'month'));
  const pendingGRNs  = grns.filter(g => g.status === 'pending');
  const inspectedGRNs = grns.filter(g => g.status === 'inspected');
  const awaitingGRNs = [...pendingGRNs, ...inspectedGRNs];

  // MRS
  const MRS_CLOSED      = ['issued', 'rejected', 'draft'];
  const MRS_IN_APPROVAL = ['stores_verified', 'verified_tower', 'approved_pm', 'approved_srpm', 'approved_mgmt', 'approved_md'];
  const openMRS    = mrs.filter(m => !MRS_CLOSED.includes(m.status));
  const pendingMRS = mrs.filter(m => m.status === 'pending');
  const inApproval = mrs.filter(m => MRS_IN_APPROVAL.includes(m.status));
  const issuedMRS  = mrs.filter(m => m.status === 'issued');
  const recentMRS  = [...mrs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  // Issues
  const thisMonthIssues = issues.filter(i => dayjs(i.issue_date || i.created_at).isSame(now, 'month'));
  const recentIssues    = [...issues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  // Inventory
  const lowStock   = inventory.filter(i => {
    const c = parseFloat(i.closing_stock ?? i.current_stock ?? 0);
    const m = parseFloat(i.min_stock ?? i.reorder_level ?? 0);
    return m > 0 && c <= m;
  });
  const outOfStock = inventory.filter(i => parseFloat(i.closing_stock ?? i.current_stock ?? 0) <= 0);

  const isLoading = loadG || loadM || loadI || loadInv;

  return (
    <div className="min-h-screen" style={{ background: '#f0f4f8' }}>

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0a2057 0%, #1e3a8a 60%, #1d4ed8 100%)' }} className="px-6 pt-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-blue-200 text-sm font-medium">{greeting}, {user?.name?.split(' ')[0] || 'User'}</p>
              <h1 className="text-white text-2xl font-bold mt-0.5">Stores Dashboard</h1>
              <p className="text-blue-300 text-xs mt-1">{now.format('dddd, D MMMM YYYY')} · BCIM Engineering</p>
            </div>
            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/stores/mrs"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Plus className="w-3.5 h-3.5" /> New MRS
              </Link>
              <Link to="/stores/ign"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Plus className="w-3.5 h-3.5" /> New IGN
              </Link>
              <Link to="/stores/issue"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Plus className="w-3.5 h-3.5" /> New Issue
              </Link>
            </div>
          </div>

          {/* KPI Strip inside header */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
            {[
              { icon: ClipboardList, label: 'Open MRS',          value: openMRS.length,          bg: 'rgba(255,255,255,0.1)',   border: 'rgba(255,255,255,0.2)' },
              { icon: Clock,         label: 'In Approval',        value: inApproval.length,        bg: 'rgba(245,158,11,0.25)',  border: 'rgba(245,158,11,0.4)' },
              { icon: PackageCheck,  label: 'Issued',             value: issuedMRS.length,         bg: 'rgba(16,185,129,0.2)',   border: 'rgba(16,185,129,0.35)' },
              { icon: Truck,         label: 'IGNs Pending Approval', value: awaitingGRNs.length,    bg: 'rgba(255,255,255,0.1)',  border: 'rgba(255,255,255,0.2)' },
              { icon: ArrowUpRight,  label: 'Issues This Month',  value: thisMonthIssues.length,   bg: 'rgba(255,255,255,0.1)',  border: 'rgba(255,255,255,0.2)' },
              { icon: AlertTriangle, label: 'Low Stock Alerts',   value: lowStock.length,          bg: lowStock.length > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)', border: lowStock.length > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)' },
            ].map(({ icon: Icon, label, value, bg, border }) => (
              <div key={label} className="rounded-xl p-3 flex items-center gap-2"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <Icon className="w-4 h-4 text-white/70 flex-shrink-0" />
                <div>
                  <p className="text-white text-lg font-bold leading-none">{isLoading ? '—' : value}</p>
                  <p className="text-white/60 text-[10px] font-medium mt-0.5 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-4 pb-8 space-y-5">

        {/* ── Row 1: MRS Workflow + Recent MRS ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* MRS Workflow tracker */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800">MRS Pipeline</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{mrs.length} total requisitions</p>
              </div>
              <Link to="/stores/mrs" className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5 hover:text-indigo-800">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <MRSWorkflowBar mrs={mrs} />

            {/* Stage counts below */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="bg-amber-50 rounded-xl p-2.5 text-center border border-amber-100">
                <p className="text-xl font-bold text-amber-700">{pendingMRS.length}</p>
                <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Pending</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-2.5 text-center border border-indigo-100">
                <p className="text-xl font-bold text-indigo-700">{inApproval.length}</p>
                <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">In Approval</p>
              </div>
              <div className="bg-teal-50 rounded-xl p-2.5 text-center border border-teal-100">
                <p className="text-xl font-bold text-teal-700">{issuedMRS.length}</p>
                <p className="text-[10px] text-teal-600 font-semibold mt-0.5">Issued</p>
              </div>
            </div>
          </div>

          {/* Recent MRS list */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Recent Material Requisitions</h3>
              <Link to="/stores/mrs" className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5 hover:text-indigo-800">
                All MRS <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {loadM ? (
              <div className="p-5 space-y-3">
                {[1,2,3].map(n => (
                  <div key={n} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentMRS.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No requisitions yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentMRS.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 font-mono">
                          {m.serial_no_formatted || m.mrs_number}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${MRS_CLS[m.status] || 'bg-slate-100 text-slate-600'}`}>
                          {MRS_LABEL[m.status] || m.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-slate-500 truncate">{m.project_name || '—'}</span>
                        <span className="text-slate-200">·</span>
                        <span className="text-[11px] text-slate-400">{dayjs(m.created_at).fromNow()}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium flex-shrink-0">
                      {(m.items?.length || 0)} item{m.items?.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: IGN + Issues + Inventory ───────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* IGN card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Truck className="w-3.5 h-3.5 text-teal-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">IGN Status</h3>
              </div>
              <Link to="/stores/ign" className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5">
                View <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-5">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{grns.length}</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Total IGNs</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{awaitingGRNs.length}</p>
                  <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Awaiting Approval</p>
                </div>
              </div>
              {/* Stage breakdown */}
              <div className="space-y-2">
                {[
                  { label: 'Pending',    value: pendingGRNs.length,    color: '#f59e0b' },
                  { label: 'Inspected',  value: inspectedGRNs.length,  color: '#0ea5e9' },
                  { label: 'Approved',   value: grns.filter(g => g.status === 'approved').length, color: '#10b981' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-slate-600 flex-1 font-medium">{label}</span>
                    <span className="text-xs font-bold text-slate-700">{value}</span>
                  </div>
                ))}
              </div>
              {awaitingGRNs.length > 0 && (
                <Link to="/stores/ign"
                  className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                  <Clock className="w-3.5 h-3.5" /> Review {awaitingGRNs.length} Pending
                </Link>
              )}
            </div>
          </div>

          {/* Material Issues card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Material Issues</h3>
              </div>
              <Link to="/stores/issue" className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5">
                View <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{issues.length}</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Total Issues</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{thisMonthIssues.length}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">This Month</p>
                </div>
              </div>
              {loadI ? (
                <div className="space-y-2">
                  {[1,2,3].map(n => <div key={n} className="h-8 bg-slate-50 rounded-lg animate-pulse" />)}
                </div>
              ) : recentIssues.length === 0 ? (
                <div className="text-center py-6">
                  <PackageCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No material issues recorded</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentIssues.map(i => (
                    <div key={i.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 font-mono truncate">{i.min_number || '—'}</p>
                        <p className="text-[10px] text-slate-400 truncate">{i.project_name || i.issued_to || '—'}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{dayjs(i.issue_date || i.created_at).format('DD MMM')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Inventory Health card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Boxes className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Inventory</h3>
              </div>
              <Link to="/stores/ledger" className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5">
                Ledger <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <p className="text-xl font-bold text-slate-800">{inventory.length}</p>
                  <p className="text-[9px] text-slate-500 font-semibold mt-0.5">Total Items</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${lowStock.length > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <p className={`text-xl font-bold ${lowStock.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{lowStock.length}</p>
                  <p className="text-[9px] text-slate-500 font-semibold mt-0.5">Low Stock</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${outOfStock.length > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <p className={`text-xl font-bold ${outOfStock.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>{outOfStock.length}</p>
                  <p className="text-[9px] text-slate-500 font-semibold mt-0.5">Out of Stock</p>
                </div>
              </div>
              {loadInv ? (
                <div className="space-y-2">
                  {[1,2,3,4].map(n => <div key={n} className="h-5 bg-slate-50 rounded animate-pulse" />)}
                </div>
              ) : (
                <InventoryCategoryBar inventory={inventory} />
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Low Stock Alert ─────────────────────────────────── */}
        {lowStock.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Low Stock Alert — {lowStock.length} item{lowStock.length > 1 ? 's' : ''} need reorder
                </h3>
              </div>
              <Link to="/stores/ledger" className="text-[11px] text-red-600 font-semibold flex items-center gap-0.5">
                Store Ledger <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Material','Category','In Stock','Min Level','Unit'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lowStock.slice(0, 12).map((item, i) => (
                    <tr key={i} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">{item.material_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{item.category || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-red-600 font-mono">
                        {parseFloat(item.closing_stock ?? item.current_stock ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">
                        {parseFloat(item.min_stock ?? item.reorder_level ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-400 uppercase font-semibold">{item.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Row 4: Quick Links ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/stores/mrs',    icon: ClipboardList, label: 'Material Requisitions', sub: `${openMRS.length} open`,          color: '#4f46e5' },
            { to: '/stores/ign',    icon: Truck,         label: 'Inward Goods Notes',    sub: `${grns.length} total`,            color: '#0891b2' },
            { to: '/stores/issue',  icon: ArrowUpRight,  label: 'Material Issues',        sub: `${issues.length} total`,          color: '#059669' },
            { to: '/stores/ledger', icon: Boxes,         label: 'Store Ledger',           sub: `${inventory.length} materials`,   color: '#7c3aed' },
          ].map(({ to, icon: Icon, label, sub, color }) => (
            <Link key={to} to={to}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}15` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 leading-tight">{label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
