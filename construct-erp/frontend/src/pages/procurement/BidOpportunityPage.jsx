import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Search, ChevronRight, X, TrendingUp, DollarSign } from 'lucide-react';
import { bidOpportunityAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STATUS_COLORS = {
  prospect:     'bg-slate-700 text-slate-300',
  pursuing:     'bg-blue-900/40 text-blue-300 border border-blue-700',
  bid_prepared: 'bg-violet-900/40 text-violet-300 border border-violet-700',
  submitted:    'bg-amber-900/40 text-amber-300 border border-amber-700',
  won:          'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  lost:         'bg-red-900/40 text-red-300 border border-red-700',
  dropped:      'bg-slate-700 text-slate-900 font-medium border border-slate-600',
};
const SECTOR_LABELS = {
  residential:'Residential', commercial:'Commercial', industrial:'Industrial',
  infrastructure:'Infrastructure', institutional:'Institutional', mixed_use:'Mixed Use', other:'Other',
};
const SOURCE_LABELS = {
  direct_invite:'Direct Invite', tender_portal:'Tender Portal', referral:'Referral',
  repeat_client:'Repeat Client', cold_pursuit:'Cold Pursuit', other:'Other',
};
const fmt = (n) => n != null ? `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtL = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function BidOpportunityPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    client_name: '', project_name: '', sector: 'other', source: 'direct_invite',
    bid_value: '', win_probability: 50, bid_submission_date: '',
  });

  const { data: statsData } = useQuery({
    queryKey: ['bid-opp-stats'],
    queryFn: () => bidOpportunityAPI.stats().then(r => r.data?.data ?? {}),
  });
  const stats = statsData || {};

  const { data: listData, isLoading } = useQuery({
    queryKey: ['bid-opportunities', search, statusFilter],
    queryFn: () => bidOpportunityAPI.list({ search: search || undefined, status: statusFilter || undefined })
      .then(r => r.data?.data ?? []),
  });
  const opps = listData || [];

  const createMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.create(d),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['bid-opportunities'] });
      qc.invalidateQueries({ queryKey: ['bid-opp-stats'] });
      toast.success(`${r.data?.data?.opportunity_number} created`);
      setShowNew(false);
      navigate(`/procurement/bid-opportunities/${r.data?.data?.id}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const kpis = [
    { label: 'Prospect',     key: 'prospect',     color: 'text-slate-400' },
    { label: 'Pursuing',     key: 'pursuing',     color: 'text-blue-400' },
    { label: 'Bid Prepared', key: 'bid_prepared', color: 'text-violet-400' },
    { label: 'Submitted',    key: 'submitted',    color: 'text-amber-400' },
    { label: 'Won',          key: 'won',          color: 'text-emerald-400' },
    { label: 'Lost',         key: 'lost',         color: 'text-red-400' },
  ];

  const probColor = (p) => p >= 70 ? 'text-emerald-400' : p >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600/20 rounded-lg"><Target className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <h1 className="text-2xl font-medium text-white">Bid Opportunities</h1>
            <p className="text-sm text-slate-400">Track bids to win new construction projects</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Opportunity
        </button>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpis.map(k => (
          <button key={k.key}
            onClick={() => setStatusFilter(statusFilter === k.key ? '' : k.key)}
            className={`bg-slate-800 border rounded-xl p-3 text-center transition-all
              ${statusFilter === k.key ? 'border-emerald-500' : 'border-slate-700 hover:border-slate-600'}`}>
            <div className={`text-2xl font-medium ${k.color}`}>{stats[k.key] ?? 0}</div>
            <div className="text-xs text-slate-900 font-medium mt-1">{k.label}</div>
          </button>
        ))}
      </div>

      {/* Win Rate + Pipeline Value */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 col-span-1 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-emerald-400 opacity-60" />
          <div>
            <p className="text-xs text-slate-400">Win Rate</p>
            <p className="text-2xl font-medium text-emerald-400">{stats.win_rate_pct ?? 0}%</p>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <span className="text-slate-900 font-medium text-sm">Pipeline Value</span>
          <span className="text-white font-bold">{fmt(stats.total_pipeline_value)}</span>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <span className="text-slate-900 font-medium text-sm">Won Value</span>
          <span className="text-emerald-400 font-bold">{fmt(stats.total_won_value)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search client, project, opportunity no…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        {statusFilter && (
          <button onClick={() => setStatusFilter('')}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-600/20 border border-emerald-600 text-emerald-300 rounded-lg text-sm">
            {statusFilter} <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? <div className="text-center py-12 text-slate-400">Loading…</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Opp. No.', 'Client', 'Project', 'Sector', 'Bid Value', 'Win %', 'Submission', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opps.map(o => (
                <tr key={o.id}
                  onClick={() => navigate(`/procurement/bid-opportunities/${o.id}`)}
                  className="border-b border-slate-700/50 hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-emerald-300 text-xs">{o.opportunity_number}</td>
                  <td className="px-4 py-3 text-white font-medium">{o.client_name}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{o.project_name}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">{SECTOR_LABELS[o.sector] || o.sector}</td>
                  <td className="px-4 py-3 text-slate-300">{fmtL(o.bid_value)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${probColor(o.win_probability)}`}>{o.win_probability}%</span>
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium text-xs">
                    {o.bid_submission_date ? dayjs(o.bid_submission_date).format('DD MMM YY') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] || 'bg-slate-700 text-slate-300'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && opps.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No opportunities found</p>
          </div>
        )}
      </div>

      {/* New Opportunity Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">New Bid Opportunity</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-900 font-medium hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Client Name *</label>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Client / Owner name" />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Project Name *</label>
                <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Green Valley Towers" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Sector</label>
                  <select value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none">
                    {Object.entries(SECTOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none">
                    {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Bid Value (₹)</label>
                  <input type="number" value={form.bid_value} onChange={e => setForm(f => ({ ...f, bid_value: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1">Win Probability %</label>
                  <input type="number" min="0" max="100" value={form.win_probability}
                    onChange={e => setForm(f => ({ ...f, win_probability: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Bid Submission Date</label>
                <input type="date" value={form.bid_submission_date}
                  onChange={e => setForm(f => ({ ...f, bid_submission_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-slate-600 text-slate-900 font-medium rounded-lg text-sm hover:text-white">Cancel</button>
              <button
                disabled={!form.client_name || !form.project_name || createMut.isPending}
                onClick={() => createMut.mutate(form)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {createMut.isPending ? 'Creating…' : 'Create Opportunity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
