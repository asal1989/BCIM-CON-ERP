import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Gavel, Plus, Search, ChevronRight, X, FileText, Filter } from 'lucide-react';
import { bidOpportunityAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_LABEL = {
  prospect: 'Registered', pursuing: 'Pursuing', bid_prepared: 'Bid Ready',
  submitted: 'Submitted', won: 'Won', lost: 'Lost', dropped: 'No Bid',
};
const STATUS_COLORS = {
  prospect:     'bg-slate-100 text-slate-900 border border-slate-300',
  pursuing:     'bg-blue-50 text-blue-700 border border-blue-200',
  bid_prepared: 'bg-violet-50 text-violet-700 border border-violet-200',
  submitted:    'bg-amber-50 text-amber-700 border border-amber-200',
  won:          'bg-emerald-50 text-emerald-700 border border-emerald-200',
  lost:         'bg-red-50 text-red-700 border border-red-200',
  dropped:      'bg-slate-100 text-slate-900 font-medium border border-slate-200',
};

const CLIENT_TYPES = ['Government', 'PSU', 'Private', 'International'];
const CATEGORIES   = ['Works', 'Supply', 'EPC', 'Turnkey', 'Service'];
const SOURCES      = ['Direct Invite', 'Tender Portal', 'GeM', 'CPP Portal', 'Referral', 'Other'];
const SECTORS      = ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Institutional', 'Mixed Use', 'Other'];
const EMD_MODES    = ['DD', 'Bank Guarantee', 'Online Transfer', 'Exempted'];

const fmtCr = (n) => n != null ? `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtL  = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const KPI_STYLES = [
  { key: 'prospect',     label: 'Registered', numCls: 'text-slate-700',   bg: 'bg-slate-50' },
  { key: 'pursuing',     label: 'Pursuing',   numCls: 'text-blue-700',    bg: 'bg-blue-50' },
  { key: 'bid_prepared', label: 'Bid Ready',  numCls: 'text-violet-700',  bg: 'bg-violet-50' },
  { key: 'submitted',    label: 'Submitted',  numCls: 'text-amber-700',   bg: 'bg-amber-50' },
  { key: 'won',          label: 'Won',        numCls: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'lost',         label: 'Lost',       numCls: 'text-red-700',     bg: 'bg-red-50' },
];

export default function TenderRegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew]           = useState(false);
  const [form, setForm] = useState({
    client_tender_ref: '', client_name: '', project_name: '', project_location: '',
    client_type: 'Government', tender_category: 'Works', sector: 'Infrastructure',
    source: 'Tender Portal', bid_value: '', win_probability: 50,
    bid_submission_date: '', emd_required: false, emd_amount: '', emd_mode: 'DD',
    notice_inviting_tender: '',
  });

  const { data: statsData } = useQuery({
    queryKey: ['tender-mgmt-stats'],
    queryFn: () => bidOpportunityAPI.stats().then(r => r.data?.data ?? {}),
  });
  const stats = statsData || {};

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tender-mgmt-list', search, statusFilter],
    queryFn: () => bidOpportunityAPI.list({ search: search || undefined, status: statusFilter || undefined })
      .then(r => r.data?.data ?? []),
  });
  const tenders = listData || [];

  const createMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.create(d),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tender-mgmt-list'] });
      qc.invalidateQueries({ queryKey: ['tender-mgmt-stats'] });
      toast.success(`Tender ${r.data?.data?.opportunity_number} registered`);
      setShowNew(false);
      navigate(`/tender-management/${r.data?.data?.id}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to register tender'),
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-900 font-medium focus:outline-none focus:border-indigo-400 transition-all';
  const labelCls = 'block text-xs font-medium text-slate-900 font-medium mb-1';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <Gavel className="w-3.5 h-3.5" /> Tender Management
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Tender Register</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Track tenders received from clients — bid to win projects</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Register Tender
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
        {KPI_STYLES.map(k => (
          <div key={k.key}
            onClick={() => setStatusFilter(statusFilter === k.key ? '' : k.key)}
            className={`bg-white border rounded-xl p-4 text-center shadow-sm cursor-pointer transition-all hover:shadow-md
              ${statusFilter === k.key ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
            <div className={`text-2xl font-medium font-mono ${k.numCls}`}>{stats[k.key] ?? 0}</div>
            <div className="text-xs text-slate-900 font-medium mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-sm text-slate-500">Win Rate</span>
          <span className="text-xl font-medium text-emerald-600">{stats.win_rate_pct ?? 0}%</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-sm text-slate-500">Total Pipeline</span>
          <span className="text-sm font-medium text-black">{fmtCr(stats.total_pipeline_value)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-sm text-slate-500">Won Value</span>
          <span className="text-sm font-medium text-emerald-600">{fmtCr(stats.total_won_value)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
            placeholder="Search client, project, tender ref…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {[{ key: '', label: 'All' }, ...KPI_STYLES].map(k => (
            <button key={k.key}
              onClick={() => setStatusFilter(k.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${statusFilter === k.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{[1,2,3,4].map(n => <div key={n} className="h-14 bg-slate-100 animate-pulse rounded-lg" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Reg No.', 'Client Ref', 'Client', 'Project', 'Category', 'Type', 'Bid Value', 'EMD', 'Deadline', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenders.map(t => (
                <tr key={t.id}
                  onClick={() => navigate(`/tender-management/${t.id}`)}
                  className="border-b border-slate-100 hover:bg-indigo-50/40 cursor-pointer transition-colors group">
                  <td className="px-4 py-3 font-mono text-indigo-600 text-xs font-medium whitespace-nowrap">{t.opportunity_number}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{t.client_tender_ref || '—'}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium whitespace-nowrap">{t.client_name}</td>
                  <td className="px-4 py-3 text-slate-900 max-w-[180px] truncate">{t.project_name}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{t.tender_category || '—'}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{t.client_type || '—'}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium whitespace-nowrap">{fmtL(t.bid_value)}</td>
                  <td className="px-4 py-3">
                    {t.emd_required
                      ? <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.emd_submitted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {t.emd_submitted ? 'Paid' : 'Pending'}
                        </span>
                      : <span className="text-xs text-slate-300">N/A</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs whitespace-nowrap">
                    {t.bid_submission_date ? dayjs(t.bid_submission_date).format('DD MMM YY') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 group-hover:text-indigo-400 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && tenders.length === 0 && (
          <div className="py-20 text-center border-t border-slate-100">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-900 font-medium font-medium">No tenders registered yet</p>
            <p className="text-xs text-slate-900 font-medium mt-1">Click "Register Tender" to log a new tender notice</p>
          </div>
        )}
      </div>

      {/* Register Tender Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-medium text-slate-900">Register New Tender</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">Log a tender notice received from a client</p>
              </div>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Client's Tender Ref / NIT No.</label>
                <input value={form.client_tender_ref} onChange={e => setF('client_tender_ref', e.target.value)}
                  className={inputCls} placeholder="e.g. NIT/PWD/2025-26/001" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Client Name *</label>
                  <input value={form.client_name} onChange={e => setF('client_name', e.target.value)}
                    className={inputCls} placeholder="Client / Owner" />
                </div>
                <div>
                  <label className={labelCls}>Client Type</label>
                  <select value={form.client_type} onChange={e => setF('client_type', e.target.value)} className={inputCls}>
                    {CLIENT_TYPES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Project / Work Name *</label>
                <input value={form.project_name} onChange={e => setF('project_name', e.target.value)}
                  className={inputCls} placeholder="e.g. Construction of Road Bridge at NH-44" />
              </div>

              <div>
                <label className={labelCls}>Location</label>
                <input value={form.project_location} onChange={e => setF('project_location', e.target.value)}
                  className={inputCls} placeholder="State / District" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={form.tender_category} onChange={e => setF('tender_category', e.target.value)} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sector</label>
                  <select value={form.sector} onChange={e => setF('sector', e.target.value)} className={inputCls}>
                    {SECTORS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Source</label>
                  <select value={form.source} onChange={e => setF('source', e.target.value)} className={inputCls}>
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Est. Bid Value (₹)</label>
                  <input type="number" value={form.bid_value} onChange={e => setF('bid_value', e.target.value)}
                    className={inputCls} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Bid Submission Deadline</label>
                  <input type="date" value={form.bid_submission_date} onChange={e => setF('bid_submission_date', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Win Probability %</label>
                  <input type="number" min="0" max="100" value={form.win_probability} onChange={e => setF('win_probability', e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* EMD */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" id="emd_req" checked={form.emd_required} onChange={e => setF('emd_required', e.target.checked)} className="accent-indigo-600" />
                  <label htmlFor="emd_req" className="text-sm text-slate-900 font-medium">EMD Required</label>
                </div>
                {form.emd_required && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className={labelCls}>EMD Amount (₹)</label>
                      <input type="number" value={form.emd_amount} onChange={e => setF('emd_amount', e.target.value)} className={inputCls} placeholder="0" />
                    </div>
                    <div>
                      <label className={labelCls}>Mode</label>
                      <select value={form.emd_mode} onChange={e => setF('emd_mode', e.target.value)} className={inputCls}>
                        {EMD_MODES.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>NIT / Scope Summary</label>
                <textarea value={form.notice_inviting_tender} onChange={e => setF('notice_inviting_tender', e.target.value)}
                  className={`${inputCls} h-16 resize-none`}
                  placeholder="Brief scope / eligibility criteria from NIT…" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-lg text-sm hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                disabled={!form.client_name || !form.project_name || createMut.isPending}
                onClick={() => createMut.mutate({
                  client_name: form.client_name, project_name: form.project_name,
                  project_location: form.project_location || null,
                  client_tender_ref: form.client_tender_ref || null,
                  client_type: form.client_type, tender_category: form.tender_category,
                  sector: form.sector.toLowerCase().replace(/ /g, '_'),
                  source: form.source.toLowerCase().replace(/ /g, '_'),
                  bid_value: form.bid_value || null, win_probability: form.win_probability,
                  bid_submission_date: form.bid_submission_date || null,
                  emd_required: form.emd_required, emd_amount: form.emd_amount || null,
                  emd_mode: form.emd_required ? form.emd_mode : null,
                  notice_inviting_tender: form.notice_inviting_tender || null,
                })}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                {createMut.isPending ? 'Registering…' : 'Register Tender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
