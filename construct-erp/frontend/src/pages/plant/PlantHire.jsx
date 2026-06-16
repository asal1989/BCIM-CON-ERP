// src/pages/plant/PlantHire.jsx — Hire-In and Hire-Out management
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, StatusBadge, inputCls, inr, ddmmyyyy } from './_shared';

const RATE_TYPES = ['hourly', 'daily', 'monthly'];
const HIRE_IN_STATUS = ['requested', 'ordered', 'deployed', 'returned', 'invoiced'];
const HIRE_OUT_STATUS = ['requested', 'ordered', 'returned', 'invoiced'];

function HireForm({ mode, record, onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });
  const isIn = mode === 'in';
  const statuses = isIn ? HIRE_IN_STATUS : HIRE_OUT_STATUS;

  const [f, setF] = useState(() => ({
    equipment_id: record?.equipment_id || '',
    equipment_desc: record?.equipment_desc || '',
    vendor_name: record?.vendor_name || '',
    client_name: record?.client_name || '',
    project_id: record?.project_id || '',
    hire_rate: record?.hire_rate || '',
    rate_type: record?.rate_type || 'daily',
    start_date: record?.start_date?.slice(0, 10) || '',
    end_date: record?.end_date?.slice(0, 10) || '',
    status: record?.status || 'requested',
    remarks: record?.remarks || '',
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: (payload) => {
      if (isIn) return record ? plantAPI.updateHireIn(record.id, payload) : plantAPI.createHireIn(payload);
      return record ? plantAPI.updateHireOut(record.id, payload) : plantAPI.createHireOut(payload);
    },
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['pm-hire', mode] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const Field = ({ label, children, span }) => (
    <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <label className="block text-xs font-medium text-gray-500">{label}</label>{children}
    </div>
  );

  return (
    <Modal title={`${record ? 'Edit' : 'New'} Hire-${isIn ? 'In' : 'Out'} Order`} onClose={onClose} maxW="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="hire-form" type="submit" disabled={save.isPending} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }>
      <form id="hire-form" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment">
          <select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}>
            <option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}
          </select>
        </Field>
        {isIn
          ? <Field label="Equipment Description"><input className={inputCls} value={f.equipment_desc} onChange={(e) => set('equipment_desc', e.target.value)} placeholder="If not in register" /></Field>
          : <Field label="Client Name"><input className={inputCls} value={f.client_name} onChange={(e) => set('client_name', e.target.value)} /></Field>}
        {isIn && <Field label="Vendor Name"><input className={inputCls} value={f.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} /></Field>}
        <Field label="Project / Site">
          <select className={inputCls} value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Hire Rate (₹)"><input type="number" className={inputCls} value={f.hire_rate} onChange={(e) => set('hire_rate', e.target.value)} /></Field>
        <Field label="Rate Type">
          <select className={inputCls} value={f.rate_type} onChange={(e) => set('rate_type', e.target.value)}>{RATE_TYPES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}</select>
        </Field>
        <Field label="Start Date"><input type="date" className={inputCls} value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="End Date"><input type="date" className={inputCls} value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Status">
          <select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>{statuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</select>
        </Field>
        <Field label="Remarks" span={2}><input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function PlantHire() {
  const qc = useQueryClient();
  const [mode, setMode] = useState('in');
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-hire', mode],
    queryFn: () => (mode === 'in' ? plantAPI.listHireIn() : plantAPI.listHireOut()).then((r) => r.data?.data || []).catch(() => []),
  });

  const delMut = useMutation({
    mutationFn: (id) => (mode === 'in' ? plantAPI.deleteHireIn(id) : plantAPI.deleteHireOut(id)),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-hire', mode] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const columns = [
    { key: 'order_no', label: 'Order No.', render: (r) => <span className="font-mono text-xs font-semibold text-teal-700">{r.order_no}</span> },
    { key: 'equipment_name', label: 'Equipment', render: (r) => r.equipment_name || r.equipment_desc || '—' },
    mode === 'in'
      ? { key: 'vendor_name', label: 'Vendor' }
      : { key: 'client_name', label: 'Client' },
    { key: 'project_name', label: 'Project' },
    { key: 'hire_rate', label: 'Rate', render: (r) => `${inr(r.hire_rate)} / ${r.rate_type}` },
    { key: 'start_date', label: 'Period', render: (r) => `${ddmmyyyy(r.start_date)} → ${ddmmyyyy(r.end_date)}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_a', label: 'Actions', render: (r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditRec(r); setShowForm(true); }} className="rounded p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={() => window.confirm('Delete this order?') && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <PageShell title="Hire Management" onRefresh={refetch} onAdd={() => { setEditRec(null); setShowForm(true); }} addLabel={`New Hire-${mode === 'in' ? 'In' : 'Out'}`} exportData={data} exportName={`pm_hire_${mode}`}>
      <div className="flex gap-1 border-b border-gray-200">
        {[['in', 'Hire-In'], ['out', 'Hire-Out']].map(([k, lbl]) => (
          <button key={k} onClick={() => setMode(k)} className={`px-4 py-2 text-xs font-medium transition ${mode === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </div>
      <Table columns={columns} rows={data} isLoading={isLoading} />
      {showForm && <HireForm mode={mode} record={editRec} onClose={() => { setShowForm(false); setEditRec(null); }} />}
    </PageShell>
  );
}
