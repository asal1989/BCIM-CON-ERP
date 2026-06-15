import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Gavel, Plus, Search, Filter, FileText, ChevronRight, X } from 'lucide-react';
import { tenderAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_COLORS = {
  draft:       'bg-slate-700 text-slate-300',
  published:   'bg-blue-900/40 text-blue-300 border border-blue-700',
  bid_open:    'bg-violet-900/40 text-violet-300 border border-violet-700',
  evaluation:  'bg-amber-900/40 text-amber-300 border border-amber-700',
  awarded:     'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  cancelled:   'bg-red-900/40 text-red-300 border border-red-700',
};
const TYPE_LABELS = { works:'Works', supply:'Supply', supply_install:'Supply & Install', service:'Service', subcontract:'Subcontract' };

const fmt = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function TenderListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', tender_type: 'works', estimated_value: '', bid_close_date: '' });

  const { data: statsData } = useQuery({
    queryKey: ['tender-stats'],
    queryFn: () => tenderAPI.stats().then(r => r.data?.data ?? {}),
  });
  const stats = statsData || {};

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tenders', search, statusFilter],
    queryFn: () => tenderAPI.list({ search: search || undefined, status: statusFilter || undefined }).then(r => r.data?.data ?? []),
  });
  const tenders = listData || [];

  const createMut = useMutation({
    mutationFn: (d) => tenderAPI.create(d),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tenders'] });
      qc.invalidateQueries({ queryKey: ['tender-stats'] });
      toast.success(`Tender ${r.data?.data?.tender_number} created`);
      setShowNew(false);
      setForm({ title: '', tender_type: 'works', estimated_value: '', bid_close_date: '' });
      navigate(`/procurement/tenders/${r.data?.data?.id}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create tender'),
  });

  const kpis = [
    { label: 'Draft',      key: 'draft',      color: 'text-slate-400' },
    { label: 'Published',  key: 'published',  color: 'text-blue-400' },
    { label: 'Bid Open',   key: 'bid_open',   color: 'text-violet-400' },
    { label: 'Evaluation', key: 'evaluation', color: 'text-amber-400' },
    { label: 'Awarded',    key: 'awarded',    color: 'text-emerald-400' },
    { label: 'Cancelled',  key: 'cancelled',  color: 'text-red-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-600/20 rounded-lg"><Gavel className="w-6 h-6 text-violet-400" /></div>
          <div>
            <h1 className="text-2xl font-medium text-white">Procurement Tenders</h1>
            <p className="text-sm text-slate-400">Float tenders, evaluate bids, award contracts</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Tender
        </button>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpis.map(k => (
          <button
            key={k.key}
            onClick={() => setStatusFilter(statusFilter === k.key ? '' : k.key)}
            className={`bg-slate-800 border rounded-xl p-3 text-center transition-all
              ${statusFilter === k.key ? 'border-violet-500' : 'border-slate-700 hover:border-slate-600'}`}
          >
            <div className={`text-2xl font-medium ${k.color}`}>{stats[k.key] ?? 0}</div>
            <div className="text-xs text-slate-900 font-medium mt-1">{k.label}</div>
          </button>
        ))}
      </div>

      {/* Total values */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <span className="text-slate-900 font-medium text-sm">Total Estimated Value</span>
          <span className="text-white font-bold">{fmt(stats.total_estimated)}</span>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <span className="text-slate-900 font-medium text-sm">Total Awarded Value</span>
          <span className="text-emerald-400 font-bold">{fmt(stats.total_awarded)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="Search tender number, title…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
          />
        </div>
        {statusFilter && (
          <button onClick={() => setStatusFilter('')}
            className="flex items-center gap-1 px-3 py-2 bg-violet-600/20 border border-violet-600 text-violet-300 rounded-lg text-sm">
            {statusFilter} <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Tender No.', 'Title', 'Project', 'Type', 'Est. Value', 'Bid Close', 'Bids', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenders.map(t => (
                <tr key={t.id}
                  onClick={() => navigate(`/procurement/tenders/${t.id}`)}
                  className="border-b border-slate-700/50 hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-violet-300 text-xs">{t.tender_number}</td>
                  <td className="px-4 py-3 text-white font-medium max-w-xs truncate">{t.title}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{t.project_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{TYPE_LABELS[t.tender_type] || t.tender_type}</td>
                  <td className="px-4 py-3 text-slate-300">{fmt(t.estimated_value)}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">
                    {t.bid_close_date ? dayjs(t.bid_close_date).format('DD MMM YY') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-300 text-xs">{t.bid_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] || 'bg-slate-700 text-slate-300'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && tenders.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No tenders found</p>
          </div>
        )}
      </div>

      {/* New Tender Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">New Tender</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-900 font-medium hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Tender Title *</label>
                <input
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="e.g. RCC Work — Block A"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Tender Type</label>
                <select
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
                  value={form.tender_type} onChange={e => setForm(f => ({ ...f, tender_type: e.target.value }))}
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Estimated Value (₹)</label>
                <input
                  type="number" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="0"
                  value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Bid Close Date</label>
                <input
                  type="date" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  value={form.bid_close_date} onChange={e => setForm(f => ({ ...f, bid_close_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm hover:text-white">Cancel</button>
              <button
                disabled={!form.title || createMut.isPending}
                onClick={() => createMut.mutate({
                  title: form.title,
                  tender_type: form.tender_type,
                  estimated_value: form.estimated_value || null,
                  bid_close_date: form.bid_close_date || null,
                })}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {createMut.isPending ? 'Creating…' : 'Create Tender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
