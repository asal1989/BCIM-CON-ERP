// src/pages/accounts/BankAccountsPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Landmark, Plus, X, Trash2, Pencil, CreditCard } from 'lucide-react';
import { bankAccountAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';

const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';
const TYPES = ['current', 'savings', 'cc', 'od'];
const EMPTY = { account_name: '', bank_name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'current', opening_balance: '' };

function BankModal({ initial, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(isEdit ? {
    account_name: initial.account_name, bank_name: initial.bank_name,
    account_number: initial.account_number || '', ifsc_code: initial.ifsc_code || '',
    branch: initial.branch || '', account_type: initial.account_type || 'current',
    opening_balance: initial.opening_balance || '',
  } : { ...EMPTY });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => isEdit
      ? bankAccountAPI.update(initial.id, form).then(r => r.data)
      : bankAccountAPI.create(form).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Bank account updated' : 'Bank account added');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-md border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">{isEdit ? 'Edit Bank Account' : 'New Bank Account'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
            <input className={F} value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="Main Operating Account" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
              <input className={F} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="HDFC Bank" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account Type</label>
              <select className={F} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
              <input className={F} value={form.account_number} onChange={e => set('account_number', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
              <input className={F} value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
              <input className={F} value={form.branch} onChange={e => set('branch', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Opening Balance (₹)</label>
              <input type="number" step="0.01" className={F} value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => {
              if (!form.account_name.trim() || !form.bank_name.trim()) return toast.error('Account name and bank name are required');
              saveMut.mutate();
            }}
            disabled={saveMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  const [modal, setModal] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountAPI.list().then(r => r.data?.data ?? []),
  });
  const rows = data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id) => bankAccountAPI.remove(id),
    onSuccess: () => { toast.success('Bank account removed'); qc.invalidateQueries({ queryKey: ['bank-accounts'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Bank Accounts</h1>
              <p className="text-xs text-slate-400">Company bank accounts used for payments &amp; reconciliation</p>
            </div>
          </div>
          <button onClick={() => setModal({})}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Bank Account
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-md flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <Landmark className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No bank accounts added yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map(b => (
              <div key={b.id} className="bg-white border border-slate-200 rounded-md p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setModal(b)} className="text-slate-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (window.confirm('Remove this bank account?')) deleteMut.mutate(b.id); }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-800">{b.account_name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{b.bank_name}{b.branch ? ` · ${b.branch}` : ''}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-mono">{b.account_number || '—'} {b.ifsc_code ? `· ${b.ifsc_code}` : ''}</div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">{b.account_type}</span>
                  <span className="text-sm font-semibold text-slate-800">{inr(b.opening_balance)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal !== null && <BankModal initial={modal.id ? modal : null} onClose={() => setModal(null)} />}
    </div>
  );
}
