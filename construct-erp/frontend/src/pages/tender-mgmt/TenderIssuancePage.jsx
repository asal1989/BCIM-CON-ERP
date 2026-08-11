// src/pages/tender-mgmt/TenderIssuancePage.jsx
// Section A — Tenders you ISSUE to vendors/subcontractors for packages of work
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Gavel, Plus, Search, ChevronRight, X, Filter, Tag, Building2,
  IndianRupee, Clock, CheckCircle2, AlertCircle, XCircle, FileText,
  Calendar, Users, BarChart3, Award, Loader2, Package,
} from 'lucide-react';
import { tenderAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  draft:      'Draft',
  published:  'Published',
  bid_open:   'Bid Open',
  evaluation: 'Evaluation',
  awarded:    'Awarded',
  cancelled:  'Cancelled',
};
const STATUS_COLORS = {
  draft:      'bg-slate-100 text-slate-900 border border-slate-200',
  published:  'bg-blue-50 text-blue-700 border border-blue-200',
  bid_open:   'bg-violet-50 text-violet-700 border border-violet-200',
  evaluation: 'bg-amber-50 text-amber-700 border border-amber-200',
  awarded:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled:  'bg-red-50 text-red-600 border border-red-200',
};

const TENDER_TYPES = ['works', 'supply', 'service', 'epc', 'turnkey'];
const fmtCr = (n) => n != null ? `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtL  = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const KPI_STYLES = [
  { key: 'draft',      label: 'Draft',      numCls: 'text-slate-700',   bg: 'bg-slate-50',   icon: FileText },
  { key: 'published',  label: 'Published',  numCls: 'text-blue-700',    bg: 'bg-blue-50',    icon: Tag },
  { key: 'bid_open',   label: 'Bid Open',   numCls: 'text-violet-700',  bg: 'bg-violet-50',  icon: Users },
  { key: 'evaluation', label: 'Evaluation', numCls: 'text-amber-700',   bg: 'bg-amber-50',   icon: BarChart3 },
  { key: 'awarded',    label: 'Awarded',    numCls: 'text-emerald-700', bg: 'bg-emerald-50', icon: Award },
  { key: 'cancelled',  label: 'Cancelled',  numCls: 'text-red-700',     bg: 'bg-red-50',     icon: XCircle },
];

// ── New Tender Form default ───────────────────────────────────────────────────
const NEW_DEFAULTS = {
  title: '', description: '', scope_of_work: '',
  tender_type: 'works', work_package: '', estimated_value: '',
  emd_required: false, emd_amount: '', publish_date: '',
  bid_close_date: '', pre_bid_date: '', bid_open_date: '',
  expected_start_date: '', contract_duration: '',
};

export default function TenderIssuancePage() {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [showNew, setShowNew]           = useState(false);
  const [form, setForm]                 = useState(NEW_DEFAULTS);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['ti-stats'],
    queryFn:  () => tenderAPI.stats().then(r => r.data?.data ?? {}),
  });
  const stats = statsData || {};

  const { data: listData, isLoading } = useQuery({
    queryKey: ['ti-list', search, statusFilter, typeFilter],
    queryFn: () => tenderAPI.list({
      search:      search      || undefined,
      status:      statusFilter|| undefined,
      tender_type: typeFilter  || undefined,
    }).then(r => r.data?.data ?? []),
  });
  const tenders = listData || [];

  // ── Create ──────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d) => tenderAPI.create(d),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ti-list'] });
      qc.invalidateQueries({ queryKey: ['ti-stats'] });
      const t = r.data?.data;
      toast.success(`Tender ${t?.tender_number} created`);
      setShowNew(false);
      setForm(NEW_DEFAULTS);
      navigate(`/tender-management/issue/${t?.id}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create tender'),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    createMut.mutate(form);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-cyan-700" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">Tender Issuance</h1>
            <p className="text-xs text-slate-500">Issue & manage tenders for work packages</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Tender
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {KPI_STYLES.map(k => {
            const Icon = k.icon;
            return (
              <button
                key={k.key}
                onClick={() => setStatusFilter(s => s === k.key ? '' : k.key)}
                className={`${k.bg} rounded-xl p-3 text-center border-2 transition-all ${
                  statusFilter === k.key ? 'border-cyan-400 shadow-sm scale-[1.02]' : 'border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 mx-auto mb-1 ${k.numCls}`} />
                <div className={`text-xl font-medium ${k.numCls}`}>{stats[k.key] ?? 0}</div>
                <div className="text-xs text-slate-900 font-medium font-medium">{k.label}</div>
              </button>
            );
          })}
        </div>

        {/* ── Value summary ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
              <IndianRupee className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-xs text-slate-900 font-medium uppercase tracking-wide">Total Estimated</p>
              <p className="text-lg font-medium text-black">{fmtCr(stats.total_estimated)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-900 font-medium uppercase tracking-wide">Total Awarded</p>
              <p className="text-lg font-medium text-emerald-700">{fmtCr(stats.total_awarded)}</p>
            </div>
          </div>
        </div>

        {/* ── Filters + Search ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenders..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="">All Types</option>
            {TENDER_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          {(search || statusFilter || typeFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); }}
              className="flex items-center gap-1 text-sm text-slate-900 font-medium hover:text-slate-900 px-2 py-2"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500">{tenders.length} tender{tenders.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Tender List ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
          </div>
        ) : tenders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <Gavel className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-900 font-medium font-medium">No tenders found</p>
            <p className="text-slate-900 font-medium text-sm mt-1">Click "New Tender" to issue your first tender</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tenders.map(t => (
              <div
                key={t.id}
                onClick={() => navigate(`/tender-management/issue/${t.id}`)}
                className="bg-white rounded-xl border border-slate-200 hover:border-cyan-300 hover:shadow-sm transition-all cursor-pointer p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Package className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-slate-500">{t.tender_number}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 capitalize border border-slate-200">
                        {t.tender_type}
                      </span>
                      {t.work_package && (
                        <span className="text-xs text-slate-400">· {t.work_package}</span>
                      )}
                    </div>
                    <h3 className="font-medium text-slate-900 font-medium truncate">{t.title}</h3>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      {t.project_name && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Building2 className="w-3.5 h-3.5" /> {t.project_name}
                        </span>
                      )}
                      {t.estimated_value && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <IndianRupee className="w-3.5 h-3.5" /> {fmtL(t.estimated_value)}
                        </span>
                      )}
                      {t.bid_close_date && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5" /> Close: {dayjs(t.bid_close_date).format('DD MMM YY')}
                        </span>
                      )}
                      {t.bid_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Users className="w-3.5 h-3.5" /> {t.bid_count} bid{t.bid_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {t.awarded_vendor_name && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <Award className="w-3.5 h-3.5" /> {t.awarded_vendor_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-900 font-medium flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Tender Modal ─────────────────────────────────────────────────── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-medium text-black">Issue New Tender</h2>
              <button onClick={() => setShowNew(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Tender title */}
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1">
                  Tender Title <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={e => setF('title', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  placeholder="e.g. Civil Works - Block A Foundation"
                />
              </div>

              {/* Type + Work Package */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Tender Type</label>
                  <select
                    value={form.tender_type}
                    onChange={e => setF('tender_type', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  >
                    {TENDER_TYPES.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Work Package</label>
                  <input
                    value={form.work_package}
                    onChange={e => setF('work_package', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="e.g. WP-03 Civil"
                  />
                </div>
              </div>

              {/* Estimated value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Estimated Value (₹)</label>
                  <input
                    type="number" min="0" step="1"
                    value={form.estimated_value}
                    onChange={e => setF('estimated_value', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Contract Duration (days)</label>
                  <input
                    type="number" min="1"
                    value={form.contract_duration}
                    onChange={e => setF('contract_duration', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="e.g. 180"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Pre-Bid Date</label>
                  <input
                    type="date" value={form.pre_bid_date}
                    onChange={e => setF('pre_bid_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Bid Close Date</label>
                  <input
                    type="date" value={form.bid_close_date}
                    onChange={e => setF('bid_close_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">Expected Start</label>
                  <input
                    type="date" value={form.expected_start_date}
                    onChange={e => setF('expected_start_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                </div>
              </div>

              {/* EMD */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input
                  type="checkbox" id="emd"
                  checked={form.emd_required}
                  onChange={e => setF('emd_required', e.target.checked)}
                  className="w-4 h-4 accent-cyan-600"
                />
                <label htmlFor="emd" className="text-sm text-slate-900 font-medium">EMD Required</label>
                {form.emd_required && (
                  <input
                    type="number" min="0"
                    value={form.emd_amount}
                    onChange={e => setF('emd_amount', e.target.value)}
                    className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="EMD Amount (₹)"
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1">Description / Scope Summary</label>
                <textarea
                  value={form.description}
                  onChange={e => setF('description', e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none"
                  placeholder="Brief description of the tender scope..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowNew(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createMut.isPending}
                  className="px-5 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center gap-2">
                  {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Tender
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
