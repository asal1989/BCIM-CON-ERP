import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Download, ClipboardList, Building2, AlertCircle, Search,
  Package, ShoppingCart, CheckCircle2, Clock,
} from 'lucide-react';
import { mrsAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

/* ── MR status pills (mirrors MRSPage STATUS_CONFIG, condensed) ── */
const MR_STATUS = {
  pending:         { label: 'Pending',     bg: 'bg-yellow-100',  text: 'text-yellow-800'  },
  stores_verified: { label: 'Store Mgr',   bg: 'bg-orange-100',  text: 'text-orange-800'  },
  verified_tower:  { label: 'Store Mgr',   bg: 'bg-orange-100',  text: 'text-orange-800'  },
  approved_pm:     { label: 'PM ✓',        bg: 'bg-emerald-100', text: 'text-emerald-800' },
  approved_srpm:   { label: 'PM ✓',        bg: 'bg-emerald-100', text: 'text-emerald-800' },
  approved_mgmt:   { label: 'Director ✓',  bg: 'bg-indigo-100',  text: 'text-indigo-800'  },
  approved_md:     { label: 'MD ✓',        bg: 'bg-green-100',   text: 'text-green-800'   },
  issued:          { label: 'Issued',      bg: 'bg-sky-100',     text: 'text-sky-800'     },
  rejected:        { label: 'Rejected',    bg: 'bg-red-100',     text: 'text-red-800'     },
};

/* ── PO-coverage state per line item ── */
const ORDER_CFG = {
  none:     { label: 'Not Ordered', bg: 'bg-slate-100',  text: 'text-slate-600'  },
  partial:  { label: 'Partial PO',  bg: 'bg-orange-100', text: 'text-orange-800' },
  full:     { label: 'Fully Ordered', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  excluded: { label: 'Excluded',    bg: 'bg-red-50',     text: 'text-red-500'    },
};

const fmtQty  = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
};

/* ── per-item derivations ── */
const reqQty  = (it) => Number(it.quantity ?? 0);
const effQty  = (it) => (it.md_included === false ? 0 : Number(it.md_approved_qty ?? it.quantity ?? 0));
const ordQty  = (it) => Number(it.ordered_qty ?? 0);
const balQty  = (it) => Math.max(effQty(it) - ordQty(it), 0);
const lineVal = (it) => (Number(it.est_rate ?? 0) * effQty(it));
function orderState(it) {
  if (it.md_included === false) return 'excluded';
  const eff = effQty(it), ord = ordQty(it);
  if (ord <= 0) return 'none';
  if (ord + 0.0001 < eff) return 'partial';
  return 'full';
}
const normMat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();

const TH = ({ children, right }) => (
  <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);
const TD = ({ children, right, bold, mono, className = '' }) => (
  <td className={`px-3 py-2 text-sm ${right ? 'text-right' : 'text-left'} ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'} ${mono ? 'font-mono text-xs' : ''} ${className}`}>{children}</td>
);

function Pill({ cfg }) {
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

export default function MRRegisterPage() {
  const { selectedProjectId } = useAuthStore();
  const [projectId, setProjectId] = useState(selectedProjectId || '');
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [tab, setTab]     = useState('items');
  const [statusFilter, setStatusFilter] = useState('all');
  const [coverage, setCoverage] = useState('all');   // all | none | partial | full
  const [search, setSearch] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  const { data: mrData = [], isLoading } = useQuery({
    queryKey: ['mr-register', projectId],
    queryFn: () => mrsAPI.list({ project_id: projectId || undefined }).then(r => r.data?.data ?? r.data ?? []),
  });

  /* ── filtered MR set ── */
  const mrs = useMemo(() => {
    const f = from ? new Date(from).getTime() : null;
    const t = to ? new Date(to).getTime() + 86400000 : null;
    const needle = search.trim().toLowerCase();
    return mrData.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      const d = new Date(m.request_date || m.created_at).getTime();
      if (f && d < f) return false;
      if (t && d >= t) return false;
      if (needle) {
        const itemText = (m.items || []).map(i => i.material_name || '').join(' ');
        const hay = [m.serial_no_formatted, m.mrs_number, m.project_name, m.department, m.raised_by_name, itemText].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [mrData, statusFilter, from, to, search]);

  /* ── flat line items (with PO tracking) ── */
  const lineItems = useMemo(() => {
    const rows = [];
    for (const m of mrs) {
      for (const it of (m.items || [])) {
        const st = orderState(it);
        if (coverage !== 'all' && st !== coverage) continue;
        rows.push({
          mr_no: m.serial_no_formatted || m.mrs_number,
          mr_date: m.request_date || m.created_at,
          project_name: m.project_name,
          department: m.department,
          mr_status: m.status,
          material: it.material_name,
          item_code: it.item_code,
          unit: it.unit,
          req: reqQty(it), eff: effQty(it), ordered: ordQty(it), balance: balQty(it),
          value: lineVal(it), order_state: st,
        });
      }
    }
    return rows;
  }, [mrs, coverage]);

  /* ── per-MR roll-up ── */
  const mrSummary = useMemo(() => mrs.map(m => {
    const items = m.items || [];
    const req = items.reduce((s, it) => s + reqQty(it), 0);
    const eff = items.reduce((s, it) => s + effQty(it), 0);
    const ord = items.reduce((s, it) => s + ordQty(it), 0);
    return {
      ...m,
      mr_no: m.serial_no_formatted || m.mrs_number,
      itemCount: items.length,
      reqTotal: req, effTotal: eff, orderedTotal: ord,
      balanceTotal: Math.max(eff - ord, 0),
    };
  }), [mrs]);

  /* ── material roll-up ── */
  const materialSummary = useMemo(() => {
    const map = {};
    for (const m of mrs) {
      for (const it of (m.items || [])) {
        if (it.md_included === false) continue;
        const key = normMat(it.material_name);
        if (!key) continue;
        if (!map[key]) map[key] = { material: it.material_name, unit: it.unit, req: 0, ordered: 0, mrs: new Set() };
        map[key].req     += effQty(it);
        map[key].ordered += ordQty(it);
        map[key].mrs.add(m.id);
      }
    }
    return Object.values(map).map(v => ({
      ...v, mrCount: v.mrs.size,
      balance: Math.max(v.req - v.ordered, 0),
      coverage: v.req > 0 ? Math.min((v.ordered / v.req) * 100, 100) : 0,
    })).sort((a, b) => b.balance - a.balance);
  }, [mrs]);

  /* ── KPIs ── */
  const allLines = useMemo(() => {
    let none = 0, partial = 0, full = 0, excluded = 0;
    for (const m of mrs) for (const it of (m.items || [])) {
      const s = orderState(it);
      if (s === 'none') none++; else if (s === 'partial') partial++; else if (s === 'full') full++; else excluded++;
    }
    return { total: none + partial + full + excluded, none, partial, full, excluded };
  }, [mrs]);

  const handleExport = () => {
    if (!lineItems.length && !mrSummary.length) return toast.error('Nothing to export');
    const wb = XLSX.utils.book_new();
    const sumSheet = XLSX.utils.json_to_sheet(mrSummary.map(m => ({
      'MR No': m.mr_no, 'Date': fmtDate(m.mr_date), 'Project': m.project_name, 'Department': m.department,
      'Items': m.itemCount, 'Req Qty': m.reqTotal, 'Approved Qty': m.effTotal,
      'Ordered (PO)': m.orderedTotal, 'Balance': m.balanceTotal,
      'Priority': m.priority, 'Status': (MR_STATUS[m.status] || {}).label || m.status, 'Has PO': m.has_po ? 'Yes' : 'No',
    })));
    const itemSheet = XLSX.utils.json_to_sheet(lineItems.map(r => ({
      'MR No': r.mr_no, 'Date': fmtDate(r.mr_date), 'Project': r.project_name,
      'Item Code': r.item_code || '', 'Material': r.material, 'UOM': r.unit,
      'Req Qty': r.req, 'Approved Qty': r.eff, 'Ordered (PO)': r.ordered, 'Balance': r.balance,
      'PO Coverage': (ORDER_CFG[r.order_state] || {}).label, 'MR Status': (MR_STATUS[r.mr_status] || {}).label || r.mr_status,
    })));
    XLSX.utils.book_append_sheet(wb, sumSheet, 'MR Summary');
    XLSX.utils.book_append_sheet(wb, itemSheet, 'Line Item Tracking');
    const proj = projects.find(p => p.id === projectId);
    XLSX.writeFile(wb, `MR_Register_${proj?.project_code || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel downloaded');
  };

  const selectedProject = projects.find(p => p.id === projectId);

  const KPI = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-4 h-4" /></div>
      <div>
        <p className="text-lg font-bold text-slate-900 leading-none tabular-nums">{value}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">MR Register</h1>
              <p className="text-xs text-slate-500">Material requisitions — line items tracked against POs</p>
            </div>
          </div>

          <select
            className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 min-w-[190px]"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400"
            value={from} onChange={e => setFrom(e.target.value)} title="From date" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400"
            value={to} onChange={e => setTo(e.target.value)} title="To date" />

          <div className="ml-auto flex gap-2">
            <button onClick={handleExport}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Download className="w-4 h-4" /> Download Excel
            </button>
          </div>
        </div>

        {/* filters row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search MR, material, project…"
              className="h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 w-64" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-8 pl-2 pr-7 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400">
            <option value="all">All MR statuses</option>
            {Object.entries(MR_STATUS).filter(([k]) => !['verified_tower', 'approved_srpm'].includes(k)).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 ml-1">
            {[['all', 'All'], ['none', 'Not Ordered'], ['partial', 'Partial'], ['full', 'Fully Ordered']].map(([v, l]) => (
              <button key={v} onClick={() => setCoverage(v)}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors ${coverage === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                {l}
              </button>
            ))}
          </div>
          {selectedProject && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 className="w-3.5 h-3.5" />
              <span className="font-medium text-slate-700">{selectedProject.name}</span>
              <span>·</span><span>{selectedProject.project_code}</span>
            </span>
          )}
        </div>

        {/* KPI strip */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <KPI icon={ClipboardList} label="Requisitions"   value={mrs.length}        color="bg-indigo-50 text-indigo-600" />
          <KPI icon={Package}       label="Line Items"     value={allLines.total}    color="bg-slate-100 text-slate-600" />
          <KPI icon={Clock}         label="Not Ordered"    value={allLines.none}     color="bg-amber-50 text-amber-600" />
          <KPI icon={ShoppingCart}  label="Partially PO'd" value={allLines.partial}  color="bg-orange-50 text-orange-600" />
          <KPI icon={CheckCircle2}  label="Fully Ordered"  value={allLines.full}     color="bg-emerald-50 text-emerald-600" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200 bg-white px-6">
        {[
          { id: 'items',     label: 'Line Item Tracking', count: lineItems.length },
          { id: 'summary',   label: 'MR Summary',         count: mrSummary.length },
          { id: 'materials', label: 'Material Summary',   count: materialSummary.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`mr-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20 text-slate-400 text-sm">Loading…</div>
        ) : mrs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ClipboardList className="w-10 h-10 mb-3" />
            <p className="text-sm">No material requisitions found</p>
            <p className="text-xs mt-1">Adjust the project, date range, or filters above</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">

              {/* ── Line Item Tracking ── */}
              {tab === 'items' && (
                <table className="w-full text-left border-collapse min-w-[1080px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>MR No</TH><TH>Date</TH><TH>Material</TH><TH>UOM</TH>
                      <TH right>Req Qty</TH><TH right>Approved</TH><TH right>Ordered (PO)</TH><TH right>Balance</TH>
                      <TH>PO Coverage</TH><TH>MR Status</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD mono bold>{r.mr_no}</TD>
                        <TD>{fmtDate(r.mr_date)}</TD>
                        <TD bold className={r.order_state === 'excluded' ? 'line-through text-slate-400' : ''}>
                          {r.material}
                          {r.item_code && <span className="ml-1.5 text-[10px] font-mono text-slate-400">{r.item_code}</span>}
                        </TD>
                        <TD>{r.unit}</TD>
                        <TD right>{fmtQty(r.req)}</TD>
                        <TD right className="text-slate-600">{fmtQty(r.eff)}</TD>
                        <TD right className="text-purple-700 font-semibold">{r.ordered > 0 ? fmtQty(r.ordered) : '—'}</TD>
                        <TD right className={r.balance > 0 ? 'text-orange-600 font-semibold' : 'text-emerald-600 font-semibold'}>{fmtQty(r.balance)}</TD>
                        <TD><Pill cfg={ORDER_CFG[r.order_state]} /></TD>
                        <TD><Pill cfg={MR_STATUS[r.mr_status] || MR_STATUS.pending} /></TD>
                      </tr>
                    ))}
                    {lineItems.length === 0 && (
                      <tr><td colSpan={10} className="py-12 text-center text-sm text-slate-400">No line items match the current filters</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* ── MR Summary ── */}
              {tab === 'summary' && (
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>MR No</TH><TH>Date</TH><TH>Project / Dept</TH><TH right>Items</TH>
                      <TH right>Req Qty</TH><TH right>Approved</TH><TH right>Ordered (PO)</TH><TH right>Balance</TH>
                      <TH>Status</TH><TH>PO</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mrSummary.map((m, idx) => (
                      <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD mono bold>{m.mr_no}</TD>
                        <TD>{fmtDate(m.mr_date)}</TD>
                        <TD>
                          <span className="font-medium text-slate-800">{m.project_name || '—'}</span>
                          <span className="block text-[11px] text-slate-400">{m.department || '—'}</span>
                        </TD>
                        <TD right>{m.itemCount}</TD>
                        <TD right>{fmtQty(m.reqTotal)}</TD>
                        <TD right className="text-slate-600">{fmtQty(m.effTotal)}</TD>
                        <TD right className="text-purple-700 font-semibold">{m.orderedTotal > 0 ? fmtQty(m.orderedTotal) : '—'}</TD>
                        <TD right className={m.balanceTotal > 0 ? 'text-orange-600 font-semibold' : 'text-emerald-600 font-semibold'}>{fmtQty(m.balanceTotal)}</TD>
                        <TD><Pill cfg={MR_STATUS[m.status] || MR_STATUS.pending} /></TD>
                        <TD>{m.has_po
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700"><ShoppingCart className="w-3 h-3" /> Yes</span>
                          : <span className="text-[10px] text-slate-400">—</span>}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ── Material Summary ── */}
              {tab === 'materials' && (
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <TH>Material</TH><TH>UOM</TH><TH right># MRs</TH>
                      <TH right>Total Req</TH><TH right>Ordered (PO)</TH><TH right>Balance</TH><TH>Coverage</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materialSummary.map((v, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <TD bold>{v.material}</TD>
                        <TD>{v.unit}</TD>
                        <TD right>{v.mrCount}</TD>
                        <TD right>{fmtQty(v.req)}</TD>
                        <TD right className="text-purple-700 font-semibold">{v.ordered > 0 ? fmtQty(v.ordered) : '—'}</TD>
                        <TD right className={v.balance > 0 ? 'text-orange-600 font-semibold' : 'text-emerald-600 font-semibold'}>{fmtQty(v.balance)}</TD>
                        <TD>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${v.coverage >= 100 ? 'bg-emerald-500' : v.coverage > 0 ? 'bg-orange-400' : 'bg-slate-300'}`} style={{ width: `${v.coverage}%` }} />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 w-9 text-right">{Math.round(v.coverage)}%</span>
                          </div>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
