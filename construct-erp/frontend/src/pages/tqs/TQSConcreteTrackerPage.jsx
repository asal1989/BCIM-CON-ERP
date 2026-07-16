// TQS Concrete Tracker — pour cards + RMC bills + DPR daily concrete
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers, FileText, BarChart3, Search, RefreshCw,
  CheckCircle2, Clock, XCircle, AlertTriangle, Droplet, FlaskConical,
  ClipboardCheck, Play, IndianRupee, Package, Calendar, TrendingUp,
} from 'lucide-react';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import dayjs from 'dayjs';

const inr = (v) => Math.round(Number(v || 0)).toLocaleString('en-IN');
const num = (v) => Number(v || 0);
const fmtDate = (d) => d ? dayjs(d).format('DD MMM YY') : '—';

const POUR_STATUS = {
  pre_pour:      { label: 'Pre-Pour',      cls: 'bg-slate-100 text-slate-600',     icon: ClipboardCheck },
  poured:        { label: 'Poured',        cls: 'bg-blue-100 text-blue-700',       icon: Droplet },
  curing:        { label: 'Curing',        cls: 'bg-cyan-100 text-cyan-700',       icon: Clock },
  certs_pending: { label: 'Certs Pending', cls: 'bg-amber-100 text-amber-700',     icon: FlaskConical },
  closed:        { label: 'Closed',        cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:      { label: 'Rejected',      cls: 'bg-red-100 text-red-700',         icon: XCircle },
};

const BILL_STATUS = {
  pending:          'bg-amber-100 text-amber-700',
  stores:           'bg-blue-100 text-blue-700',
  document_control: 'bg-cyan-100 text-cyan-700',
  qs:               'bg-emerald-100 text-emerald-700',
  accounts:         'bg-purple-100 text-purple-700',
  procurement:      'bg-orange-100 text-orange-700',
  qs_sign:          'bg-violet-100 text-violet-700',
  paid:             'bg-green-100 text-green-800',
};
const BILL_LABEL = {
  pending: 'Pending', stores: 'Stores', document_control: 'Doc Control',
  qs: 'QS Cert', accounts: 'Accounts', procurement: 'Procurement',
  qs_sign: 'QS Sign', paid: 'Paid',
};

function PourBadge({ status }) {
  const cfg = POUR_STATUS[status] || POUR_STATUS.pre_pour;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function KPI({ label, value, sub, color = 'indigo', icon: Icon }) {
  const clr = {
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    emerald:'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber:  'bg-amber-50 border-amber-100 text-amber-700',
    cyan:   'bg-cyan-50 border-cyan-100 text-cyan-700',
    red:    'bg-red-50 border-red-100 text-red-700',
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${clr[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</span>
        {Icon && <Icon className="w-4 h-4 opacity-50" />}
      </div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

const TABS = [
  { id: 'pour', label: 'Pour Cards', icon: Layers },
  { id: 'bills', label: 'RMC Bills', icon: FileText },
  { id: 'dpr',   label: 'DPR Daily',  icon: BarChart3 },
];

export default function TQSConcreteTrackerPage() {
  const today      = dayjs().format('YYYY-MM-DD');
  const sixMonthsAgo = dayjs().subtract(6, 'month').format('YYYY-MM-DD');

  const [projectId, setProjectId] = useState('');
  const [fromDate, setFromDate]   = useState(sixMonthsAgo);
  const [toDate, setToDate]       = useState(today);
  const [tab, setTab]             = useState('pour');
  const [search, setSearch]       = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['concrete-tracker', projectId, fromDate, toDate],
    queryFn: () => tqsBillsAPI.concreteTracker({
      project_id: projectId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }).then(r => r.data?.data ?? {}),
  });

  const pours   = data?.pour_cards ?? [];
  const bills   = data?.bills      ?? [];
  const dprData = data?.dpr_daily  ?? [];
  const summary = data?.summary    ?? {};

  const filteredPours = useMemo(() => {
    if (!search.trim()) return pours;
    const q = search.toLowerCase();
    return pours.filter(p =>
      (p.pour_card_number || '').toLowerCase().includes(q) ||
      (p.location        || '').toLowerCase().includes(q) ||
      (p.pour_description|| '').toLowerCase().includes(q) ||
      (p.concrete_grade  || '').toLowerCase().includes(q)
    );
  }, [pours, search]);

  const filteredBills = useMemo(() => {
    if (!search.trim()) return bills;
    const q = search.toLowerCase();
    return bills.filter(b =>
      (b.vendor_name || '').toLowerCase().includes(q) ||
      (b.inv_number  || '').toLowerCase().includes(q) ||
      (b.po_number   || '').toLowerCase().includes(q) ||
      (b.work_desc   || '').toLowerCase().includes(q)
    );
  }, [bills, search]);

  const totalDPRVol = dprData.reduce((s, r) => s + r.total_qty, 0);

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Concrete Tracker</h1>
            <p className="text-xs text-slate-500">Pour cards · RMC bills · DPR concrete consumption</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-40">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Project</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
        </div>
        <div className="flex-1 min-w-40 relative">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Search</label>
          <Search className="absolute left-2.5 top-7 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pour #, location, vendor…"
            className="w-full h-9 rounded-lg border border-slate-200 pl-8 pr-3 text-sm text-slate-800"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Total Pours"   value={summary.total_pours ?? '—'} color="indigo"  icon={Layers} />
        <KPI label="Vol Planned"   value={`${num(summary.total_volume_planned).toFixed(1)} m³`} color="cyan"   icon={Package} />
        <KPI label="Vol Actual"    value={`${num(summary.total_volume_actual).toFixed(1)} m³`}  color="blue"   icon={Droplet} sub={`DPR: ${totalDPRVol.toFixed(1)} m³`} />
        <KPI label="Closed Pours"  value={summary.pours_closed ?? '—'} color="emerald" icon={CheckCircle2} sub={`${summary.pours_active ?? 0} active`} />
        <KPI label="Total Billed"  value={`₹${inr(summary.total_billed)}`}  color="amber"  icon={IndianRupee} />
        <KPI label="Balance Due"   value={`₹${inr(summary.total_pending)}`} color="red"    icon={AlertTriangle} sub={`Paid: ₹${inr(summary.total_paid)}`} />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 px-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium
                ${tab === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {t.id === 'pour' ? filteredPours.length : t.id === 'bills' ? filteredBills.length : dprData.length}
              </span>
            </button>
          ))}
        </div>

        <div className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading…</div>
          ) : (
            <>
              {/* Pour Cards Tab */}
              {tab === 'pour' && (
                <div className="overflow-x-auto">
                  {filteredPours.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No pour cards found. Create them in Quality → Pour Cards.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                          <th className="px-4 py-3 text-left font-medium">Pour Card #</th>
                          <th className="px-4 py-3 text-left font-medium">Location / Description</th>
                          <th className="px-4 py-3 text-left font-medium">Type</th>
                          <th className="px-4 py-3 text-left font-medium">Grade</th>
                          <th className="px-4 py-3 text-right font-medium">Vol Plan (m³)</th>
                          <th className="px-4 py-3 text-right font-medium">Vol Actual (m³)</th>
                          <th className="px-4 py-3 text-left font-medium">Pour Date</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-center font-medium">Cubes</th>
                          <th className="px-4 py-3 text-left font-medium">Project</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPours.map(pc => (
                          <tr key={pc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                              {pc.pour_card_number || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-800 text-xs">{pc.location || '—'}</p>
                              {pc.pour_description && (
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-48">{pc.pour_description}</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 capitalize">{pc.pour_type?.replace(/_/g,' ') || '—'}</td>
                            <td className="px-4 py-2.5">
                              {pc.concrete_grade ? (
                                <span className="inline-block bg-cyan-50 text-cyan-700 border border-cyan-200 rounded px-2 py-0.5 text-[11px] font-bold">
                                  {pc.concrete_grade}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-slate-700">{num(pc.volume_planned).toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-medium text-slate-800">
                              {pc.volume_actual ? num(pc.volume_actual).toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                              {fmtDate(pc.actual_pour_start || pc.planned_pour_date)}
                            </td>
                            <td className="px-4 py-2.5"><PourBadge status={pc.status} /></td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-[11px] font-medium ${
                                num(pc.cube_pass_count) >= num(pc.cube_test_count) && num(pc.cube_test_count) > 0
                                  ? 'text-emerald-600' : 'text-amber-600'
                              }`}>
                                {pc.cube_pass_count ?? 0}/{pc.cube_test_count ?? 0}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-32">{pc.project_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={4} className="px-4 py-2 text-[11px] text-slate-500 font-medium">
                            {filteredPours.length} pour cards
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700">
                            {filteredPours.reduce((s, p) => s + num(p.volume_planned), 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700">
                            {filteredPours.reduce((s, p) => s + num(p.volume_actual), 0).toFixed(2)}
                          </td>
                          <td colSpan={4} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* RMC Bills Tab */}
              {tab === 'bills' && (
                <div className="overflow-x-auto">
                  {filteredBills.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No concrete-related bills found.<br />
                      Bills are matched by vendor name or work description containing "concrete", "RMC", or "ready mix".
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                          <th className="px-4 py-3 text-left font-medium">SL#</th>
                          <th className="px-4 py-3 text-left font-medium">Vendor</th>
                          <th className="px-4 py-3 text-left font-medium">Invoice #</th>
                          <th className="px-4 py-3 text-left font-medium">Inv Date</th>
                          <th className="px-4 py-3 text-left font-medium">PO #</th>
                          <th className="px-4 py-3 text-left font-medium">Work Desc</th>
                          <th className="px-4 py-3 text-right font-medium">Basic (₹)</th>
                          <th className="px-4 py-3 text-right font-medium">Total (₹)</th>
                          <th className="px-4 py-3 text-right font-medium">Paid (₹)</th>
                          <th className="px-4 py-3 text-right font-medium">Balance (₹)</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Project</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBills.map(b => (
                          <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500">{b.sl_number}</td>
                            <td className="px-4 py-2.5 text-xs font-medium text-slate-800 max-w-36 truncate">{(b.vendor_name || '').toUpperCase() || '—'}</td>
                            <td className="px-4 py-2.5 text-[11px] font-mono text-indigo-600">{b.inv_number || '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(b.inv_date)}</td>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500">{b.po_number || '—'}</td>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500 max-w-36 truncate" title={b.work_desc}>{b.work_desc || '—'}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-slate-700">{inr(b.basic_amount)}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-medium text-slate-800">{inr(b.total_amount)}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-emerald-700">{inr(b.paid_amount)}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-medium text-red-600">{inr(b.balance_to_pay)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${BILL_STATUS[b.workflow_status] || 'bg-slate-100 text-slate-500'}`}>
                                {BILL_LABEL[b.workflow_status] || b.workflow_status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-28">{b.project_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 font-medium">
                        <tr>
                          <td colSpan={6} className="px-4 py-2 text-[11px] text-slate-500">
                            {filteredBills.length} bills
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-slate-700">
                            {inr(filteredBills.reduce((s, b) => s + num(b.basic_amount), 0))}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-slate-800">
                            {inr(filteredBills.reduce((s, b) => s + num(b.total_amount), 0))}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-emerald-700">
                            {inr(filteredBills.reduce((s, b) => s + num(b.paid_amount), 0))}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-red-600">
                            {inr(filteredBills.reduce((s, b) => s + num(b.balance_to_pay), 0))}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* DPR Daily Tab */}
              {tab === 'dpr' && (
                <div className="overflow-x-auto">
                  {dprData.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No DPR concrete data found for the selected range.<br />
                      DPR data is entered in Planning → Daily Progress Report.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                          <th className="px-4 py-3 text-left font-medium">Date</th>
                          <th className="px-4 py-3 text-left font-medium">Grade Breakdown</th>
                          <th className="px-4 py-3 text-right font-medium">Total (m³)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dprData.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                              {fmtDate(r.report_date)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {r.grades.map((g, j) => (
                                  <span key={j} className="inline-flex items-center gap-1 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded px-2 py-0.5 text-[11px]">
                                    <span className="font-bold">{g.grade}</span>
                                    <span className="opacity-70">·</span>
                                    <span>{Number(g.qty).toFixed(2)} m³</span>
                                    {g.supplier && <span className="opacity-60 text-[10px]">({g.supplier})</span>}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-800">
                              {num(r.total_qty).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 font-medium">
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-[11px] text-slate-500">{dprData.length} days</td>
                          <td className="px-4 py-2 text-right text-xs text-slate-800">{totalDPRVol.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
