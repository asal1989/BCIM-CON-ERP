import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Armchair, Download, Plus, Search } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { assetAPI, projectAPI } from '../../api/client';

const ADMIN_TYPES = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'office_equipment', label: 'Office Equipment' },
  { value: 'appliance', label: 'Air Conditioner / Appliance' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'security_equipment', label: 'Security Equipment' },
  { value: 'housekeeping_equipment', label: 'Housekeeping Equipment' },
  { value: 'other_admin', label: 'Other Admin Asset' },
];
const ADMIN_TYPE_CODES = ADMIN_TYPES.map((t) => t.value);
const adminTypeLabel = (value) => ADMIN_TYPES.find((t) => t.value === value)?.label || value || '-';

const listData = (r) => Array.isArray(r?.data?.data) ? r.data?.data : [];
const money = (v) => `Rs ${(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-');

export default function AdminAssetPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const { data: assets = [] } = useQuery({
    queryKey: ['admin-assets'],
    queryFn: () => assetAPI.list().then(listData),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(listData),
  });

  const adminAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const isAdmin = ADMIN_TYPE_CODES.includes(asset.asset_type);
      if (!isAdmin) return false;
      if (type !== 'all' && asset.asset_type !== type) return false;
      if (!q) return true;
      return [asset.asset_code, asset.asset_name, asset.asset_type, asset.brand, asset.model, asset.serial_number]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [assets, search, type]);

  const exportCsv = () => {
    const headers = ['Code', 'Asset', 'Type', 'Brand', 'Model', 'Serial No', 'Location', 'Status', 'Value', 'Warranty', 'AMC'];
    const rows = adminAssets.map((a) => [
      a.asset_code, a.asset_name, adminTypeLabel(a.asset_type), a.brand, a.model, a.serial_number,
      a.current_project_name || a.current_location || 'Office / HO', a.status,
      a.purchase_value || 0, date(a.warranty_expiry), date(a.amc_expiry),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `admin_assets_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-7">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Assets & IT</div>
          <h1 className="text-2xl font-black text-slate-950">Admin / Office Assets</h1>
          <p className="text-sm font-semibold text-slate-700">Furniture, AC, office equipment, electrical and admin-use assets</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900">
            <Download size={16} /> Export
          </button>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white">
            <Plus size={16} /> Add Admin Asset
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total Admin Assets" value={adminAssets.length} />
        <Kpi label="Active" value={adminAssets.filter((a) => a.status !== 'disposed').length} />
        <Kpi label="AMC Expiring" value={adminAssets.filter((a) => a.amc_expiry && dayjs(a.amc_expiry).isBefore(dayjs().add(30, 'day'))).length} />
        <Kpi label="Book Value" value={money(adminAssets.reduce((s, a) => s + Number(a.purchase_value || 0), 0))} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, asset, serial no..." className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900">
            <option value="all">All Admin Types</option>
            {ADMIN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                {['Asset Code', 'Asset', 'Type', 'Brand / Model', 'Serial No', 'Location', 'Status', 'Value', 'Warranty', 'AMC'].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adminAssets.map((a) => (
                <tr key={a.id} className="border-b border-slate-200">
                  <Td strong>{a.asset_code}</Td>
                  <Td strong>{a.asset_name}</Td>
                  <Td>{adminTypeLabel(a.asset_type)}</Td>
                  <Td>{[a.brand, a.model].filter(Boolean).join(' / ') || '-'}</Td>
                  <Td>{a.serial_number || '-'}</Td>
                  <Td>{a.current_project_name || 'Office / HO'}</Td>
                  <Td>{a.status || 'available'}</Td>
                  <Td>{money(a.purchase_value)}</Td>
                  <Td>{date(a.warranty_expiry)}</Td>
                  <Td>{date(a.amc_expiry)}</Td>
                </tr>
              ))}
              {adminAssets.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-sm font-bold text-slate-500">No admin assets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddAdminAssetModal projects={projects} onClose={() => setShowAdd(false)} onDone={() => qc.invalidateQueries({ queryKey: ['admin-assets'] })} />}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>
        <Armchair className="text-blue-700" size={18} />
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Td({ children, strong }) {
  return <td className={`px-3 py-3 align-top ${strong ? 'font-black text-slate-950' : 'font-semibold text-black'}`}>{children}</td>;
}

function AddAdminAssetModal({ projects, onClose, onDone }) {
  const [form, setForm] = useState({
    asset_code: '',
    asset_name: '',
    asset_type: 'furniture',
    brand: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    purchase_value: '',
    warranty_expiry: '',
    amc_expiry: '',
    current_location: '',
    notes: '',
  });

  const mut = useMutation({
    mutationFn: () => assetAPI.create({ ...form, meter_type: 'Nos', fuel_type: 'NA', current_meter: 0, hourly_rate: 0 }),
    onSuccess: () => { toast.success('Admin asset added'); onDone(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to add asset'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-black text-slate-950">Add Admin / Office Asset</h2>
          <button onClick={onClose} className="font-black text-slate-500">X</button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <Input label="Asset Code" value={form.asset_code} onChange={(v) => setForm({ ...form, asset_code: v })} />
          <Input label="Asset Name" value={form.asset_name} onChange={(v) => setForm({ ...form, asset_name: v })} />
          <Select label="Asset Type" value={form.asset_type} onChange={(v) => setForm({ ...form, asset_type: v })} options={ADMIN_TYPES.map((t) => [t.value, t.label])} />
          <Select label="Location / Project" value={form.current_location} onChange={(v) => setForm({ ...form, current_location: v })} options={projects.map((p) => [p.id, p.name])} optional />
          <Input label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
          <Input label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
          <Input label="Serial Number" value={form.serial_number} onChange={(v) => setForm({ ...form, serial_number: v })} />
          <Input label="Purchase Date" type="date" value={form.purchase_date} onChange={(v) => setForm({ ...form, purchase_date: v })} />
          <Input label="Purchase Value" type="number" value={form.purchase_value} onChange={(v) => setForm({ ...form, purchase_value: v })} />
          <Input label="Warranty Expiry" type="date" value={form.warranty_expiry} onChange={(v) => setForm({ ...form, warranty_expiry: v })} />
          <Input label="AMC Expiry" type="date" value={form.amc_expiry} onChange={(v) => setForm({ ...form, amc_expiry: v })} />
          <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900">Cancel</button>
          <button onClick={() => mut.mutate()} className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white">Save Asset</button>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, optional }) {
  return <label className="text-sm font-bold text-black">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold"><option value="">{optional ? 'Office / HO' : 'Select'}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

function Input({ label, value, onChange, type = 'text' }) {
  return <label className="text-sm font-bold text-black">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold" /></label>;
}
