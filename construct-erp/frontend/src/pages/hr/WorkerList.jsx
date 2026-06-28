import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { HardHat, Plus, X, Search, UserCheck, Wallet, Landmark, Layers } from 'lucide-react';
import { workerAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';

const SKILLS = {
  mason:       { label: 'Mason',       color: 'bg-blue-100 text-blue-700' },
  carpenter:   { label: 'Carpenter',   color: 'bg-teal-100 text-teal-700' },
  bar_bender:  { label: 'Bar Bender',  color: 'bg-amber-100 text-amber-700' },
  electrician: { label: 'Electrician', color: 'bg-purple-100 text-purple-700' },
  plumber:     { label: 'Plumber',     color: 'bg-orange-100 text-orange-700' },
  helper:      { label: 'Helper',      color: 'bg-slate-100 text-slate-600' },
  supervisor:  { label: 'Supervisor',  color: 'bg-emerald-100 text-emerald-700' },
};

const STATES = ['Maharashtra', 'Bihar', 'Uttar Pradesh', 'Rajasthan', 'Madhya Pradesh', 'West Bengal', 'Odisha', 'Jharkhand'];

export default function WorkerList() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('all');
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm();

  const { data } = useQuery({
    queryKey: ['workers'],
    queryFn: () => workerAPI.list().then(r => r.data?.data).catch(() => []),
  });

  const createMut = useMutation({
    mutationFn: d => workerAPI.create(d),
    onSuccess: () => { toast.success('Worker added'); reset(); setShowForm(false); qc.invalidateQueries({ queryKey: ['workers'] }); },
    onError: e => toast.error(e.response?.data?.error || 'Failed to add worker'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/workers/${id}`),
    onSuccess: () => { toast.success('Worker removed'); qc.invalidateQueries({ queryKey: ['workers'] }); },
    onError: () => toast.error('Failed to remove worker'),
  });

  const workers = (data || []).filter(w => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (skillFilter !== 'all' && w.skill_type !== skillFilter) return false;
    return true;
  });

  const activeCount   = workers.filter(w => w.is_active).length;
  const dailyWageBill = workers.reduce((s, w) => s + parseFloat(w.daily_rate || 0), 0);
  const pfLiability   = Math.round(dailyWageBill * 26 * 0.12);
  const tradeCount    = [...new Set(workers.map(w => w.skill_type))].length;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Site Workers</h1>
            <p className="text-xs text-slate-500">BOCW Registry · Daily Wage Workers · PF/ESI</p>
          </div>
        </div>
        <DataToolbar data={workers} fileName="Site_Workers" onAdd={() => setShowForm(true)} addLabel="Add Worker" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Active Workers" value={activeCount} icon={UserCheck} iconColor="text-emerald-600" bg="bg-emerald-50" />
        <SummaryCard label="Daily Wage Bill" value={`₹${dailyWageBill.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={Wallet} iconColor="text-indigo-600" bg="bg-indigo-50" />
        <SummaryCard label="Est. PF Liability" value={`₹${pfLiability.toLocaleString('en-IN')}`} icon={Landmark} iconColor="text-blue-600" bg="bg-blue-50" />
        <SummaryCard label="Trades" value={tradeCount} icon={Layers} iconColor="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Statutory Info */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Statutory Rates:</span>
        <span>Employee PF 12% · Employer PF 12%</span>
        <span className="text-slate-300">|</span>
        <span>Employee ESI 0.75% · Employer ESI 3.25%</span>
        <span className="text-slate-300">|</span>
        <span>PF ceiling ₹15,000 · ESI ceiling ₹21,000</span>
        <span className="ml-auto text-amber-600 font-medium">Challan due: 15th of next month</span>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            placeholder="Search workers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', ...Object.keys(SKILLS)].map(s => (
            <button
              key={s}
              onClick={() => setSkillFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                skillFilter === s
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {s === 'all' ? 'All Trades' : SKILLS[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Worker Registry</span>
          <span className="text-xs text-slate-400">{workers.length} worker{workers.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Worker</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Trade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Gang / Contractor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Daily Rate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">BOCW No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workers.map(w => {
                const skill = SKILLS[w.skill_type] || SKILLS.helper;
                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                          {w.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{w.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{w.worker_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${skill.color}`}>
                        {skill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700">{w.gang_name || <span className="text-slate-400">—</span>}</div>
                      <div className="text-xs text-slate-400">{w.contractor_name || 'Direct'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">₹{w.daily_rate}</span>
                      <span className="text-xs text-slate-400">/day</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                      {w.bocw_number || <span className="text-slate-300">Not filed</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        w.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${w.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {w.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div onClick={e => e.stopPropagation()}>
                        <TableActions disableEdit onDelete={() => deleteMut.mutate(w.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    No workers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Worker Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                  <Plus size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Add Worker</h2>
                  <p className="text-xs text-slate-500">Register a new site worker</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(createMut.mutate)} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Full Name">
                  <input {...register('name', { required: true })} className={inputCls} placeholder="e.g. Raju Yadav" />
                </FormField>
                <FormField label="Trade / Skill">
                  <select {...register('skill_type', { required: true })} className={inputCls}>
                    {Object.entries(SKILLS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Daily Rate (₹)">
                  <input {...register('daily_rate', { required: true })} type="number" className={inputCls} placeholder="850" />
                </FormField>
                <FormField label="BOCW Number">
                  <input {...register('bocw_number')} className={inputCls} placeholder="e.g. MH48291" />
                </FormField>
              </div>
              <FormField label="State of Origin">
                <select {...register('state_of_origin')} className={inputCls}>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Joining Date">
                <input {...register('joined_date')} type="date" className={inputCls} />
              </FormField>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={createMut.isPending} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm">
                  {createMut.isPending ? 'Adding...' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all';

function FormField({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, iconColor, bg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-xl font-bold text-slate-800 leading-tight">{value}</div>
      </div>
    </div>
  );
}
