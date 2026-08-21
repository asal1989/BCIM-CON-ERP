// src/pages/hr-admin/compliance/StatutoryTracker.jsx
// Legal & Statutory Compliance Tracker — Project/HO-scoped ledger covering
// the 11 statutory categories (Shop & Establishment, PF, PT, WC Policy,
// CLRA, BOCW, LWF, Rental Agreements, Vehicle Insurance, Labour Licences,
// Other) with the full due/paid/penalty/delay trail, plus the weekly
// Monday-morning email report configuration.
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { complianceTrackerAPI, projectAPI } from '../../../api/client';

const STATUS_COLORS = {
  Pending: '#b45309', Overdue: '#dc2626', Paid: '#16a34a', Closed: '#64748b', 'Not Applicable': '#94a3b8',
};

function inr(v) { return Math.round(Number(v || 0)).toLocaleString('en-IN'); }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

function SummaryCards({ summary }) {
  const cards = [
    { label: 'Open Items Overdue', value: summary?.overdue_count ?? '—', color: '#dc2626' },
    { label: 'Total Outstanding', value: `₹${inr(summary?.total_outstanding)}`, color: '#dc2626' },
    { label: 'Penalty / Damages', value: `₹${inr(summary?.total_penalty_damages)}`, color: '#b45309' },
    { label: 'Due in Next 30 Days', value: summary?.due_in_30_days ?? '—', color: '#1B3A6B' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-slate-200/70 p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{c.label}</div>
          <div className="text-xl font-bold mt-1" style={{ color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ObligationForm({ projects, onClose, onSaved, categories }) {
  const [form, setForm] = useState({ project_id: '', category: categories[0] || '', title: '', frequency: 'Monthly', responsible_person: '', legal_reference: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => complianceTrackerAPI.createObligation({ ...form, project_id: form.project_id || null }),
    onSuccess: () => { toast.success('Compliance item added'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to add'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">Add Compliance Item</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Project</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Category</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Title</label>
            <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.title}
              onChange={e => set('title', e.target.value)} placeholder="e.g. PF Compliance — LANCO Hills" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Frequency</label>
              <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                <option>Monthly</option><option>Annual</option><option>One-time</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Responsible Person</label>
              <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.responsible_person}
                onChange={e => set('responsible_person', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Legal Reference (optional)</label>
            <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.legal_reference}
              onChange={e => set('legal_reference', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200">Cancel</button>
          <button disabled={!form.title || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            {mut.isPending ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ obligations, onClose, onSaved }) {
  const [form, setForm] = useState({
    obligation_id: obligations[0]?.id || '', period: '', due_date: '', actual_payment_date: '',
    due_amount: '', amount_paid: '', penalty_interest: '', damages_charges: '', validity_expiry_date: '',
    status: 'Pending', reason_for_delay: '', action_required: '', responsible_person: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => complianceTrackerAPI.createEntry(form),
    onSuccess: () => { toast.success('Entry added'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to add'),
  });
  const field = (label, key, type = 'text', extra = {}) => (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <input type={type} className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form[key]}
        onChange={e => set(key, e.target.value)} {...extra} />
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">Add Compliance Entry</h3>
        <div>
          <label className="text-xs font-semibold text-slate-500">Compliance Item</label>
          <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.obligation_id} onChange={e => set('obligation_id', e.target.value)}>
            {obligations.map(o => <option key={o.id} value={o.id}>{o.project_name || 'Head Office'} — {o.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {field('Period (e.g. 2026-04)', 'period')}
          {field('Due Date', 'due_date', 'date')}
          {field('Actual Payment/Compliance Date', 'actual_payment_date', 'date')}
          {field('Due Amount', 'due_amount', 'number')}
          {field('Amount Paid', 'amount_paid', 'number')}
          {field('Penalty / Interest', 'penalty_interest', 'number')}
          {field('Damages Charges', 'damages_charges', 'number')}
          {field('Validity / Expiry Date', 'validity_expiry_date', 'date')}
          <div>
            <label className="text-xs font-semibold text-slate-500">Status</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.status} onChange={e => set('status', e.target.value)}>
              {['Pending', 'Paid', 'Overdue', 'Closed', 'Not Applicable'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {field('Reason for Delay (if any)', 'reason_for_delay')}
          {field('Action Required / Follow-up', 'action_required')}
          {field('Responsible Person', 'responsible_person')}
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200">Cancel</button>
          <button disabled={!form.obligation_id || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            {mut.isPending ? 'Saving…' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportConfigPanel({ configs, onRefresh }) {
  const [recipients, setRecipients] = useState('');
  const createMut = useMutation({
    mutationFn: () => complianceTrackerAPI.createReportConfig({ recipients }),
    onSuccess: () => { toast.success('Recipient added'); setRecipients(''); onRefresh(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => complianceTrackerAPI.deleteReportConfig(id),
    onSuccess: () => { toast.success('Removed'); onRefresh(); },
  });
  const sendMut = useMutation({
    mutationFn: () => complianceTrackerAPI.sendReportNow(),
    onSuccess: (r) => toast.success(r.data?.data?.ok ? `Report sent (${r.data.data.entry_count} items)` : r.data?.data?.reason || 'Sent'),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-900">Weekly Report — every Monday morning (before noon)</h4>
        </div>
        <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
          className="h-8 px-3 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#1B3A6B' }}>
          <Send size={12} /> {sendMut.isPending ? 'Sending…' : 'Send Now'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {(configs || []).map(c => (
          <span key={c.id} className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2">
            {c.recipients}
            <button onClick={() => deleteMut.mutate(c.id)}><Trash2 size={11} className="text-slate-400 hover:text-red-500" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" placeholder="email1@bcim.in, email2@bcim.in"
          value={recipients} onChange={e => setRecipients(e.target.value)} />
        <button onClick={() => recipients.trim() && createMut.mutate()} className="h-9 px-4 rounded-lg text-sm font-semibold border border-slate-200 hover:bg-slate-50">Add</button>
      </div>
    </div>
  );
}

export default function StatutoryTracker() {
  const qc = useQueryClient();
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [obForm, setObForm] = useState(false);
  const [enForm, setEnForm] = useState(false);

  const { data: categories } = useQuery({ queryKey: ['ct-categories'], queryFn: () => complianceTrackerAPI.categories().then(r => r.data.data) });
  const { data: projects } = useQuery({ queryKey: ['ct-projects'], queryFn: () => projectAPI.list().then(r => r.data?.data || []) });
  const { data: summary } = useQuery({ queryKey: ['ct-summary'], queryFn: () => complianceTrackerAPI.summary().then(r => r.data.data) });
  const { data: obligations } = useQuery({ queryKey: ['ct-obligations'], queryFn: () => complianceTrackerAPI.obligations().then(r => r.data.data) });
  const { data: configs } = useQuery({ queryKey: ['ct-report-config'], queryFn: () => complianceTrackerAPI.reportConfig().then(r => r.data.data) });
  const { data: entries, isLoading } = useQuery({
    queryKey: ['ct-entries', projectFilter, statusFilter],
    queryFn: () => complianceTrackerAPI.entries({ project_id: projectFilter || undefined, status: statusFilter || undefined }).then(r => r.data.data),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['ct-summary'] });
    qc.invalidateQueries({ queryKey: ['ct-obligations'] });
    qc.invalidateQueries({ queryKey: ['ct-entries'] });
    qc.invalidateQueries({ queryKey: ['ct-report-config'] });
  };

  const deleteEntryMut = useMutation({
    mutationFn: (id) => complianceTrackerAPI.deleteEntry(id),
    onSuccess: () => { toast.success('Entry removed'); refreshAll(); },
  });

  const rows = entries || [];

  return (
    <div>
      <SummaryCards summary={summary} />
      <ReportConfigPanel configs={configs} onRefresh={refreshAll} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects + HO</option>
          <option value="HO">Head Office</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['Pending', 'Overdue', 'Paid', 'Closed', 'Not Applicable'].map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setObForm(true)} className="h-9 px-3 rounded-lg text-sm font-semibold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
            <Plus size={14} /> Compliance Item
          </button>
          <button onClick={() => setEnForm(true)} disabled={!obligations?.length}
            className="h-9 px-3 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            <Plus size={14} /> Entry
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              {['Project', 'Category', 'Item', 'Due Date', 'Actual Date', 'Due', 'Paid', 'Outstanding', 'Penalty/Int', 'Damages', 'Delay Days', 'Validity', 'Status', 'Reason', 'Action Req.', 'Responsible', ''].map(h => (
                <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={17} className="text-center py-6 text-slate-400">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={17} className="text-center py-6 text-slate-400">No compliance entries yet.</td></tr>}
            {rows.map(e => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-2">{e.project_name || 'Head Office'}</td>
                <td className="px-3 py-2">{e.category}</td>
                <td className="px-3 py-2">{e.obligation_title}{e.period ? ` (${e.period})` : ''}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.due_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.actual_payment_date)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.due_amount)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.amount_paid)}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: Number(e.outstanding_amount) > 0 ? '#dc2626' : '#16a34a' }}>₹{inr(e.outstanding_amount)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.penalty_interest)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.damages_charges)}</td>
                <td className="px-3 py-2 text-center" style={{ color: Number(e.delay_days) > 0 ? '#dc2626' : '#334155' }}>{e.delay_days ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.validity_expiry_date)}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: `${STATUS_COLORS[e.status]}18`, color: STATUS_COLORS[e.status] }}>{e.status}</span>
                </td>
                <td className="px-3 py-2 max-w-[140px] truncate" title={e.reason_for_delay}>{e.reason_for_delay || '—'}</td>
                <td className="px-3 py-2 max-w-[140px] truncate" title={e.action_required}>{e.action_required || '—'}</td>
                <td className="px-3 py-2">{e.responsible_person || '—'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => deleteEntryMut.mutate(e.id)}><Trash2 size={13} className="text-slate-400 hover:text-red-500" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {obForm && <ObligationForm projects={projects || []} categories={categories || []} onClose={() => setObForm(false)} onSaved={refreshAll} />}
      {enForm && <EntryForm obligations={obligations || []} onClose={() => setEnForm(false)} onSaved={refreshAll} />}
    </div>
  );
}
