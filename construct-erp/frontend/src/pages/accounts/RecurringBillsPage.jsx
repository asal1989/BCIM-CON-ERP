// src/pages/accounts/RecurringBillsPage.jsx — vendor-side mirror of RecurringInvoicesPage
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { ScrollText, Plus, Play, Pause, X, Zap, History } from 'lucide-react';
import { recurringBillAPI, vendorAPI, projectAPI } from '../../api/client';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';
function Lbl({ children, req }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</label>;
}

const FREQ_LABEL = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const EXPENSE_CODES = [
  { code: '6100', label: 'Office & Admin Expenses' },
  { code: '6070', label: 'Transport / Conveyance' },
  { code: '6080', label: 'Utilities Expense' },
  { code: '6030', label: 'Fuel Expense' },
  { code: '5200', label: 'Equipment Hire' },
];

function ProfileForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    profile_name: '', vendor_name: '', vendor_id: '', project_id: '',
    frequency: 'monthly', day_of_month: '1', next_run_date: dayjs().format('YYYY-MM-DD'),
    basic_amount: '', gst_pct: '18', expense_code: '6100', description: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const saveMut = useMutation({
    mutationFn: () => recurringBillAPI.create(form).then(r => r.data),
    onSuccess: () => { toast.success('Recurring bill profile created'); qc.invalidateQueries({ queryKey: ['recurring-bills'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.profile_name.trim()) return toast.error('Profile name is required');
    if (!form.vendor_name.trim()) return toast.error('Vendor name is required');
    saveMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-lg rounded-md border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-orange-50 flex items-center justify-center"><ScrollText className="w-4 h-4 text-orange-600" /></div>
            <p className="text-sm font-semibold text-slate-800">New Recurring Bill Profile</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><Lbl req>Profile Name</Lbl><input className={F} placeholder="e.g. Monthly Office Rent" value={form.profile_name} onChange={e => set('profile_name', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl req>Vendor</Lbl>
              <select className={F} value={form.vendor_id} onChange={e => {
                const v = vendors.find(x => x.id === e.target.value);
                set('vendor_id', e.target.value); set('vendor_name', v?.name || '');
              }}>
                <option value="">— Select vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {!form.vendor_id && <input className={clsx(F, 'mt-1.5')} placeholder="Or type vendor name manually" value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />}
            </div>
            <div>
              <Lbl>Project</Lbl>
              <select className={F} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Lbl>Frequency</Lbl>
              <select className={F} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div><Lbl>First Run Date</Lbl><input type="date" className={F} value={form.next_run_date} onChange={e => set('next_run_date', e.target.value)} /></div>
            <div><Lbl>GST %</Lbl><input type="number" step="0.01" className={F} value={form.gst_pct} onChange={e => set('gst_pct', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Amount per Bill (₹, basic)</Lbl><input type="number" step="0.01" className={F} value={form.basic_amount} onChange={e => set('basic_amount', e.target.value)} /></div>
            <div>
              <Lbl>Expense Account</Lbl>
              <select className={F} value={form.expense_code} onChange={e => set('expense_code', e.target.value)}>
                {EXPENSE_CODES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl>Description</Lbl><textarea className={clsx(F, 'resize-none')} rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saveMut.isPending} className="flex-1 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 disabled:opacity-50">
              {saveMut.isPending ? 'Saving…' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryModal({ profile, onClose }) {
  const { data: log = [], isLoading } = useQuery({
    queryKey: ['recurring-bill-log', profile.id],
    queryFn: () => recurringBillAPI.log(profile.id).then(r => r.data?.data || []),
  });
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-md rounded-md border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Generated — {profile.profile_name}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          : log.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nothing generated yet</p>
          : log.map(l => (
            <div key={l.id} className="flex items-center justify-between px-3 py-2 border border-slate-100 rounded-md">
              <div>
                <p className="text-sm font-mono font-semibold text-slate-800">{l.bill_no}</p>
                <p className="text-xs text-slate-400">{dayjs(l.bill_date).format('DD MMM YYYY')}</p>
              </div>
              <p className="text-sm font-mono font-semibold text-orange-700">{inr(l.total_amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RecurringBillsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-bills'],
    queryFn: () => recurringBillAPI.list().then(r => r.data?.data || []),
  });
  const rows = data || [];

  const toggleMut = useMutation({
    mutationFn: ({ id, status }) => recurringBillAPI.updateStatus(id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['recurring-bills'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });
  const generateMut = useMutation({
    mutationFn: (id) => recurringBillAPI.generate(id),
    onSuccess: (res) => { toast.success(`Bill ${res.data?.data?.bill_no} generated`); qc.invalidateQueries({ queryKey: ['recurring-bills'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Generate failed'),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-orange-50 flex items-center justify-center"><ScrollText className="w-4 h-4 text-orange-600" /></div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Recurring Bills</h1>
              <p className="text-xs text-slate-400">Profiles that generate vendor bills on a schedule (rent, AMC, retainers) — click Generate Now when due</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700">
            <Plus className="w-3.5 h-3.5" /> New Recurring Profile
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-sm text-slate-400 text-center bg-white border border-slate-200 rounded-md">No recurring bill profiles found</p>
        ) : rows.map(r => {
          const isDue = r.next_run_date && dayjs(r.next_run_date).isBefore(dayjs().add(1, 'day'));
          return (
            <div key={r.id} className="bg-white border border-slate-200 rounded-md p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-slate-800">{r.profile_name}</p>
                  <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600')}>{r.status}</span>
                  {isDue && r.status === 'active' && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-600">Due</span>}
                </div>
                <p className="text-xs text-slate-500">{r.vendor_name} · {FREQ_LABEL[r.frequency]} · Next: {r.next_run_date ? dayjs(r.next_run_date).format('DD MMM YYYY') : '—'} · Generated {r.generated_count || 0}× ({inr(r.generated_total)})</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-semibold text-slate-800">{inr(r.basic_amount)}</span>
                <button onClick={() => setHistoryFor(r)} title="History" className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"><History className="w-3.5 h-3.5" /></button>
                {r.status === 'active' && (
                  <button onClick={() => generateMut.mutate(r.id)} disabled={generateMut.isPending} title="Generate Now"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50">
                    <Zap className="w-3.5 h-3.5" /> Generate Now
                  </button>
                )}
                <button onClick={() => toggleMut.mutate({ id: r.id, status: r.status === 'active' ? 'paused' : 'active' })} disabled={toggleMut.isPending}
                  title={r.status === 'active' ? 'Pause' : 'Resume'} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                  {r.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && <ProfileForm onClose={() => setShowForm(false)} />}
      {historyFor && <HistoryModal profile={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
