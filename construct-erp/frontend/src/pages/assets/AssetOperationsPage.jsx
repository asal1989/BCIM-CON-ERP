import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CalendarClock, CheckCircle2, Download, Plus, Search, Wrench } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { assetAPI, projectAPI } from '../../api/client';

const money = (v) => `Rs ${(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');
const listData = (r) => Array.isArray(r?.data?.data) ? r.data?.data : [];

export default function AssetOperationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('alerts');
  const [query, setQuery] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);

  const { data: assets = [] } = useQuery({ queryKey: ['assets-fleet'], queryFn: () => assetAPI.list().then(listData) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(listData) });
  const { data: alerts = [] } = useQuery({ queryKey: ['asset-alerts'], queryFn: () => assetAPI.alerts().then(listData) });
  const { data: movements = [] } = useQuery({ queryKey: ['asset-movements'], queryFn: () => assetAPI.movements().then(listData) });
  const { data: maintenance = [] } = useQuery({ queryKey: ['asset-maintenance'], queryFn: () => assetAPI.maintenanceLogs().then(listData) });

  const filteredMovements = useMemo(() => filterRows(movements, query), [movements, query]);
  const filteredMaintenance = useMemo(() => filterRows(maintenance, query), [maintenance, query]);
  const filteredAlerts = useMemo(() => filterRows(alerts, query), [alerts, query]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['assets-fleet'] });
    qc.invalidateQueries({ queryKey: ['asset-alerts'] });
    qc.invalidateQueries({ queryKey: ['asset-movements'] });
    qc.invalidateQueries({ queryKey: ['asset-maintenance'] });
  };

  const returnMut = useMutation({
    mutationFn: (id) => assetAPI.returnAsset(id, {}),
    onSuccess: () => { toast.success('Asset marked as returned'); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Return failed'),
  });

  const closeMut = useMutation({
    mutationFn: (id) => assetAPI.closeMaintenance(id, {}),
    onSuccess: () => { toast.success('Maintenance closed'); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Close failed'),
  });

  const exportRows = () => {
    const rows = tab === 'alerts' ? filteredAlerts : tab === 'movements' ? filteredMovements : filteredMaintenance;
    const csv = rows.map((row) => Object.values(row).map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `asset_${tab}_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-7">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Assets & IT</div>
          <h1 className="text-2xl font-bold text-slate-950">Asset Operations</h1>
          <p className="text-sm font-semibold text-slate-700">Movement, maintenance, breakdown and expiry control desk</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowTransfer(true)} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white"><ArrowRightLeft size={16} /> Transfer</button>
          <button onClick={() => setShowMaintenance(true)} className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-white"><Wrench size={16} /> Maintenance</button>
          <button onClick={exportRows} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"><Download size={16} /> Export</button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Alerts" value={alerts.length} icon={AlertTriangle} tone="text-red-700" />
        <Kpi label="Open Transfers" value={movements.filter((m) => !m.return_date).length} icon={ArrowRightLeft} tone="text-blue-700" />
        <Kpi label="Open Maintenance" value={maintenance.filter((m) => m.status !== 'closed').length} icon={Wrench} tone="text-amber-700" />
        <Kpi label="Total Cost" value={money(maintenance.reduce((s, m) => s + Number(m.total_cost || 0), 0))} icon={CalendarClock} tone="text-emerald-700" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Tab active={tab === 'alerts'} onClick={() => setTab('alerts')}>Alerts</Tab>
            <Tab active={tab === 'movements'} onClick={() => setTab('movements')}>Movements</Tab>
            <Tab active={tab === 'maintenance'} onClick={() => setTab('maintenance')}>Maintenance</Tab>
          </div>
          <div className="relative min-w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search asset, project, status..." className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500" />
          </div>
        </div>

        {tab === 'alerts' && <AlertsTable rows={filteredAlerts} />}
        {tab === 'movements' && <MovementsTable rows={filteredMovements} onReturn={(id) => returnMut.mutate(id)} />}
        {tab === 'maintenance' && <MaintenanceTable rows={filteredMaintenance} onClose={(id) => closeMut.mutate(id)} />}
      </div>

      {showTransfer && <TransferModal assets={assets} projects={projects} onClose={() => setShowTransfer(false)} onDone={refresh} />}
      {showMaintenance && <MaintenanceModal assets={assets} projects={projects} onClose={() => setShowMaintenance(false)} onDone={refresh} />}
    </div>
  );
}

function filterRows(rows, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
}

function Kpi({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={tone} size={18} />
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-md px-4 py-2 text-sm font-bold ${active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-black'}`}>{children}</button>;
}

function AlertsTable({ rows }) {
  return <Table headers={['Asset', 'Type', 'Status', 'Alert', 'Warranty', 'AMC', 'Service']}>
    {rows.map((r) => <tr key={`${r.id}-${r.alert_type}`} className="border-b border-slate-200">
      <Td strong>{r.asset_code} - {r.asset_name}</Td><Td>{r.asset_type}</Td><Td>{r.status}</Td><Td danger>{r.alert_type}</Td><Td>{date(r.warranty_expiry)}</Td><Td>{date(r.amc_expiry)}</Td><Td>{date(r.next_service_date)}</Td>
    </tr>)}
  </Table>;
}

function MovementsTable({ rows, onReturn }) {
  return <Table headers={['Date', 'Asset', 'From', 'To', 'Expected Return', 'Condition', 'Status', 'Action']}>
    {rows.map((r) => <tr key={r.id} className="border-b border-slate-200">
      <Td>{date(r.movement_date)}</Td><Td strong>{r.asset_code} - {r.asset_name}</Td><Td>{r.from_project_name || 'Yard'}</Td><Td>{r.to_project_name || 'Yard'}</Td><Td>{date(r.expected_return_date)}</Td><Td>{r.condition_out || '-'}</Td><Td>{r.return_date ? 'Returned' : 'Open'}</Td>
      <Td>{!r.return_date && <button onClick={() => onReturn(r.id)} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Return</button>}</Td>
    </tr>)}
  </Table>;
}

function MaintenanceTable({ rows, onClose }) {
  return <Table headers={['Date', 'Asset', 'Project', 'Type', 'Status', 'Problem', 'Cost', 'Next Service', 'Action']}>
    {rows.map((r) => <tr key={r.id} className="border-b border-slate-200">
      <Td>{date(r.issue_date)}</Td><Td strong>{r.asset_code} - {r.asset_name}</Td><Td>{r.project_name || '-'}</Td><Td>{r.maintenance_type}</Td><Td>{r.status}</Td><Td>{r.problem_description || '-'}</Td><Td>{money(r.total_cost)}</Td><Td>{date(r.next_service_date)}</Td>
      <Td>{r.status !== 'closed' && <button onClick={() => onClose(r.id)} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Close</button>}</Td>
    </tr>)}
  </Table>;
}

function Table({ headers, children }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-100"><tr>{headers.map((h) => <th key={h} className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-700">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Td({ children, strong, danger }) {
  return <td className={`px-3 py-3 align-top ${strong ? 'font-bold text-slate-950' : 'font-semibold text-black'} ${danger ? 'text-red-700' : ''}`}>{children}</td>;
}

function TransferModal({ assets, projects, onClose, onDone }) {
  const [form, setForm] = useState({ asset_id: '', to_project_id: '', movement_date: dayjs().format('YYYY-MM-DD'), condition_out: 'Good', remarks: '' });
  const mut = useMutation({
    mutationFn: () => assetAPI.transfer(form),
    onSuccess: () => { toast.success('Asset transferred'); onDone(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Transfer failed'),
  });
  return <Modal title="Transfer Asset" onClose={onClose} onSubmit={() => mut.mutate()} submit="Transfer">
    <Select label="Asset" value={form.asset_id} onChange={(v) => setForm({ ...form, asset_id: v })} options={assets.map((a) => [a.id, `${a.asset_code} - ${a.asset_name}`])} />
    <Select label="To Project" value={form.to_project_id} onChange={(v) => setForm({ ...form, to_project_id: v })} options={projects.map((p) => [p.id, p.name])} />
    <Input label="Movement Date" type="date" value={form.movement_date} onChange={(v) => setForm({ ...form, movement_date: v })} />
    <Input label="Condition Out" value={form.condition_out} onChange={(v) => setForm({ ...form, condition_out: v })} />
    <Input label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} />
  </Modal>;
}

function MaintenanceModal({ assets, projects, onClose, onDone }) {
  const [form, setForm] = useState({ asset_id: '', project_id: '', maintenance_type: 'preventive', issue_date: dayjs().format('YYYY-MM-DD'), problem_description: '', service_vendor: '', labor_cost: 0, parts_cost: 0, next_service_date: '' });
  const mut = useMutation({
    mutationFn: () => assetAPI.maintenance(form),
    onSuccess: () => { toast.success('Maintenance logged'); onDone(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Maintenance failed'),
  });
  return <Modal title="Log Maintenance / Breakdown" onClose={onClose} onSubmit={() => mut.mutate()} submit="Save">
    <Select label="Asset" value={form.asset_id} onChange={(v) => setForm({ ...form, asset_id: v })} options={assets.map((a) => [a.id, `${a.asset_code} - ${a.asset_name}`])} />
    <Select label="Project" value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={projects.map((p) => [p.id, p.name])} optional />
    <Select label="Type" value={form.maintenance_type} onChange={(v) => setForm({ ...form, maintenance_type: v })} options={[['preventive', 'Preventive'], ['breakdown', 'Breakdown'], ['repair', 'Repair']]} />
    <Input label="Issue Date" type="date" value={form.issue_date} onChange={(v) => setForm({ ...form, issue_date: v })} />
    <Input label="Problem / Scope" value={form.problem_description} onChange={(v) => setForm({ ...form, problem_description: v })} />
    <Input label="Service Vendor" value={form.service_vendor} onChange={(v) => setForm({ ...form, service_vendor: v })} />
    <Input label="Labor Cost" type="number" value={form.labor_cost} onChange={(v) => setForm({ ...form, labor_cost: v })} />
    <Input label="Parts Cost" type="number" value={form.parts_cost} onChange={(v) => setForm({ ...form, parts_cost: v })} />
    <Input label="Next Service Date" type="date" value={form.next_service_date} onChange={(v) => setForm({ ...form, next_service_date: v })} />
  </Modal>;
}

function Modal({ title, children, onClose, onSubmit, submit }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-lg bg-white shadow-xl"><div className="flex items-center justify-between border-b p-4"><h2 className="text-lg font-black text-slate-950">{title}</h2><button onClick={onClose} className="text-slate-500">X</button></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div><div className="flex justify-end gap-2 border-t p-4"><button onClick={onClose} className="rounded border px-4 py-2 font-bold">Cancel</button><button onClick={onSubmit} className="inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 font-bold text-white"><Plus size={16} /> {submit}</button></div></div></div>;
}

function Select({ label, value, onChange, options, optional }) {
  return <label className="text-sm font-bold text-black">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold"><option value="">{optional ? 'Optional' : 'Select'}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

function Input({ label, value, onChange, type = 'text' }) {
  return <label className="text-sm font-bold text-black">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold" /></label>;
}
