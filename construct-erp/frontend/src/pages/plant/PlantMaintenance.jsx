// src/pages/plant/PlantMaintenance.jsx — PPM schedule, breakdowns, work orders, AMC
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI } from '../../api/client';
import { PageShell, Table, Modal, StatusBadge, inputCls, inr, ddmmyyyy } from './_shared';

function useEquipment() {
  return useQuery({ queryKey: ['pm-equipment'], queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []) }).data || [];
}
function useVendors() {
  return useQuery({ queryKey: ['pm-maintvendors'], queryFn: () => plantAPI.listMaintVendors().then((r) => r.data?.data || []).catch(() => []) }).data || [];
}

const Field = ({ label, children, span }) => (
  <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}><label className="block text-xs font-medium text-gray-500">{label}</label>{children}</div>
);

/* ── Schedule (PPM + Breakdown) ── */
function ScheduleForm({ onClose }) {
  const qc = useQueryClient();
  const equipment = useEquipment();
  const [f, setF] = useState({ equipment_id: '', maintenance_type: 'PPM', description: '', interval_days: '', last_done_date: '', due_date: '', reported_by: '', status: 'scheduled' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (p) => plantAPI.createSchedule(p),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['pm-schedule'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  return (
    <Modal title="Maintenance Schedule" onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="sch-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="sch-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *"><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
        <Field label="Type"><select className={inputCls} value={f.maintenance_type} onChange={(e) => set('maintenance_type', e.target.value)}><option value="PPM">PPM (Preventive)</option><option value="breakdown">Breakdown</option></select></Field>
        <Field label="Description" span={2}><input className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Interval (days)"><input type="number" className={inputCls} value={f.interval_days} onChange={(e) => set('interval_days', e.target.value)} /></Field>
        <Field label="Last Done Date"><input type="date" className={inputCls} value={f.last_done_date} onChange={(e) => set('last_done_date', e.target.value)} /></Field>
        <Field label="Due Date (auto from interval)"><input type="date" className={inputCls} value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
        <Field label="Reported By"><input className={inputCls} value={f.reported_by} onChange={(e) => set('reported_by', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

/* ── Work Order ── */
function WorkOrderForm({ onClose }) {
  const qc = useQueryClient();
  const equipment = useEquipment();
  const vendors = useVendors();
  const [f, setF] = useState({ equipment_id: '', vendor_id: '', wo_date: new Date().toISOString().slice(0, 10), description: '', estimated_cost: '', status: 'open' });
  const [parts, setParts] = useState([{ item_name: '', quantity: '', unit: '', rate: '' }]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setPart = (i, k, v) => setParts((p) => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const save = useMutation({
    mutationFn: (p) => plantAPI.createWorkOrder(p),
    onSuccess: () => { toast.success('Work order created'); qc.invalidateQueries({ queryKey: ['pm-workorders'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  return (
    <Modal title="Repair Work Order" onClose={onClose} maxW="max-w-3xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="wo-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="wo-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate({ ...f, spare_parts: parts.filter((p) => p.item_name) }); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Equipment *"><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
          <Field label="Vendor"><select className={inputCls} value={f.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="WO Date"><input type="date" className={inputCls} value={f.wo_date} onChange={(e) => set('wo_date', e.target.value)} /></Field>
          <Field label="Estimated Cost (₹)"><input type="number" className={inputCls} value={f.estimated_cost} onChange={(e) => set('estimated_cost', e.target.value)} /></Field>
          <Field label="Description" span={2}><input className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-gray-500">Spare Parts</span>
            <button type="button" onClick={() => setParts((p) => [...p, { item_name: '', quantity: '', unit: '', rate: '' }])} className="text-xs text-teal-600">+ Add row</button></div>
          {parts.map((p, i) => (
            <div key={i} className="mb-1 grid grid-cols-4 gap-2">
              <input className={inputCls} placeholder="Item" value={p.item_name} onChange={(e) => setPart(i, 'item_name', e.target.value)} />
              <input className={inputCls} type="number" placeholder="Qty" value={p.quantity} onChange={(e) => setPart(i, 'quantity', e.target.value)} />
              <input className={inputCls} placeholder="Unit" value={p.unit} onChange={(e) => setPart(i, 'unit', e.target.value)} />
              <input className={inputCls} type="number" placeholder="Rate" value={p.rate} onChange={(e) => setPart(i, 'rate', e.target.value)} />
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

/* ── AMC ── */
function AmcForm({ onClose }) {
  const qc = useQueryClient();
  const equipment = useEquipment();
  const vendors = useVendors();
  const [f, setF] = useState({ equipment_id: '', vendor_id: '', start_date: '', end_date: '', scope: '', annual_cost: '', status: 'active' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (p) => plantAPI.createAmc(p),
    onSuccess: () => { toast.success('AMC saved'); qc.invalidateQueries({ queryKey: ['pm-amc'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });
  return (
    <Modal title="AMC Contract" onClose={onClose} maxW="max-w-2xl"
      footer={<><button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button><button form="amc-form" type="submit" className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Save</button></>}>
      <form id="amc-form" onSubmit={(e) => { e.preventDefault(); if (!f.equipment_id) return toast.error('Equipment required'); save.mutate(f); }} className="grid grid-cols-2 gap-4">
        <Field label="Equipment *"><select className={inputCls} value={f.equipment_id} onChange={(e) => set('equipment_id', e.target.value)}><option value="">—</option>{equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}</select></Field>
        <Field label="Vendor"><select className={inputCls} value={f.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Start Date"><input type="date" className={inputCls} value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="End Date"><input type="date" className={inputCls} value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Annual Cost (₹)"><input type="number" className={inputCls} value={f.annual_cost} onChange={(e) => set('annual_cost', e.target.value)} /></Field>
        <Field label="Scope" span={2}><input className={inputCls} value={f.scope} onChange={(e) => set('scope', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function PlantMaintenance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('schedule');
  const [showForm, setShowForm] = useState(false);

  const schedule = useQuery({ queryKey: ['pm-schedule'], queryFn: () => plantAPI.listSchedule().then((r) => r.data?.data || []).catch(() => []) });
  const workOrders = useQuery({ queryKey: ['pm-workorders'], queryFn: () => plantAPI.listWorkOrders().then((r) => r.data?.data || []).catch(() => []) });
  const amc = useQuery({ queryKey: ['pm-amc'], queryFn: () => plantAPI.listAmc().then((r) => r.data?.data || []).catch(() => []) });

  const completeWO = useMutation({
    mutationFn: ({ id, cost }) => plantAPI.completeWorkOrder(id, { actual_cost: cost }),
    onSuccess: () => { toast.success('Work order completed'); qc.invalidateQueries({ queryKey: ['pm-workorders'] }); qc.invalidateQueries({ queryKey: ['pm-schedule'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const delSchedule = useMutation({ mutationFn: (id) => plantAPI.deleteSchedule(id), onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-schedule'] }); } });
  const delWO = useMutation({ mutationFn: (id) => plantAPI.deleteWorkOrder(id), onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-workorders'] }); } });
  const delAmc = useMutation({ mutationFn: (id) => plantAPI.deleteAmc(id), onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-amc'] }); } });

  const scheduleCols = [
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'maintenance_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'interval_days', label: 'Interval (d)' },
    { key: 'last_done_date', label: 'Last Done', render: (r) => ddmmyyyy(r.last_done_date) },
    { key: 'due_date', label: 'Next Due', render: (r) => ddmmyyyy(r.due_date) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: '_a', label: '', render: (r) => <button onClick={() => window.confirm('Delete?') && delSchedule.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];
  const woCols = [
    { key: 'wo_number', label: 'WO No.', render: (r) => <span className="font-mono text-xs font-semibold text-teal-700">{r.wo_number}</span> },
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'wo_date', label: 'Date', render: (r) => ddmmyyyy(r.wo_date) },
    { key: 'estimated_cost', label: 'Est.', render: (r) => inr(r.estimated_cost) },
    { key: 'actual_cost', label: 'Actual', render: (r) => inr(r.actual_cost) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_a', label: 'Actions', render: (r) => (
        <div className="flex gap-1">
          {r.status !== 'completed' && <button onClick={() => { const c = window.prompt('Actual cost (₹):', r.estimated_cost || 0); if (c !== null) completeWO.mutate({ id: r.id, cost: c }); }} className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Complete"><CheckCircle className="h-3.5 w-3.5" /></button>}
          <button onClick={() => window.confirm('Delete?') && delWO.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];
  const amcCols = [
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'start_date', label: 'Start', render: (r) => ddmmyyyy(r.start_date) },
    { key: 'end_date', label: 'End', render: (r) => ddmmyyyy(r.end_date) },
    { key: 'annual_cost', label: 'Annual Cost', render: (r) => inr(r.annual_cost) },
    { key: 'scope', label: 'Scope' },
    { key: '_a', label: '', render: (r) => <button onClick={() => window.confirm('Delete?') && delAmc.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button> },
  ];

  const cur = tab === 'schedule' ? schedule : tab === 'workorders' ? workOrders : amc;

  return (
    <PageShell title="Maintenance & Repairs" onRefresh={cur.refetch} onAdd={() => setShowForm(true)}
      addLabel={tab === 'schedule' ? 'Add Schedule' : tab === 'workorders' ? 'New Work Order' : 'New AMC'}
      exportData={cur.data || []} exportName={`pm_${tab}`}>
      <div className="flex gap-1 border-b border-gray-200">
        {[['schedule', 'PPM / Breakdown Schedule'], ['workorders', 'Work Orders'], ['amc', 'AMC Contracts']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium transition ${tab === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </div>
      {tab === 'schedule' && <Table columns={scheduleCols} rows={schedule.data || []} isLoading={schedule.isLoading} empty="No schedules" />}
      {tab === 'workorders' && <Table columns={woCols} rows={workOrders.data || []} isLoading={workOrders.isLoading} empty="No work orders" />}
      {tab === 'amc' && <Table columns={amcCols} rows={amc.data || []} isLoading={amc.isLoading} empty="No AMC contracts" />}
      {showForm && tab === 'schedule' && <ScheduleForm onClose={() => setShowForm(false)} />}
      {showForm && tab === 'workorders' && <WorkOrderForm onClose={() => setShowForm(false)} />}
      {showForm && tab === 'amc' && <AmcForm onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}
