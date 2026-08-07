// src/pages/hr-admin/onboarding/OnboardingReportsPage.jsx
// Generic report viewer for the Onboarding Dashboard's GET /reports/:key —
// one table + CSV export, driven entirely by whatever columns the backend
// report returns (no hardcoded column list to keep in sync).
import React, { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrOnboardingAPI } from '../../../api/client';
import { B, fade, SectionHeader } from '../../../components/hr/DashboardKit';

const REPORTS = [
  { key: 'new_joiners', label: 'New Joiners' },
  { key: 'pending_onboarding', label: 'Pending Onboarding' },
  { key: 'missing_documents', label: 'Missing Documents' },
  { key: 'asset_allocation', label: 'Asset Allocation' },
  { key: 'training_completion', label: 'Training Completion' },
  { key: 'probation', label: 'Probation Status' },
  { key: 'confirmation', label: 'Confirmation Status' },
];

function downloadCSV(rows, filename) {
  if (!rows?.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csvRows = rows.map(row => headers.map(k => JSON.stringify(row[k] ?? '')).join(','));
  const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
}

function fmtCell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export default function OnboardingReportsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const activeKey = params.get('key') || REPORTS[0].key;

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-report', activeKey],
    queryFn: () => hrOnboardingAPI.report(activeKey).then(r => r.data),
  });

  const rows = data?.data || [];
  const columns = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  const activeLabel = REPORTS.find(r => r.key === activeKey)?.label || data?.label || activeKey;

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      <motion.div {...fade(0)} className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Onboarding Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every figure is a live query — no cached snapshots.</p>
        </div>
        <button
          onClick={() => downloadCSV(rows, `onboarding-${activeKey}.csv`)}
          className="text-xs font-bold flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white"
          style={{ background: B.navy }}
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {REPORTS.map(r => (
          <button key={r.key} onClick={() => setParams({ key: r.key })}
            className={`text-xs font-bold px-3 py-2.5 rounded-xl border transition-all ${activeKey === r.key ? 'text-white border-transparent' : 'bg-white border-gray-100 text-gray-600 hover:shadow-sm'}`}
            style={activeKey === r.key ? { background: B.blue } : {}}>
            {r.label}
          </button>
        ))}
      </div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionHeader title={activeLabel} sub={`${rows.length} record(s)`} icon={FileSpreadsheet} iconColor={B.blue} />
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading...</p>
          ) : data?.available === false ? (
            <p className="text-center text-gray-400 py-10 text-sm">— This report is not available on the currently deployed training data schema —</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No records found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  {columns.map(c => <th key={c} className="py-2.5 px-4 whitespace-nowrap">{c.replace(/_/g, ' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    {columns.map(c => <td key={c} className="py-2.5 px-4 text-gray-700 whitespace-nowrap">{fmtCell(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
