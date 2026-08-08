// src/pages/hr-admin/onboarding/offer-appointment/ReportsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { FileBarChart, ArrowLeft, Download } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const REPORTS = [
  { key: 'offers_sent', label: 'Offers Sent' },
  { key: 'offers_accepted', label: 'Offers Accepted' },
  { key: 'offers_rejected', label: 'Offers Rejected' },
  { key: 'pending_acceptance', label: 'Pending Acceptance' },
  { key: 'appointment_letters_issued', label: 'Appointment Letters Issued' },
  { key: 'joining_report', label: 'Joining Report' },
];

export default function OfferReportsPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState('offers_sent');
  const { data, isLoading } = useQuery({ queryKey: ['offer-report', key], queryFn: () => hrOffersAPI.report(key).then(r => r.data) });
  const rows = data?.data || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data?.label || 'Report');
    XLSX.writeFile(wb, `${key}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Downloaded');
  };
  const exportCsv = () => {
    if (!rows.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${key}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileBarChart className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Reports</h1><p className="text-xs text-gray-400">{rows.length} row(s)</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={!rows.length} className="text-xs font-bold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: B.blue }}><Download className="w-3.5 h-3.5" /> Excel</button>
          <button onClick={exportCsv} disabled={!rows.length} className="text-xs font-bold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1.5 disabled:opacity-50"><Download className="w-3.5 h-3.5" /> CSV</button>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap gap-2" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {REPORTS.map(r => (
          <button key={r.key} onClick={() => setKey(r.key)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={key === r.key ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>{r.label}</button>
        ))}
      </motion.div>

      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 overflow-x-auto" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && rows.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No data for this report.</p>}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{columns.map(c => <th key={c} className="text-left px-4 py-2.5 text-[11px] font-black text-gray-500 uppercase whitespace-nowrap">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-50 last:border-0">{columns.map(c => <td key={c} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{String(r[c] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
}
