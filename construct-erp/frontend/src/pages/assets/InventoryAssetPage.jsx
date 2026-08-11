import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  IndianRupee,
  PackageCheck,
  Plus,
  Search,
  Wrench,
} from 'lucide-react';
import { assetAPI, projectAPI } from '../../api/client';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const fmtMoney = (v) => `Rs ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const listData = (r) => r.data?.data ?? r.data ?? [];

const STATUS_LABELS = {
  available: 'Idle',
  assigned: 'Deployed',
  maintenance: 'Service',
  breakdown: 'Breakdown',
  disposed: 'Disposed',
};

const ASSET_TYPE_LABELS = {
  office_equipment: 'Office Equipment',
  furniture: 'Furniture',
  appliance: 'Air Conditioner / Appliance',
  electrical: 'Electrical',
  security_equipment: 'Security Equipment',
  housekeeping_equipment: 'Housekeeping',
  other_admin: 'Other Admin',
};

const assetTypeLabel = (value) => ASSET_TYPE_LABELS[value] || value || '-';

export default function InventoryAssetPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('assets');
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple'],
    queryFn: () => projectAPI.list().then(listData),
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['asset-inventory-assets'],
    queryFn: () => assetAPI.list().then(listData),
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ['asset-inventory-movements'],
    queryFn: () => assetAPI.movements().then(listData),
  });

  const projectOptions = useMemo(() => {
    const fromAssets = assets.map(a => a.current_project_name).filter(Boolean);
    const fromProjects = projects.map(p => p.name).filter(Boolean);
    return [...new Set([...fromProjects, ...fromAssets])].sort();
  }, [assets, projects]);

  const filteredAssets = useMemo(() => assets.filter((asset) => {
    if (filterProject !== 'all' && asset.current_project_name !== filterProject) return false;
    if (filterStatus !== 'all' && asset.status !== filterStatus) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [
      asset.asset_code,
      asset.asset_name,
      asset.asset_type,
      asset.brand,
      asset.model,
      asset.serial_number,
      asset.po_number,
      asset.invoice_number,
      asset.current_project_name,
      asset.vendor_name,
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [assets, filterProject, filterStatus, search]);

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    if (filterProject !== 'all' && movement.from_project_name !== filterProject && movement.to_project_name !== filterProject) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [
      movement.asset_code,
      movement.asset_name,
      movement.asset_type,
      movement.from_project_name,
      movement.to_project_name,
      movement.movement_type,
      movement.issued_by_name,
      movement.received_by_name,
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [movements, filterProject, search]);

  const summary = useMemo(() => {
    const activeAssets = filteredAssets.filter(a => a.status !== 'disposed');
    return {
      totalAssets: filteredAssets.length,
      bookValue: filteredAssets.reduce((sum, a) => sum + Number(a.purchase_value || 0), 0),
      deployed: filteredAssets.filter(a => a.status === 'assigned').length,
      service: filteredAssets.filter(a => a.status === 'maintenance').length,
      missingRefs: filteredAssets.filter(a => !a.po_number || !a.invoice_number).length,
      activeAssets: activeAssets.length,
    };
  }, [filteredAssets]);

  const exportRows = () => {
    const rows = tab === 'assets'
      ? [['Asset Code', 'Asset', 'Type', 'Project', 'Status', 'PO Number', 'Invoice Number', 'Vendor', 'Book Value'], ...filteredAssets.map(a => [
        a.asset_code, a.asset_name, assetTypeLabel(a.asset_type), a.current_project_name || 'Unassigned',
        STATUS_LABELS[a.status] || a.status || '-', a.po_number || '', a.invoice_number || '', a.vendor_name || '', a.purchase_value || 0,
      ])]
      : [['Date', 'Asset Code', 'Asset', 'Movement', 'From', 'To', 'Issued By', 'Received By', 'Status'], ...filteredMovements.map(m => [
        m.movement_date ? dayjs(m.movement_date).format('DD/MM/YYYY') : '',
        m.asset_code, m.asset_name, m.movement_type, m.from_project_name || '',
        m.to_project_name || '', m.issued_by_name || '', m.received_by_name || '', m.return_date ? 'Returned' : 'Open',
      ])];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `asset_inventory_${tab}_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
  };

  const loading = assetsLoading || movementsLoading;

  return (
    <div className="min-h-screen bg-[#f4f6f9] p-6 md:p-8">
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <Boxes className="w-4 h-4 text-blue-600" /> Assets & IT
            </div>
            <h1 className="text-2xl font-bold text-slate-950 mt-1">Asset Inventory</h1>
            <p className="text-sm font-semibold text-slate-600">Fixed assets, tools, P&M, PO references, invoice references and deployment stock.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportRows} className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-black hover:border-blue-300 flex items-center gap-2">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => navigate('/assets')} className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> Open Asset Register
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          <Metric icon={Boxes} label="Assets Listed" value={summary.totalAssets} tone="blue" />
          <Metric icon={PackageCheck} label="Active Assets" value={summary.activeAssets} tone="emerald" />
          <Metric icon={ArrowRightLeft} label="Deployed" value={summary.deployed} tone="blue" />
          <Metric icon={Wrench} label="In Service" value={summary.service} tone="amber" />
          <Metric icon={FileText} label="PO/Invoice Missing" value={summary.missingRefs} tone="slate" />
          <Metric icon={IndianRupee} label="Book Value" value={fmtMoney(summary.bookValue)} tone="emerald" />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          This page is only for assets. Stores materials are maintained separately under Stores &gt; Store Ledger.
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
              {[
                ['assets', 'Asset Stock'],
                ['movements', 'Movement Register'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={clsx(
                    'px-4 py-2 rounded-md text-sm font-bold transition-all',
                    tab === value ? 'bg-slate-950 text-white shadow-sm' : 'text-black hover:bg-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search asset, PO, invoice, vendor, serial..."
                className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-400"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="h-10 min-w-[250px] rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
              >
                <option value="all">All Projects / Locations</option>
                {projectOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {tab === 'assets' && (
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-10 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
              >
                <option value="all">All Status</option>
                <option value="available">Idle</option>
                <option value="assigned">Deployed</option>
                <option value="maintenance">Service</option>
                <option value="breakdown">Breakdown</option>
                <option value="disposed">Disposed</option>
              </select>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm font-bold text-slate-500">Loading asset inventory...</div>
          ) : tab === 'assets' ? (
            <AssetStockTable rows={filteredAssets} />
          ) : (
            <MovementTable rows={filteredMovements} />
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  const colors = {
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    slate: 'text-black bg-slate-50 border-slate-200',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', colors[tone])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-xl font-bold text-slate-950 break-words">{value}</div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function AssetStockTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1320px] text-sm border-collapse">
        <thead className="bg-[#173b70] text-white">
          <tr>
            {['Asset Code', 'Asset', 'Type', 'Project / Location', 'Status', 'PO Number', 'Invoice Number', 'Vendor', 'Book Value'].map(h => (
              <th key={h} className={clsx('px-4 py-3 text-xs font-bold uppercase border border-blue-950/20', h === 'Book Value' ? 'text-right' : 'text-left')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((asset, idx) => (
            <tr key={asset.id || `${asset.asset_code}-${idx}`} className="hover:bg-blue-50/40">
              <td className="px-4 py-3 border border-slate-200 font-mono font-bold text-blue-700">{asset.asset_code || '-'}</td>
              <td className="px-4 py-3 border border-slate-200">
                <div className="font-bold text-slate-950">{asset.asset_name || '-'}</div>
                <div className="text-xs font-semibold text-slate-500">{[asset.brand, asset.model, asset.serial_number].filter(Boolean).join(' | ') || 'No brand / model / serial'}</div>
              </td>
              <td className="px-4 py-3 border border-slate-200 font-bold text-black">{assetTypeLabel(asset.asset_type)}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{asset.current_project_name || 'Unassigned'}</td>
              <td className="px-4 py-3 border border-slate-200"><StatusBadge status={asset.status} /></td>
              <td className="px-4 py-3 border border-slate-200 font-mono font-bold text-black">{asset.po_number || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-mono font-bold text-black">{asset.invoice_number || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{asset.vendor_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 text-right font-mono font-bold text-slate-950">{fmtMoney(asset.purchase_value)}</td>
            </tr>
          ))}
          {!rows.length && <EmptyRow colSpan={9} label="No asset records found" />}
        </tbody>
      </table>
    </div>
  );
}

function MovementTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm border-collapse">
        <thead className="bg-[#173b70] text-white">
          <tr>
            {['Date', 'Asset Code', 'Asset', 'Movement', 'From', 'To', 'Issued By', 'Received By', 'Status'].map(h => (
              <th key={h} className="px-4 py-3 text-xs font-bold uppercase border border-blue-950/20 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((movement, idx) => (
            <tr key={movement.id || `${movement.asset_code}-${idx}`} className="hover:bg-blue-50/40">
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{movement.movement_date ? dayjs(movement.movement_date).format('DD/MM/YYYY') : '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-mono font-bold text-blue-700">{movement.asset_code || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-bold text-slate-950">{movement.asset_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-bold text-black">{movement.movement_type || 'transfer'}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{movement.from_project_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{movement.to_project_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{movement.issued_by_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200 font-semibold text-black">{movement.received_by_name || '-'}</td>
              <td className="px-4 py-3 border border-slate-200">{movement.return_date ? <Badge tone="green">Returned</Badge> : <Badge tone="blue">Open</Badge>}</td>
            </tr>
          ))}
          {!rows.length && <EmptyRow colSpan={9} label="No movement records found" />}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = status === 'assigned' ? 'blue'
    : status === 'maintenance' ? 'amber'
      : status === 'breakdown' ? 'red'
        : status === 'disposed' ? 'slate'
          : 'green';
  return <Badge tone={tone}>{STATUS_LABELS[status] || status || 'Idle'}</Badge>;
}

function Badge({ tone, children }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-100 text-black border-slate-200',
  };
  return <span className={clsx('inline-flex px-2.5 py-1 rounded-md border text-xs font-bold whitespace-nowrap', styles[tone])}>{children}</span>;
}

function EmptyRow({ colSpan, label }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-14 text-center border border-slate-200">
        <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <div className="text-sm font-bold text-slate-500">{label}</div>
      </td>
    </tr>
  );
}
