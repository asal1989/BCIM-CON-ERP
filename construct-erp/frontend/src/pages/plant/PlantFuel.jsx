// src/pages/plant/PlantFuel.jsx — Fuel issue entry + register + mileage analysis
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, inputCls, inr, ddmmyyyy } from './_shared';

function FuelForm({ onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const { data: fuelTypes = [] } = useQuery({ queryKey: ['pm-fueltypes'], queryFn: () => plantAPI.listFuelTypes().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });

  const [f, setF] = useState({
    equipment_id: '', project_id: '', issue_date: new Date().toISOString().slice(0, 10),
    fuel_type_id: '', quantity: '', rate: '', current_reading: '', issued_by: '', remarks: '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const amount = (Number(f.quantity) || 0) * (Number(f.rate) || 0);

  const save = useMutation({
    mutationFn: (payload) => plantAPI.createFuel(payload),
    onSuccess: () => { toast.success('Fuel issue recorded'); qc.invalidateQueries({ queryKey: ['pm-fuel'] }); qc.invalidateQueries({ queryKey: ['pm-fuel-analysis'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const Field = ({ label, children, span }) => (
    <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}><label className="block text-xs font-medium text-gray-500">{label}</label>{children}</div>
  );

  return (
    <Modal title="Fuel Issue Entry" onClose={onClose} maxW="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="fuel-form" type="submit" disabled={save.isPending} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }>
      <form id="fuel-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate({ ...f, amount }); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *">
          <select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}>
            <option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}
          </select>
        </Field>
        <Field label="Fuel Type">
          <select className={inputCls} value={f.fuel_type_id} onChange={(e) => set('fuel_type_id', e.target.value)}>
            <option value="">—</option>{fuelTypes.map((ft) => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
          </select>
        </Field>
        <Field label="Project / Site">
          <select className={inputCls} value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputCls} value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} /></Field>
        <Field label="Quantity"><input type="number" step="0.01" className={inputCls} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
        <Field label="Rate (₹/unit)"><input type="number" step="0.01" className={inputCls} value={f.rate} onChange={(e) => set('rate', e.target.value)} /></Field>
        <Field label="Amount (auto)"><input className={inputCls} value={inr(amount)} disabled /></Field>
        <Field label="Meter / Hour Reading"><input type="number" step="0.01" className={inputCls} value={f.current_reading} onChange={(e) => set('current_reading', e.target.value)} /></Field>
        <Field label="Issued By"><input className={inputCls} value={f.issued_by} onChange={(e) => set('issued_by', e.target.value)} /></Field>
        <Field label="Remarks" span={2}><input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function PlantFuel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('register');
  const [showForm, setShowForm] = useState(false);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-fuel'],
    queryFn: () => plantAPI.listFuel().then((r) => r.data?.data || []).catch(() => []),
  });
  const { data: analysis = [] } = useQuery({
    queryKey: ['pm-fuel-analysis'],
    queryFn: () => plantAPI.fuelAnalysis().then((r) => r.data?.data || []).catch(() => []),
  });

  const delMut = useMutation({
    mutationFn: (id) => plantAPI.deleteFuel(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-fuel'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const regCols = [
    { key: 'issue_date', label: 'Date', render: (r) => ddmmyyyy(r.issue_date) },
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'fuel_type_name', label: 'Fuel' },
    { key: 'quantity', label: 'Qty' },
    { key: 'rate', label: 'Rate', render: (r) => inr(r.rate) },
    { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
    { key: 'current_reading', label: 'Reading' },
    { key: 'issued_by', label: 'Issued By' },
    { key: '_a', label: '', render: (r) => <button onClick={() => window.confirm('Delete?') && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];
  const anCols = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Equipment' },
    { key: 'total_fuel', label: 'Total Fuel', render: (r) => Number(r.total_fuel || 0).toFixed(2) },
    { key: 'total_fuel_cost', label: 'Fuel Cost', render: (r) => inr(r.total_fuel_cost) },
    { key: 'total_hours', label: 'Hours Run', render: (r) => Number(r.total_hours || 0).toFixed(1) },
    { key: 'fuel_per_hour', label: 'Fuel / Hour', render: (r) => r.fuel_per_hour ?? '—' },
  ];

  return (
    <PageShell title="Fuel Management" onRefresh={refetch} onAdd={() => setShowForm(true)} addLabel="Fuel Issue" exportData={tab === 'register' ? data : analysis} exportName={`pm_fuel_${tab}`}>
      <div className="flex gap-1 border-b border-gray-200">
        {[['register', 'Fuel Register'], ['analysis', 'Mileage / Running-Hour Analysis']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium transition ${tab === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </div>
      {tab === 'register'
        ? <Table columns={regCols} rows={data} isLoading={isLoading} empty="No fuel issues" />
        : <Table columns={anCols} rows={analysis} empty="No data" />}
      {showForm && <FuelForm onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}
