// src/pages/hr-admin/onboarding/id-card/ReportsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileBarChart, ArrowLeft, Download } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const REPORTS = [
  { key: 'id_card_register', label: 'ID Card Register' },
  { key: 'pending_cards', label: 'Pending Cards' },
  { key: 'printed_cards', label: 'Printed Cards' },
  { key: 'reissued_cards', label: 'Reissued Cards' },
  { key: 'lost_cards', label: 'Lost Cards' },
  { key: 'expired_cards', label: 'Expired Cards' },
];

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

export default function IdCardReportsPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState('id_card_register');
  const { data, isLoading } = useQuery({ queryKey: ['idcard-report', key], queryFn: () => hrIdCardAPI.report(key).then(r => r.data) });

  const rows = data?.data || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const exportCsv = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${key}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileBarChart className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Reports</h1><p className="text-xs text-gray-400">{rows.length} row(s)</p></div>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="text-xs font-bold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: B.blue }}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap gap-2" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {REPORTS.map(r => (
          <button key={r.key} onClick={() => setKey(r.key)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={key === r.key ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
            {r.label}
          </button>
        ))}
      </motion.div>

      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 overflow-x-auto" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && rows.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No data for this report.</p>}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{columns.map(c => <th key={c} className="text-left px-4 py-2.5 text-[11px] font-black text-gray-500 uppercase whitespace-nowrap">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  {columns.map(c => <td key={c} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{String(r[c] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
}
