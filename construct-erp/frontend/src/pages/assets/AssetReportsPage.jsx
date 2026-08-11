import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, Download, IndianRupee, Printer, Search } from 'lucide-react';
import { assetAPI, itAssetAPI } from '../../api/client';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const listData = (r) => r.data?.data ?? r.data ?? [];
const fmtMoney = (v) => `Rs ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (s) => ({
  available: 'Idle',
  assigned: 'Deployed',
  maintenance: 'Service',
  breakdown: 'Breakdown',
  disposed: 'Disposed',
  in_use: 'In Use',
  under_repair: 'Under Repair',
  retired: 'Retired',
  lost: 'Lost / Stolen',
}[s] || s || '-');
const STANDARD_DEPARTMENTS = [
  'Projects',
  'Plant & Machinery',
  'Stores',
  'IT',
  'Administration',
  'Accounts',
  'Procurement',
  'HSE',
  'QA/QC',
  'Housekeeping',
  'Security',
  'Unassigned',
];
const PLANT_TYPES = new Set([
  'heavy_machinery', 'vehicle', 'tool', 'equipment',
  'Excavator', 'Crane', 'Concrete Mixer', 'Generator', 'Compactor',
  'Tipper Truck', 'JCB', 'Water Tanker', 'Scaffolding Set',
  'Bar Bending Machine', 'Concrete Pump', 'Tower Crane',
  'Survey Equipment', 'Power Tools',
]);
const ADMIN_TYPES = new Set([
  'office_equipment', 'furniture', 'appliance', 'electrical',
  'security_equipment', 'housekeeping_equipment', 'other_admin',
]);
const DEPLOYED_STATUSES = new Set(['assigned', 'in_use']);
const SERVICE_STATUSES = new Set(['maintenance', 'breakdown', 'under_repair']);

function inferredDepartment(asset) {
  if (asset.department) return asset.department;
  if (asset.source === 'it' || asset.asset_type === 'it_asset') return 'IT';
  if (PLANT_TYPES.has(asset.asset_type)) return 'Plant & Machinery';
  if (ADMIN_TYPES.has(asset.asset_type)) return 'Administration';
  return 'Projects';
}

function normalizeITAsset(asset) {
  return {
    ...asset,
    source: 'it',
    asset_code: asset.asset_tag,
    asset_name: [asset.brand, asset.model].filter(Boolean).join(' ') || asset.asset_name || asset.asset_tag,
    asset_type: asset.asset_type || 'it_asset',
    department: asset.department || 'IT',
    po_number: asset.po_number || asset.purchase_order_no,
    invoice_number: asset.invoice_number || asset.invoice_no,
    purchase_value: asset.purchase_cost,
    current_project_name: asset.project_name || asset.location_description || asset.location || 'IT Store',
  };
}

export default function AssetReportsPage() {
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data: physicalAssets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['asset-department-report'],
    queryFn: () => assetAPI.list().then(listData),
  });

  const { data: itAssets = [], isLoading: itLoading } = useQuery({
    queryKey: ['asset-department-report-it'],
    queryFn: () => itAssetAPI.list().then(listData).catch(() => []),
  });

  const assets = useMemo(() => ([
    ...(physicalAssets || []).map(a => ({ ...a, source: 'asset', department: inferredDepartment(a) })),
    ...(itAssets || []).map(normalizeITAsset),
  ]), [physicalAssets, itAssets]);

  const isLoading = assetsLoading || itLoading;

  const departments = useMemo(() => {
    const names = assets.map(a => inferredDepartment(a));
    return [...new Set([...STANDARD_DEPARTMENTS, ...names])].sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const filtered = useMemo(() => assets.filter((a) => {
    const dept = inferredDepartment(a);
    if (department !== 'all' && dept !== department) return false;
    if (status !== 'all' && a.status !== status) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [
      a.asset_code,
      a.asset_name,
      a.asset_type,
      a.serial_number,
      a.po_number,
      a.invoice_number,
      a.current_project_name,
      dept,
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [assets, department, status, search]);

  const departmentRows = useMemo(() => departments.map((dept) => {
    const rows = assets.filter(a => inferredDepartment(a) === dept);
    const bookValue = rows.reduce((s, a) => s + Number(a.purchase_value || 0), 0);
    return {
      department: dept,
      total: rows.length,
      deployed: rows.filter(a => DEPLOYED_STATUSES.has(a.status)).length,
      service: rows.filter(a => SERVICE_STATUSES.has(a.status)).length,
      missingRefs: rows.filter(a => !a.po_number || !a.invoice_number || !a.serial_number).length,
      bookValue,
    };
  }).filter(row => row.total > 0 || row.department === department), [assets, departments, department]);

  const totals = useMemo(() => ({
    total: filtered.length,
    bookValue: filtered.reduce((s, a) => s + Number(a.purchase_value || 0), 0),
    deployed: filtered.filter(a => DEPLOYED_STATUSES.has(a.status)).length,
    missingRefs: filtered.filter(a => !a.po_number || !a.invoice_number || !a.serial_number).length,
  }), [filtered]);

  const exportCsv = () => {
    const rows = [
      ['Department', 'Asset Code', 'Asset Name', 'Type', 'Serial No', 'PO No', 'Invoice No', 'Location', 'Status', 'Purchase Value', 'Purchase Date'],
      ...filtered.map(a => [
        inferredDepartment(a),
        a.asset_code,
        a.asset_name,
        a.asset_type,
        a.serial_number,
        a.po_number,
        a.invoice_number,
        a.current_project_name,
        statusLabel(a.status),
        Number(a.purchase_value || 0),
        a.purchase_date ? dayjs(a.purchase_date).format('DD/MM/YYYY') : '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `department_asset_report_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
  };

  return (
    <div className="asset-report-page min-h-screen bg-[#f4f6f9] p-6 md:p-8">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden !important; }
          .asset-report-page, .asset-report-page * { visibility: visible !important; }
          .asset-report-page {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            min-height: auto !important;
            background: #fff !important;
            padding: 0 !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .asset-report-actions,
          .asset-report-filters {
            display: none !important;
          }
          .asset-report-page .max-w-\\[1500px\\] {
            max-width: none !important;
          }
          .asset-report-layout {
            display: block !important;
          }
          .asset-report-summary {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 10px !important;
          }
          .asset-report-departments {
            display: none !important;
          }
          .asset-report-table-wrap {
            overflow: visible !important;
          }
          .asset-report-table {
            min-width: 0 !important;
            width: 100% !important;
            font-size: 9px !important;
          }
          .asset-report-table th,
          .asset-report-table td {
            padding: 5px 6px !important;
            border: 1px solid #94a3b8 !important;
          }
        }
      `}</style>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <BarChart3 className="w-4 h-4 text-blue-700" /> Assets & IT
            </div>
            <h1 className="text-2xl font-bold text-slate-950 mt-1">Department Wise Asset Report</h1>
            <p className="text-sm font-semibold text-slate-600">Asset count, book value, deployment and missing document references by department.</p>
          </div>
          <div className="asset-report-actions flex gap-2">
            <button onClick={exportCsv} className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-bold text-black hover:border-blue-300 flex items-center gap-2">
              <Download className="w-4 h-4" /> Excel
            </button>
            <button onClick={() => window.print()} className="h-10 px-4 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-800 flex items-center gap-2">
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>

        <div className="asset-report-summary grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric icon={Building2} label="Assets" value={totals.total} tone="blue" />
          <Metric icon={IndianRupee} label="Book Value" value={fmtMoney(totals.bookValue)} tone="emerald" />
          <Metric icon={BarChart3} label="Deployed" value={totals.deployed} tone="blue" />
          <Metric icon={Download} label="Missing Ref" value={totals.missingRefs} tone="amber" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="asset-report-filters p-4 border-b border-slate-200 flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search asset, PO, invoice, serial, location..."
                className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-400"
              />
            </div>
            <select value={department} onChange={e => setDepartment(e.target.value)} className="h-10 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400">
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={status} onChange={e => setStatus(e.target.value)} className="h-10 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400">
              <option value="all">All Status</option>
              <option value="available">Idle</option>
              <option value="assigned">Deployed</option>
              <option value="maintenance">Service</option>
              <option value="breakdown">Breakdown</option>
              <option value="disposed">Disposed</option>
              <option value="in_use">IT In Use</option>
              <option value="under_repair">IT Under Repair</option>
              <option value="retired">IT Retired</option>
              <option value="lost">IT Lost / Stolen</option>
            </select>
          </div>

          <div className="asset-report-layout grid lg:grid-cols-[360px_1fr]">
            <div className="asset-report-departments border-r border-slate-200 bg-slate-50/60 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Department Summary</div>
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {departmentRows.map(row => (
                  <button
                    key={row.department}
                    onClick={() => setDepartment(row.department)}
                    className={clsx('w-full rounded-lg border p-3 text-left transition', department === row.department ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200')}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="font-bold text-slate-950">{row.department}</div>
                      <div className="font-mono font-bold text-blue-700">{row.total}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <span>Deployed: {row.deployed}</span>
                      <span>Service: {row.service}</span>
                      <span>Missing: {row.missingRefs}</span>
                      <span>{fmtMoney(row.bookValue)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="asset-report-table-wrap overflow-x-auto">
              <table className="asset-report-table w-full min-w-[1250px] text-sm border-collapse">
                <thead className="bg-[#173b70] text-white">
                  <tr>
                    {['Department', 'Asset Code', 'Asset Name', 'Type', 'Serial No', 'PO No', 'Invoice No', 'Location', 'Status', 'Value'].map(h => (
                      <th key={h} className={clsx('px-3 py-3 text-xs font-bold uppercase border border-blue-950/20', h === 'Value' ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={10} className="py-12 text-center font-bold text-slate-500">Loading report...</td></tr>
                  ) : filtered.map(asset => (
                    <tr key={`${asset.source || 'asset'}-${asset.id || asset.asset_code}`} className="hover:bg-blue-50/40">
                      <td className="px-3 py-3 border border-slate-200 font-bold text-slate-900">{inferredDepartment(asset)}</td>
                      <td className="px-3 py-3 border border-slate-200 font-mono font-bold text-blue-700">{asset.asset_code || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-bold text-slate-950">{asset.asset_name || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-semibold text-black">{asset.asset_type || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-mono font-semibold text-black">{asset.serial_number || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-mono font-semibold text-black">{asset.po_number || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-mono font-semibold text-black">{asset.invoice_number || '-'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-semibold text-black">{asset.current_project_name || 'Central Yard'}</td>
                      <td className="px-3 py-3 border border-slate-200 font-bold text-black">{statusLabel(asset.status)}</td>
                      <td className="px-3 py-3 border border-slate-200 text-right font-mono font-bold text-slate-950">{fmtMoney(asset.purchase_value)}</td>
                    </tr>
                  ))}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={10} className="py-12 text-center font-bold text-slate-500">No assets found for this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center mb-3', colors[tone])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-slate-950">{value}</div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
