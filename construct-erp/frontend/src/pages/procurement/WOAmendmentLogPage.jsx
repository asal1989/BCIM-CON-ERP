// src/pages/procurement/WOAmendmentLogPage.jsx
// Register of every amendment/variation logged against vendor Work Orders.
// Amendments themselves are added/removed from the WO detail panel
// (WorkOrderPage.jsx) — this page is the cross-WO browse/search view,
// mirroring the "PO Amendments" register.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Search, FileText, Calendar, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { subcontractorAPI, projectAPI } from '../../api/client';
import { PageHeader } from '../../theme';

const inr = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function WOAmendmentLogPage() {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const { data: amendments = [], isLoading } = useQuery({
    queryKey: ['wo-amendments', search, projectFilter],
    queryFn: () => subcontractorAPI.listWOAmendments({
      search: search || undefined,
      project_id: projectFilter || undefined,
    }).then(r => r.data?.data || []),
  });

  const totalImpact = amendments.reduce((s, a) => s + Number(a.amount_change || 0), 0);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <PageHeader
        title="Work Order Amendments"
        subtitle="Register of every variation, extension or scope change logged against vendor work orders"
      />
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Total Amendments</p>
            <p className="text-2xl font-bold text-slate-900">{amendments.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Work Orders Amended</p>
            <p className="text-2xl font-bold text-slate-900">{new Set(amendments.map(a => a.wo_id)).size}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Net Value Impact</p>
            <p className={clsx('text-2xl font-bold', totalImpact < 0 ? 'text-red-600' : 'text-emerald-600')}>
              {totalImpact >= 0 ? '+' : ''}₹{inr(totalImpact)}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm w-full shadow-sm"
              placeholder="Search WO number, vendor, description…" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>{['WO Number', 'Project', 'Vendor', 'Amdt #', 'Date', 'Description', 'Change', 'Revised Value', 'Raised By'].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading…</td></tr>
                ) : amendments.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />No amendments logged yet
                  </td></tr>
                ) : amendments.map(a => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-xs text-indigo-600 whitespace-nowrap">{a.wo_number || '—'}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[160px] truncate"><Building2 className="w-3 h-3 inline mr-1 text-slate-300" />{a.project_name}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[140px] truncate">{a.vendor_name || '—'}</td>
                    <td className="py-2.5 px-3 text-xs font-bold text-indigo-600">#{a.amendment_number}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {a.amendment_date ? <><Calendar className="w-3 h-3 inline mr-1 text-slate-300" />{dayjs(a.amendment_date).format('DD MMM YYYY')}</> : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-700 max-w-[280px] truncate" title={a.description}>{a.description}</td>
                    <td className={clsx('py-2.5 px-3 text-xs font-semibold whitespace-nowrap', Number(a.amount_change) < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {Number(a.amount_change) >= 0 ? '+' : ''}₹{inr(a.amount_change)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-800 whitespace-nowrap">₹{inr(a.revised_order_value)}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">{a.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
