// src/pages/it/ITAssetPage.jsx  — Full IT Asset Management
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useForm } from 'react-hook-form';
import {
  Cpu, Plus, X, AlertTriangle, Monitor, Server, Laptop, Network,
  Printer, ShieldAlert, HelpCircle, Zap, Search, RefreshCw,
  Edit2, Trash2, QrCode, ChevronRight, BarChart2, CheckCircle,
  Clock, Package, Settings, Eye, Upload, Download, FileSpreadsheet,
  Wrench, History, Shield, User, MapPin, ChevronDown, ChevronUp,
  Wifi, HardDrive, Cpu as CpuIcon,
} from 'lucide-react';
import { itAssetAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import AssetBarcodeCard from '../../components/common/AssetBarcodeCard';
import RecordAttachments from '../../components/shared/RecordAttachments';

/* ─── Constants ──────────────────────────────────────────────── */
const ASSET_TYPES = [
  { key: 'all',       label: 'All Assets',  Icon: Package,    color: '#1a73e8' },
  { key: 'laptop',    label: 'Laptops',     Icon: Laptop,     color: '#1a73e8' },
  { key: 'desktop',   label: 'Desktops',    Icon: Monitor,    color: '#1a73e8' },
  { key: 'server',    label: 'Servers',     Icon: Server,     color: '#6c35de' },
  { key: 'network',   label: 'Network',     Icon: Network,    color: '#0f9d58' },
  { key: 'cctv',      label: 'CCTV',        Icon: Eye,        color: '#f4a100' },
  { key: 'biometric', label: 'Biometric',   Icon: ShieldAlert,color: '#f4a100' },
  { key: 'printer',   label: 'Printers',    Icon: Printer,    color: '#5f6368' },
  { key: 'ups',       label: 'UPS',         Icon: Zap,        color: '#d93025' },
  { key: 'other',     label: 'Others',      Icon: HelpCircle, color: '#5f6368' },
];

const STATUS_OPTIONS = [
  { key: 'all',          label: 'All Status',    dot: '#9aa0a6' },
  { key: 'in_use',       label: 'In Use',        dot: '#0f9d58' },
  { key: 'available',    label: 'Available',     dot: '#1a73e8' },
  { key: 'under_repair', label: 'Under Repair',  dot: '#f4a100' },
  { key: 'retired',      label: 'Retired',       dot: '#9aa0a6' },
  { key: 'lost',         label: 'Lost / Stolen', dot: '#d93025' },
];

const STATUS_BADGE = {
  in_use:       'bg-green-50 text-green-700 border border-green-200',
  available:    'bg-blue-50 text-blue-700 border border-blue-200',
  under_repair: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  retired:      'bg-gray-100 text-slate-600 border border-gray-200',
  lost:         'bg-red-50 text-red-700 border border-red-200',
};

const LABEL = {
  in_use: 'In Use', available: 'Available',
  under_repair: 'Under Repair', retired: 'Retired', lost: 'Lost/Stolen',
};

const TYPE_ICON = Object.fromEntries(ASSET_TYPES.slice(1).map(t => [t.key, t]));
const inputCls = 'w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition';
const IT_TYPE_CODES = {
  laptop: 'LT',
  desktop: 'DT',
  server: 'SRV',
  network: 'NET',
  cctv: 'CCTV',
  biometric: 'BIO',
  printer: 'PRN',
  ups: 'UPS',
  other: 'OTH',
};

function normalizeItAssetTag(value, assetType = 'other') {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!raw) return raw;
  if (raw.startsWith('BCIM-IT-')) return raw;
  if (raw.startsWith('BCIM-')) return `BCIM-IT-${raw.slice(5).replace(/^IT-/, '')}`;
  if (raw.startsWith('IT-')) return `BCIM-${raw}`;
  const typeCode = IT_TYPE_CODES[String(assetType || '').toLowerCase()] || 'OTH';
  if (raw.startsWith(`${typeCode}-`) || raw.startsWith(typeCode)) return `BCIM-IT-${raw}`;
  return `BCIM-IT-${typeCode}-${raw}`;
}

function FormField({ label, children, span = 1 }) {
  return (
    <div className={clsx('space-y-1', span === 2 && 'col-span-2', span === 3 && 'col-span-3')}>
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function itAssetTitle(asset) {
  return `${asset.brand || ''} ${asset.model || ''}`.trim() || asset.asset_tag || '-';
}

function itAssetQrPayload(asset) {
  return [
    'Company: BCIM Engineering Pvt Ltd',
    `Item: ${itAssetTitle(asset)}`,
    `Serial: ${asset.serial_number || '-'}`,
    `Asset ID: ${asset.asset_tag || '-'}`,
  ].join('\n');
}


/* ─── Main Component ─────────────────────────────────────────── */
export default function ITAssetPage() {
  const [showForm,      setShowForm]      = useState(false);
  const [editAsset,     setEditAsset]     = useState(null);
  const [detailId,      setDetailId]      = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null); // for QR modal
  const [filterType,    setFilterType]    = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [search,        setSearch]        = useState('');
  const [importing,     setImporting]     = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState(() => new Set());
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setValue } = useForm();
  const importRef = React.useRef(null);

  /* ── Queries ── */
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['it-assets'],
    queryFn: () => itAssetAPI.list().then(r => r.data?.data).catch(() => []),
  });
  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []).catch(() => []),
  });

  /* ── Mutations ── */
  const saveMutation = useMutation({
    mutationFn: (payload) => editAsset
      ? itAssetAPI.update(editAsset.id, payload)
      : itAssetAPI.create(payload),
    onSuccess: () => {
      toast.success(editAsset ? 'Asset updated' : 'Asset registered');
      reset(); setShowForm(false); setEditAsset(null);
      qc.invalidateQueries({ queryKey: ['it-assets'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => itAssetAPI.delete(id),
    onSuccess: () => { toast.success('Asset deleted'); qc.invalidateQueries({ queryKey: ['it-assets'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  /* ── Computed ── */
  const allAssets      = data || [];
  const filtered       = allAssets.filter(a => {
    if (filterType !== 'all' && a.asset_type !== filterType) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (search && !`${a.asset_tag} ${a.brand} ${a.model} ${a.serial_number || ''} ${a.location_description || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const selectedAssets = useMemo(() => filtered.filter(a => selectedAssetIds.has(a.id)), [filtered, selectedAssetIds]);
  const allFilteredSelected = filtered.length > 0 && filtered.every(a => selectedAssetIds.has(a.id));

  const toggleAssetSelection = (id) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(a => next.delete(a.id));
      else filtered.forEach(a => next.add(a.id));
      return next;
    });
  };

  const printBulkQr = () => {
    if (!selectedAssets.length) {
      toast.error('Select IT assets to print QR labels');
      return;
    }
    setTimeout(() => window.print(), 80);
  };
  const warrantyAlerts = allAssets.filter(a => {
    const d = a.warranty_expiry ? dayjs(a.warranty_expiry).diff(dayjs(), 'day') : null;
    return d !== null && d >= 0 && d <= 90;
  });
  const antivirusAlerts = allAssets.filter(a => {
    if (!a.antivirus_expiry) return false;
    return dayjs(a.antivirus_expiry).diff(dayjs(), 'day') <= 30;
  });
  const totalValue  = allAssets.reduce((s, a) => s + parseFloat(a.purchase_cost || 0), 0);
  const inUseCount  = allAssets.filter(a => a.status === 'in_use').length;
  const availCount  = allAssets.filter(a => a.status === 'available').length;

  /* ── Form helpers ── */
  const openCreate = () => { setEditAsset(null); reset({ status: 'available', asset_type: 'laptop', asset_tag: 'BCIM-IT-LT-' }); setShowForm(true); };
  const openEdit   = (a) => {
    setEditAsset(a);
    Object.entries(a).forEach(([k, v]) => setValue(k, v ?? ''));
    setShowForm(true);
  };
  const closeForm  = () => { reset(); setShowForm(false); setEditAsset(null); };

  /* ── Export CSV ── */
  const exportCSV = () => {
    const cols = ['asset_tag','asset_type','brand','model','serial_number','os','processor','ram_gb','storage_gb',
                  'ip_address','mac_address','status','assigned_to_name','location_description',
                  'purchase_date','purchase_cost','warranty_expiry','antivirus_status','antivirus_expiry',
                  'project_name','notes'];
    const header = cols.join(',');
    const rows = allAssets.map(a => cols.map(c => {
      const v = a[c] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const el   = document.createElement('a');
    el.href = url; el.download = `IT_Assets_${dayjs().format('YYYY-MM-DD')}.csv`;
    document.body.appendChild(el); el.click(); document.body.removeChild(el); URL.revokeObjectURL(url);
    toast.success(`Exported ${allAssets.length} assets`);
  };

  const downloadTemplate = () => {
    const lines = [
      'asset_tag,asset_type,brand,model,serial_number,os,purchase_date,purchase_cost,warranty_expiry,status,location_description,notes',
      'BCIM-IT-LT-001,laptop,Dell,Latitude 5540,SN1234567,Windows 11 Pro,2024-01-15,85000,2027-01-15,in_use,HO - Accounts Dept,Assigned to finance team',
      '# asset_type: laptop | desktop | server | network | cctv | biometric | printer | ups | other',
      '# status: in_use | available | under_repair | retired | lost',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const el   = document.createElement('a');
    el.href = url; el.download = 'IT_Assets_Template.csv';
    document.body.appendChild(el); el.click(); document.body.removeChild(el); URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = ''; setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (lines.length < 2) { toast.error('No data rows found'); return; }
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1)
        .map(line => Object.fromEntries(headers.map((h, i) => [h, line.split(',')[i]?.replace(/^"|"$/g,'').trim() || ''])))
        .filter(r => r.asset_tag && r.brand && r.model);
      if (!rows.length) { toast.error('No valid rows — need: asset_tag, brand, model'); return; }
      const res = await itAssetAPI.import(rows);
      toast.success(res.data?.message || 'Import complete');
      qc.invalidateQueries({ queryKey: ['it-assets'] });
    } catch (err) { toast.error(err.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  };

  const kpis = [
    { label: 'Total Assets',      value: allAssets.length, icon: Package,     color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'In Use',            value: inUseCount,       icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Available',         value: availCount,       icon: BarChart2,   color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Warranty Alerts',   value: warrantyAlerts.length, icon: Clock,  color: 'text-amber-600',  bg: 'bg-amber-50' },
    { label: 'Antivirus Alerts',  value: antivirusAlerts.length, icon: Shield, color: 'text-red-600',   bg: 'bg-red-50' },
    { label: 'Capital Value',
      value: `₹${Number(totalValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      icon: Settings, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body * { visibility: hidden !important; }
          .bulk-it-qr-print,
          .bulk-it-qr-print * { visibility: visible !important; }
          .bulk-it-qr-print {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .bulk-it-qr-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 94mm);
            gap: 2.5mm;
            align-items: start;
          }
          .bulk-it-qr-label {
            width: 94mm !important;
            height: 62mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .bulk-it-qr-label > div:first-child {
            min-height: 8.5mm !important;
            padding: 1.5mm 3mm !important;
          }
          .bulk-it-qr-label > div:nth-child(2) {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            grid-template-columns: 40mm minmax(0, 1fr) !important;
          }
          .bulk-it-qr-label > div:last-child {
            min-height: 5mm !important;
            padding: 1mm 3mm !important;
          }
          .bulk-it-qr-label svg {
            width: 34mm !important;
            height: 34mm !important;
          }
        }
      `}</style>

      {/* ── Left Sidebar ── */}
      <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-gray-200 px-4 py-4 flex items-center gap-2">
          <Cpu className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">IT Assets</span>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <p className="mb-1 px-4 text-[10px] font-medium uppercase tracking-wider text-gray-400">Asset Categories</p>
          {ASSET_TYPES.map(({ key, label, Icon }) => {
            const count = key === 'all' ? allAssets.length : allAssets.filter(a => a.asset_type === key).length;
            return (
              <button key={key} onClick={() => setFilterType(key)}
                className={clsx('flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors',
                  filterType === key ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-gray-50')}>
                <Icon className={clsx('h-4 w-4 shrink-0', filterType === key ? 'text-blue-600' : 'text-gray-400')} />
                <span className="flex-1 text-left">{label}</span>
                <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  filterType === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>
                  {count}
                </span>
              </button>
            );
          })}
          <p className="mb-1 mt-4 px-4 text-[10px] font-medium uppercase tracking-wider text-gray-400">Status</p>
          {STATUS_OPTIONS.map(({ key, label, dot }) => (
            <button key={key} onClick={() => setFilterStatus(key)}
              className={clsx('flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors',
                filterStatus === key ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-gray-50')}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <span>Assets & IT</span><ChevronRight className="h-4 w-4" />
            <span className="font-semibold text-gray-800">IT Assets</span>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <button onClick={() => refetch()} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
              <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" /> Template
            </button>
            <button onClick={() => importRef.current?.click()} disabled={importing}
              className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50 disabled:opacity-50">
              <Upload className="h-3.5 w-3.5 text-blue-500" />{importing ? 'Importing…' : 'Import CSV'}
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5 text-indigo-500" /> Export
            </button>
            <button onClick={printBulkQr} className="flex items-center gap-1.5 rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
              <Printer className="h-3.5 w-3.5" /> Print QR {selectedAssets.length ? `(${selectedAssets.length})` : ''}
            </button>
            <button onClick={openCreate} className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add Asset
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* KPI Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className={clsx('rounded p-1', bg)}><Icon className={clsx('h-4 w-4', color)} /></span>
                </div>
                <div className="mt-2 text-xl font-bold text-gray-800">{value}</div>
              </div>
            ))}
          </div>

          {/* Alerts */}
          {warrantyAlerts.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">{warrantyAlerts.length} asset(s) warranty expiring in 90 days</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {warrantyAlerts.map(a => (
                  <span key={a.id} className="rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-amber-700">
                    {a.asset_tag} — {dayjs(a.warranty_expiry).diff(dayjs(), 'day')}d left
                  </span>
                ))}
              </div>
            </div>
          )}
          {antivirusAlerts.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="h-4 w-4 text-red-600" />
                <span className="text-sm font-semibold text-red-700">{antivirusAlerts.length} asset(s) antivirus expiring in 30 days</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {antivirusAlerts.map(a => (
                  <span key={a.id} className="rounded border border-red-200 bg-white px-2 py-0.5 text-xs text-red-700">
                    {a.asset_tag} — {dayjs(a.antivirus_expiry).diff(dayjs(), 'day')}d left
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-gray-400"
              placeholder="Search by tag, brand, model, serial, location…"
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')}><X className="h-4 w-4 text-gray-400 hover:text-gray-600" /></button>}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {filtered.length} Asset{filtered.length !== 1 ? 's' : ''}
              </span>
              {selectedAssets.length > 0 && (
                <button
                  onClick={() => setSelectedAssetIds(new Set())}
                  className="text-xs font-semibold text-slate-500 hover:text-red-600"
                >
                  Clear selected ({selectedAssets.length})
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="whitespace-nowrap px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        title="Select all filtered IT assets"
                      />
                    </th>
                    {['Asset Tag','Type','Brand / Model','Specs','Status','Assigned To','Antivirus','Warranty','Actions'].map(h => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading && (
                    <tr><td colSpan={10} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-gray-300" /></td></tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={10} className="py-14 text-center">
                      <Package className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                      <p className="text-sm text-gray-400">No assets found</p>
                    </td></tr>
                  )}
                  {filtered.map(asset => {
                    const typeInfo = TYPE_ICON[asset.asset_type] || { label: 'Other', Icon: HelpCircle };
                    const { Icon: TypeIcon } = typeInfo;
                    const daysWarr = asset.warranty_expiry ? dayjs(asset.warranty_expiry).diff(dayjs(), 'day') : null;
                    const daysAv   = asset.antivirus_expiry ? dayjs(asset.antivirus_expiry).diff(dayjs(), 'day') : null;
                    return (
                      <tr key={asset.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.has(asset.id)}
                            onChange={() => toggleAssetSelection(asset.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            title="Select for bulk QR print"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">{asset.asset_tag}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <TypeIcon className="h-3.5 w-3.5 text-gray-400" />{typeInfo.label}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900">{asset.brand} {asset.model}</div>
                          {asset.os && <div className="text-xs text-gray-400">{asset.os}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <div className="flex flex-col gap-0.5">
                            {asset.processor && <span className="flex items-center gap-1"><CpuIcon className="h-3 w-3" />{asset.processor}</span>}
                            {(asset.ram_gb || asset.storage_gb) && (
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {asset.ram_gb ? `${asset.ram_gb}GB RAM` : ''}
                                {asset.ram_gb && asset.storage_gb ? ' · ' : ''}
                                {asset.storage_gb ? `${asset.storage_gb}GB` : ''}
                              </span>
                            )}
                            {asset.ip_address && <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />{asset.ip_address}</span>}
                            {!asset.processor && !asset.ram_gb && !asset.ip_address && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_BADGE[asset.status] || STATUS_BADGE.available)}>
                            {LABEL[asset.status] || asset.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-1">
                            {asset.assigned_to_name ? (
                              <><User className="h-3 w-3 text-gray-400" />{asset.assigned_to_name}</>
                            ) : <span className="text-gray-300">—</span>}
                          </div>
                          {asset.location_description && <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{asset.location_description}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {daysAv === null ? <span className="text-gray-300">—</span>
                          : daysAv < 0 ? <span className="text-red-600 font-semibold">Expired</span>
                          : daysAv <= 30 ? <span className="text-red-500 font-semibold">{daysAv}d ⚠️</span>
                          : <span className="text-green-600">{dayjs(asset.antivirus_expiry).format('DD MMM YY')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          {daysWarr === null ? <span className="text-gray-300">—</span>
                          : daysWarr < 0 ? <span className="text-red-600 font-semibold">Expired</span>
                          : daysWarr <= 90 ? <span className="text-amber-600 font-semibold">{daysWarr}d ⚠️</span>
                          : <span className="text-green-600">{dayjs(asset.warranty_expiry).format('DD MMM YYYY')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setDetailId(asset.id)} title="View details & history"
                              className="rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setSelectedAsset(asset)} title="QR code"
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEdit(asset)} title="Edit"
                              className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (window.confirm(`Delete ${asset.asset_tag}?`)) deleteMutation.mutate(asset.id); }} title="Delete"
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail Slide-Over ── */}
      {detailId && (
        <AssetDetailPanel assetId={detailId} onClose={() => setDetailId(null)} />
      )}

      {/* ── Add / Edit Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600"><Cpu className="h-4 w-4 text-white" /></div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{editAsset ? `Edit — ${editAsset.asset_tag}` : 'Add New IT Asset'}</h2>
                  <p className="text-xs text-gray-400">Hardware details, specs, assignment</p>
                </div>
              </div>
              <button onClick={closeForm} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSubmit(d => saveMutation.mutate({
              ...d,
              asset_tag: normalizeItAssetTag(d.asset_tag, d.asset_type),
            }))} className="p-6 space-y-5">
              {/* Section: Identification */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Identification</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Asset Tag *"><input {...register('asset_tag', { required: true })} className={inputCls} placeholder="BCIM-IT-LT-001" /></FormField>
                  <FormField label="Asset Type *">
                    <select {...register('asset_type', { required: true })} className={inputCls}>
                      <option value="">Select type</option>
                      {ASSET_TYPES.slice(1).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Status">
                    <select {...register('status')} className={inputCls}>
                      {STATUS_OPTIONS.slice(1).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Brand *"><input {...register('brand', { required: true })} className={inputCls} placeholder="Dell / HP / Lenovo" /></FormField>
                  <FormField label="Model *"><input {...register('model', { required: true })} className={inputCls} placeholder="Latitude 5540" /></FormField>
                  <FormField label="Serial Number"><input {...register('serial_number')} className={inputCls} placeholder="SN1234567" /></FormField>
                </div>
              </div>

              {/* Section: Specs */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Technical Specs</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="OS / Firmware"><input {...register('os')} className={inputCls} placeholder="Windows 11 Pro" /></FormField>
                  <FormField label="Processor"><input {...register('processor')} className={inputCls} placeholder="i7-12th Gen" /></FormField>
                  <FormField label="RAM (GB)"><input type="number" {...register('ram_gb')} className={inputCls} placeholder="16" /></FormField>
                  <FormField label="Storage (GB)"><input type="number" {...register('storage_gb')} className={inputCls} placeholder="512" /></FormField>
                  <FormField label="IP Address"><input {...register('ip_address')} className={inputCls} placeholder="192.168.1.100" /></FormField>
                  <FormField label="MAC Address"><input {...register('mac_address')} className={inputCls} placeholder="00:1A:2B:3C:4D:5E" /></FormField>
                </div>
              </div>

              {/* Section: Purchase & Warranty */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Purchase & Warranty</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Purchase Date"><input type="date" {...register('purchase_date')} className={inputCls} /></FormField>
                  <FormField label="Purchase Cost (₹)"><input type="number" {...register('purchase_cost')} className={inputCls} placeholder="85000" /></FormField>
                  <FormField label="Warranty Expiry"><input type="date" {...register('warranty_expiry')} className={inputCls} /></FormField>
                </div>
              </div>

              {/* Section: Antivirus */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Antivirus / Security</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Antivirus Software">
                    <select {...register('antivirus_status')} className={inputCls}>
                      <option value="">Not Installed</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="not_required">Not Required</option>
                    </select>
                  </FormField>
                  <FormField label="Antivirus Expiry"><input type="date" {...register('antivirus_expiry')} className={inputCls} /></FormField>
                </div>
              </div>

              {/* Section: Assignment */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Assignment</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Assigned To (Name)"><input {...register('assigned_to_name')} className={inputCls} placeholder="Employee name" /></FormField>
                  <FormField label="Project">
                    <select {...register('location_project_id')} className={inputCls}>
                      <option value="">HO / No Project</option>
                      {projectsData.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Location / Department"><input {...register('location_description')} className={inputCls} placeholder="HO - Accounts Dept" /></FormField>
                  <FormField label="Notes" span={3}><textarea {...register('notes')} className={inputCls + ' resize-none'} rows={2} placeholder="Additional notes…" /></FormField>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={closeForm} className="rounded border border-gray-200 px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saveMutation.isPending ? 'Saving…' : editAsset ? 'Update Asset' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {selectedAsset && <ITAssetBarcodeModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}

      {createPortal(
      <div className="bulk-it-qr-print hidden">
        <div className="bulk-it-qr-grid">
          {selectedAssets.map(asset => {
            const assetType = TYPE_ICON[asset.asset_type]?.label || 'IT Asset';
            const title = itAssetTitle(asset);
            return (
              <div key={asset.id} className="bulk-it-qr-label border-2 border-[#0f2d6b] rounded-md overflow-hidden bg-white">
                <div className="flex items-center gap-2 bg-[#0f2d6b] px-3 py-2">
                  <img src="/bcim-logo.png" alt="BCIM" className="h-7 w-7 rounded bg-white object-contain p-1" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-wide text-white">BCIM Engineering Pvt Ltd</div>
                    <div className="text-[8px] font-bold text-white/75">IT Asset Management</div>
                  </div>
                  <div className="rounded bg-white px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#0f2d6b]">
                    IT ASSET
                  </div>
                </div>
                <div className="grid grid-cols-[45mm_1fr] min-h-[51mm]">
                  <div className="flex flex-col items-center justify-center gap-1 border-r-2 border-dashed border-blue-200 bg-[#eef2ff] p-2">
                    <div className="rounded bg-white p-1 shadow">
                      <QRCodeSVG value={itAssetQrPayload(asset)} size={148} includeMargin={false} fgColor="#0f2d6b" level="M" />
                    </div>
                    <div className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Scan to identify</div>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-1 px-3 py-2">
                    <div className="font-mono text-[15px] font-black leading-none tracking-wide text-[#0f2d6b] break-all">{asset.asset_tag || '-'}</div>
                    <div className="text-[10px] font-black text-slate-950 break-words">{title}</div>
                    <div className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{assetType}</div>
                    <div className="my-1 border-t border-slate-300" />
                    <div className="grid grid-cols-[24mm_1fr] gap-y-1 text-[8px]">
                      <span className="font-black uppercase text-slate-500">Company</span><span className="font-bold text-slate-900">BCIM Engineering Pvt Ltd</span>
                      <span className="font-black uppercase text-slate-500">Serial No</span><span className="font-bold text-slate-900 break-all">{asset.serial_number || '-'}</span>
                      <span className="font-black uppercase text-slate-500">Asset ID</span><span className="font-bold text-slate-900 break-all">{asset.asset_tag || '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between bg-[#0f2d6b] px-3 py-1 text-[7px] font-bold text-white/80">
                  <span>Scan QR to view IT asset details</span>
                  <span>Property of BCIM Engineering Pvt Ltd</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>,
      document.body
      )}
    </div>
  );
}

/* ─── Asset Detail Slide-Over ────────────────────────────────── */
function AssetDetailPanel({ assetId, onClose }) {
  const qc = useQueryClient();
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [maintForm, setMaintForm] = useState({ issue_type: 'repair', description: '', vendor: '', cost: '', technician: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['it-asset-detail', assetId],
    queryFn: () => itAssetAPI.get(assetId).then(r => r.data?.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['it-assets'] });
    qc.invalidateQueries({ queryKey: ['it-asset-detail', assetId] });
  };

  const addMaintMut = useMutation({
    mutationFn: (d) => itAssetAPI.addMaintenance(assetId, d),
    onSuccess: () => { toast.success('Maintenance logged'); invalidate(); setShowMaintForm(false); setMaintForm({ issue_type: 'repair', description: '', vendor: '', cost: '', technician: '' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const closeMaintMut = useMutation({
    mutationFn: ({ mid }) => itAssetAPI.closeMaintenance(assetId, mid, {}),
    onSuccess: () => { toast.success('Maintenance closed — asset set to Available'); invalidate(); },
  });

  const asset = data;
  const typeInfo = asset ? (TYPE_ICON[asset.asset_type] || { label: 'Other', Icon: HelpCircle }) : null;

  return (
    <div className="fixed inset-0 z-[100] flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#0f2d6b] to-[#1a56db]">
          <div className="flex items-center gap-3">
            {typeInfo && <typeInfo.Icon className="h-5 w-5 text-white" />}
            <div>
              <p className="font-mono font-semibold text-white">{asset?.asset_tag || 'Loading…'}</p>
              <p className="text-xs text-blue-200">{asset?.brand} {asset?.model}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-gray-300" /></div>
          ) : asset ? (
            <>
              {/* Status + Info */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Status',    value: <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_BADGE[asset.status] || STATUS_BADGE.available)}>{LABEL[asset.status] || asset.status}</span> },
                  { label: 'Assigned',  value: asset.assigned_to_name || '—' },
                  { label: 'Location',  value: asset.location_description || asset.project_name || '—' },
                  { label: 'OS',        value: asset.os || '—' },
                  { label: 'Processor', value: asset.processor || '—' },
                  { label: 'RAM / SSD', value: `${asset.ram_gb ? asset.ram_gb+'GB RAM' : '—'} / ${asset.storage_gb ? asset.storage_gb+'GB' : '—'}` },
                  { label: 'IP Address',value: asset.ip_address || '—' },
                  { label: 'Serial No.',value: asset.serial_number || '—' },
                  { label: 'Purchase',  value: asset.purchase_cost ? `₹${Number(asset.purchase_cost).toLocaleString('en-IN')}` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                    <div className="text-xs font-semibold text-slate-800 mt-0.5">{value}</div>
                  </div>
                ))}
              </div>

              {/* Handover Documents */}
              <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-900">IT Asset Handover Documents</p>
                    <p className="text-[11px] font-medium text-slate-500">Attach handover form, acknowledgement, warranty card, invoice copy, or user declaration for this asset only.</p>
                  </div>
                  <Upload className="h-5 w-5 shrink-0 text-blue-600" />
                </div>
                <RecordAttachments
                  module="it_asset_handover"
                  recordId={asset.id}
                  projectId={asset.location_project_id}
                  label="Handover Form / Documents"
                />
              </div>

              {/* Assignment History */}
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  <History className="h-3.5 w-3.5" /> Assignment History ({asset.history?.length || 0})
                </p>
                {asset.history?.length > 0 ? (
                  <div className="space-y-1.5">
                    {asset.history.map(h => (
                      <div key={h.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="flex-1">
                          <span className="font-semibold text-slate-800">{h.assigned_to_name || 'Unknown'}</span>
                          {h.location && <span className="text-slate-400 ml-1">— {h.location}</span>}
                        </div>
                        <div className="text-slate-400 text-right">
                          <div>{dayjs(h.assigned_at).format('DD MMM YYYY')}</div>
                          {h.returned_at && <div className="text-emerald-600">↩ {dayjs(h.returned_at).format('DD MMM YYYY')}</div>}
                          {!h.returned_at && <div className="text-blue-600">Current</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400 text-center py-3">No assignment history</p>}
              </div>

              {/* Maintenance Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <Wrench className="h-3.5 w-3.5" /> Maintenance ({asset.maintenance?.length || 0})
                  </p>
                  <button onClick={() => setShowMaintForm(p => !p)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Log Issue
                  </button>
                </div>

                {showMaintForm && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 mb-0.5 block">Issue Type</label>
                        <select value={maintForm.issue_type} onChange={e => setMaintForm(p => ({ ...p, issue_type: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white">
                          <option value="repair">Repair</option>
                          <option value="preventive">Preventive Maintenance</option>
                          <option value="upgrade">Upgrade</option>
                          <option value="software">Software Issue</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-0.5 block">Technician</label>
                        <input value={maintForm.technician} onChange={e => setMaintForm(p => ({ ...p, technician: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white" placeholder="Tech name" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 mb-0.5 block">Description *</label>
                        <input value={maintForm.description} onChange={e => setMaintForm(p => ({ ...p, description: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white" placeholder="Describe the issue…" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowMaintForm(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white">Cancel</button>
                      <button onClick={() => maintForm.description.trim() ? addMaintMut.mutate(maintForm) : toast.error('Description required')}
                        className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700">Log Issue</button>
                    </div>
                  </div>
                )}

                {asset.maintenance?.length > 0 ? (
                  <div className="space-y-1.5">
                    {asset.maintenance.map(m => (
                      <div key={m.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 capitalize">{m.issue_type?.replace('_',' ')}</span>
                          <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                            m.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {m.status}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">{m.description}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-slate-400">{dayjs(m.start_date || m.created_at).format('DD MMM YYYY')}{m.technician ? ` · ${m.technician}` : ''}</span>
                          {m.status !== 'closed' && (
                            <button onClick={() => closeMaintMut.mutate({ mid: m.id })}
                              className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Close
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !showMaintForm && <p className="text-xs text-slate-400 text-center py-3">No maintenance records</p>}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">Asset not found</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── QR Modal ─────────────────────────────────────────────────── */
function ITAssetBarcodeModal({ asset, onClose }) {
  const assetType  = TYPE_ICON[asset.asset_type]?.label || 'IT Asset';
  const assetTitle = `${asset.brand || ''} ${asset.model || ''}`.trim() || asset.asset_tag;
  const { Icon: TypeIcon } = TYPE_ICON[asset.asset_type] || { Icon: HelpCircle };
  const daysLeft = asset.warranty_expiry ? dayjs(asset.warranty_expiry).diff(dayjs(), 'day') : null;

  const specs = [
    { label: 'Asset Tag',    value: asset.asset_tag },
    { label: 'Type',         value: assetType },
    { label: 'Brand/Model',  value: `${asset.brand || '—'} ${asset.model || ''}` },
    { label: 'Serial No.',   value: asset.serial_number || '—' },
    { label: 'OS',           value: asset.os || '—' },
    { label: 'Processor',    value: asset.processor || '—' },
    { label: 'RAM',          value: asset.ram_gb ? `${asset.ram_gb} GB` : '—' },
    { label: 'Storage',      value: asset.storage_gb ? `${asset.storage_gb} GB` : '—' },
    { label: 'IP Address',   value: asset.ip_address || '—' },
    { label: 'Status',       value: LABEL[asset.status] || asset.status || '—' },
    { label: 'Assigned To',  value: asset.assigned_to_name || '—' },
    { label: 'Location',     value: asset.location_description || '—' },
    { label: 'Purchased',    value: asset.purchase_date ? dayjs(asset.purchase_date).format('DD MMM YYYY') : '—' },
    { label: 'Cost',         value: asset.purchase_cost ? `₹${Number(asset.purchase_cost).toLocaleString('en-IN')}` : '—' },
    { label: 'Warranty',     value: daysLeft === null ? '—' : daysLeft < 0 ? `Expired (${Math.abs(daysLeft)}d)` : `${dayjs(asset.warranty_expiry).format('DD MMM YYYY')} (${daysLeft}d)` },
    { label: 'Antivirus',    value: asset.antivirus_status || '—' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4"
          style={{ background: 'linear-gradient(135deg, #0f2d6b 0%, #1a56db 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <TypeIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-mono text-lg font-semibold tracking-wider text-white">{asset.asset_tag}</h2>
              <p className="text-xs text-blue-200">{assetTitle} · {assetType}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid lg:grid-cols-[520px_minmax(360px,1fr)]">
          <div className="border-r border-gray-100 bg-slate-50 p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Asset Label</p>
            <AssetBarcodeCard value={asset.asset_tag} title={assetTitle} subtitle={assetType}
              metaLabel="Asset Tag" metaValue={asset.asset_tag} size={140}
              assetId={asset.asset_tag}
              serialNumber={asset.serial_number}
              labelType="IT ASSET"
              labelSubtitle="IT Asset Management"
              extraFields={[
                { label: 'Serial', value: asset.serial_number },
                { label: 'Status', value: LABEL[asset.status] || asset.status },
                { label: 'IP',     value: asset.ip_address },
                { label: 'Assigned', value: asset.assigned_to_name },
              ]} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Specifications</p>
            <div className="space-y-1">
              {specs.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 rounded-lg px-3 py-2 odd:bg-gray-50">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 pt-0.5">{label}</span>
                  <span className="min-w-0 whitespace-normal break-words text-xs font-semibold leading-5 text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
