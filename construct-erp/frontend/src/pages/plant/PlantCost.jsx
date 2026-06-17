// src/pages/plant/PlantCost.jsx — Equipment cost booking to projects
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, inputCls, inr } from './_shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CostForm({ onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });
  const now = new Date();
  const [f, setF] = useState({ equipment_id: '', project_id: '', month: now.getMonth() + 1, year: now.getFullYear(), hours_used: '', rate_per_hour: '', cost_type: 'own' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const total = (Number(f.hours_used) || 0) * (Number(f.rate_per_hour) || 0);
  const save = useMutation({
    mutationFn: (p) => plantAPI.createCostAllocation(p),
    onSuccess: () => { toast.success('Cost booked'); qc.invalidateQueries({ queryKey: ['pm-cost'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  const Field = ({ label, children }) => (<div className="space-y-1"><label className="block text-xs font-medium text-gray-500">{label}</label>{children}</div>);
  return (
    <Modal title="Book Equipment Cost to Project" onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="cost-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="cost-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate({ ...f, total_cost: total }); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *"><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
        <Field label="Project"><select className={inputCls} value={f.project_id} onChange={(e) => set('project_id', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Month"><select className={inputCls} value={f.month} onChange={(e) => set('month', e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Year"><input type="number" className={inputCls} value={f.year} onChange={(e) => set('year', e.target.value)} /></Field>
        <Field label="Hours Used"><input type="number" step="0.1" className={inputCls} value={f.hours_used} onChange={(e) => set('hours_used', e.target.value)} /></Field>
        <Field label="Rate / Hour (₹)"><input type="number" step="0.01" className={inputCls} value={f.rate_per_hour} onChange={(e) => set('rate_per_hour', e.target.value)} /></Field>
        <Field label="Cost Type"><select className={inputCls} value={f.cost_type} onChange={(e) => set('cost_type', e.target.value)}><option value="own">Own</option><option value="hired">Hired</option></select></Field>
        <Field label="Total Cost (auto)"><input className={inputCls} value={inr(total)} disabled /></Field>
      </form>
    </Modal>
  );
}

export default function PlantCost() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-cost'],
    queryFn: () => plantAPI.listCostAllocation().then((r) => r.data?.data || []).catch(() => []),
  });
  const delMut = useMutation({
    mutationFn: (id) => plantAPI.deleteCostAllocation(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-cost'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const columns = [
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'project_name', label: 'Project' },
    { key: 'period', label: 'Period', render: (r) => `${MONTHS[(r.month || 1) - 1]} ${r.year || ''}` },
    { key: 'cost_type', label: 'Type', render: (r) => <span className="capitalize">{r.cost_type}</span> },
    { key: 'hours_used', label: 'Hours' },
    { key: 'rate_per_hour', label: 'Rate/hr', render: (r) => inr(r.rate_per_hour) },
    { key: 'total_cost', label: 'Total', render: (r) => inr(r.total_cost) },
    { key: '_a', label: '', render: (r) => <button onClick={() => window.confirm('Delete?') && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];
  return (
    <PageShell title="Billing & Cost Allocation" onRefresh={refetch} onAdd={() => setShowForm(true)} addLabel="Book Cost" exportData={data} exportName="pm_cost_allocation">
      <Table columns={columns} rows={data} isLoading={isLoading} empty="No cost bookings" />
      {showForm && <CostForm onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}
