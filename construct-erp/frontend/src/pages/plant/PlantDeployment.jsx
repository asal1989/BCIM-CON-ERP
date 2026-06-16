// src/pages/plant/PlantDeployment.jsx — Daily deployment entry + logbook
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, inputCls, ddmmyyyy } from './_shared';

function DeploymentForm({ onClose }) {
  const qc = useQueryClient();
  const { data: equipment = [] } = useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) });
  const { data: operators = [] } = useQuery({ queryKey: ['pm-operators'], queryFn: () => plantAPI.listOperators().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });

  const [f, setF] = useState({
    equipment_id: '', project_id: '', operator_id: '', deployment_date: new Date().toISOString().slice(0, 10),
    start_time: '', end_time: '', hours_worked: '', idle_hours: '', remarks: '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: (payload) => plantAPI.createDeployment(payload),
    onSuccess: () => { toast.success('Deployment logged'); qc.invalidateQueries({ queryKey: ['pm-deployment'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const Field = ({ label, children, span }) => (
    <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}><label className="block text-xs font-medium text-gray-500">{label}</label>{children}</div>
  );

  return (
    <Modal title="Daily Deployment Entry" onClose={onClose} maxW="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="dep-form" type="submit" disabled={save.isPending} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }>
      <form id="dep-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *">
          <select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}>
            <option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}
          </select>
        </Field>
        <Field label="Project / Site">
          <select className={inputCls} value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Operator">
          <select className={inputCls} value={f.operator_id} onChange={(e) => set('operator_id', e.target.value)}>
            <option value="">—</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputCls} value={f.deployment_date} onChange={(e) => set('deployment_date', e.target.value)} /></Field>
        <Field label="Start Time"><input type="time" className={inputCls} value={f.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
        <Field label="End Time"><input type="time" className={inputCls} value={f.end_time} onChange={(e) => set('end_time', e.target.value)} /></Field>
        <Field label="Hours Worked (auto if blank)"><input type="number" step="0.1" className={inputCls} value={f.hours_worked} onChange={(e) => set('hours_worked', e.target.value)} /></Field>
        <Field label="Idle / Standby Hours"><input type="number" step="0.1" className={inputCls} value={f.idle_hours} onChange={(e) => set('idle_hours', e.target.value)} /></Field>
        <Field label="Remarks" span={2}><input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function PlantDeployment() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-deployment'],
    queryFn: () => plantAPI.listDeployment().then((r) => r.data?.data || []).catch(() => []),
  });

  const delMut = useMutation({
    mutationFn: (id) => plantAPI.deleteDeployment(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-deployment'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const columns = [
    { key: 'deployment_date', label: 'Date', render: (r) => ddmmyyyy(r.deployment_date) },
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'project_name', label: 'Site' },
    { key: 'operator_name', label: 'Operator' },
    { key: 'start_time', label: 'Time', render: (r) => r.start_time ? `${r.start_time?.slice(0, 5)}–${r.end_time?.slice(0, 5) || ''}` : '—' },
    { key: 'hours_worked', label: 'Worked (h)' },
    { key: 'idle_hours', label: 'Idle (h)' },
    { key: '_a', label: '', render: (r) => <button onClick={() => window.confirm('Delete entry?') && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];

  return (
    <PageShell title="Deployment & Utilisation" onRefresh={refetch} onAdd={() => setShowForm(true)} addLabel="Log Deployment" exportData={data} exportName="pm_deployment">
      <Table columns={columns} rows={data} isLoading={isLoading} empty="No deployment entries yet" />
      {showForm && <DeploymentForm onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}
