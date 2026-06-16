// src/pages/plant/PlantTransfers.jsx — Equipment transfers (site→site) and disposals/write-off
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, inputCls, inr, ddmmyyyy } from './_shared';

const Field = ({ label, children, span }) => (
  <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}><label className="block text-xs font-medium text-gray-500">{label}</label>{children}</div>
);

function TransferForm({ onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });
  const [f, setF] = useState({ equipment_id: '', from_site_id: '', to_site_id: '', transfer_date: new Date().toISOString().slice(0, 10), reason: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (p) => plantAPI.createTransfer(p),
    onSuccess: () => { toast.success('Transfer recorded'); qc.invalidateQueries({ queryKey: ['pm-transfers'] }); qc.invalidateQueries({ queryKey: ['pm-equipment'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  return (
    <Modal title="Equipment Transfer" onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="tr-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="tr-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *" span={2}><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
        <Field label="From Site"><select className={inputCls} value={f.from_site_id} onChange={(e) => set('from_site_id', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="To Site"><select className={inputCls} value={f.to_site_id} onChange={(e) => set('to_site_id', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Transfer Date"><input type="date" className={inputCls} value={f.transfer_date} onChange={(e) => set('transfer_date', e.target.value)} /></Field>
        <Field label="Reason" span={2}><input className={inputCls} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function DisposalForm({ onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const [f, setF] = useState({ equipment_id: '', disposal_type: 'sale', disposal_date: new Date().toISOString().slice(0, 10), book_value: '', sale_value: '', reason: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (p) => plantAPI.createDisposal(p),
    onSuccess: () => { toast.success('Disposal recorded'); qc.invalidateQueries({ queryKey: ['pm-disposals'] }); qc.invalidateQueries({ queryKey: ['pm-equipment'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  return (
    <Modal title="Equipment Disposal / Write-off" onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="dp-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="dp-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *" span={2}><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
        <Field label="Type"><select className={inputCls} value={f.disposal_type} onChange={(e) => set('disposal_type', e.target.value)}><option value="sale">Sale</option><option value="scrap">Scrap</option><option value="writeoff">Write-off</option></select></Field>
        <Field label="Disposal Date"><input type="date" className={inputCls} value={f.disposal_date} onChange={(e) => set('disposal_date', e.target.value)} /></Field>
        <Field label="Book Value (₹)"><input type="number" className={inputCls} value={f.book_value} onChange={(e) => set('book_value', e.target.value)} /></Field>
        <Field label="Sale Value (₹)"><input type="number" className={inputCls} value={f.sale_value} onChange={(e) => set('sale_value', e.target.value)} /></Field>
        <Field label="Reason" span={2}><input className={inputCls} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function PlantTransfers() {
  const [tab, setTab] = useState('transfers');
  const [showForm, setShowForm] = useState(false);

  const transfers = useQuery({ queryKey: ['pm-transfers'], queryFn: () => plantAPI.listTransfers().then((r) => r.data?.data || []).catch(() => []) });
  const disposals = useQuery({ queryKey: ['pm-disposals'], queryFn: () => plantAPI.listDisposals().then((r) => r.data?.data || []).catch(() => []) });

  const trCols = [
    { key: 'transfer_date', label: 'Date', render: (r) => ddmmyyyy(r.transfer_date) },
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'from_site_name', label: 'From' },
    { key: 'to_site_name', label: 'To' },
    { key: 'reason', label: 'Reason' },
  ];
  const dpCols = [
    { key: 'disposal_date', label: 'Date', render: (r) => ddmmyyyy(r.disposal_date) },
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'disposal_type', label: 'Type', render: (r) => <span className="capitalize">{r.disposal_type}</span> },
    { key: 'book_value', label: 'Book Value', render: (r) => inr(r.book_value) },
    { key: 'sale_value', label: 'Sale Value', render: (r) => inr(r.sale_value) },
    { key: 'reason', label: 'Reason' },
  ];

  const cur = tab === 'transfers' ? transfers : disposals;

  return (
    <PageShell title="Transfers & Disposals" onRefresh={cur.refetch} onAdd={() => setShowForm(true)}
      addLabel={tab === 'transfers' ? 'New Transfer' : 'New Disposal'} exportData={cur.data || []} exportName={`pm_${tab}`}>
      <div className="flex gap-1 border-b border-gray-200">
        {[['transfers', 'Transfers'], ['disposals', 'Disposals / Write-off']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium transition ${tab === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </div>
      {tab === 'transfers'
        ? <Table columns={trCols} rows={transfers.data || []} isLoading={transfers.isLoading} empty="No transfers" />
        : <Table columns={dpCols} rows={disposals.data || []} isLoading={disposals.isLoading} empty="No disposals" />}
      {showForm && tab === 'transfers' && <TransferForm onClose={() => setShowForm(false)} />}
      {showForm && tab === 'disposals' && <DisposalForm onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}
