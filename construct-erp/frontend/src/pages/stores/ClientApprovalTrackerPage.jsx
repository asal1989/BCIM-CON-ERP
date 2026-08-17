// src/pages/stores/ClientApprovalTrackerPage.jsx
// Client Approval Tracker — BCIM MR No vs the client's own MIS/reference No
// and the recorded client-approval date, across all (or one) project.
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, Search, ClipboardCheck } from 'lucide-react';
import { mrsAPI, projectAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

export default function ClientApprovalTrackerPage() {
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: mrsRows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mrs-client-tracker', projectId || 'all'],
    queryFn: () => mrsAPI.list({ project_id: projectId || undefined }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const tracked = useMemo(() => {
    const rows = mrsRows.filter(r => r.status === 'client_approved' || r.client_reference_no);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(r =>
          (r.serial_no_formatted || r.mrs_number || '').toLowerCase().includes(q) ||
          (r.client_reference_no || '').toLowerCase().includes(q) ||
          (r.client_approved_by_name || '').toLowerCase().includes(q))
      : rows;
    return filtered.sort((a, b) =>
      (a.project_name || '').localeCompare(b.project_name || '')
      || (a.serial_no_formatted || '').localeCompare(b.serial_no_formatted || '', undefined, { numeric: true }));
  }, [mrsRows, search]);

  const exportExcel = () => {
    const headers = ['Project', 'BCIM MR No', 'Client MIS / Reference No', 'Client Approved By', 'Client Approved Date', 'Status'];
    const data = tracked.map(r => [
      r.project_name || '',
      r.serial_no_formatted || r.mrs_number || '',
      r.client_reference_no || '',
      r.client_approved_by_name || '',
      r.client_approved_at ? dayjs(r.client_approved_at).format('DD-MM-YYYY') : '',
      (r.status || '').replace(/_/g, ' '),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Client Approval Tracker');
    const projectLabel = projects.find(p => p.id === projectId)?.name || 'all-projects';
    XLSX.writeFile(wb, `client-approval-tracker-${projectLabel.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Client Approval Tracker"
        subtitle="BCIM MR No vs the client's own MIS/reference No and approval date"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Client Approval Tracker' }]}
        actions={
          <>
            <button onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} /> Refresh
            </button>
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </>
        }
      />

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 min-w-[220px]"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search MR No, MIS No, or approver…"
              className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-700"
            />
          </div>
          <span className="text-xs text-slate-400 ml-auto">{tracked.length} record{tracked.length === 1 ? '' : 's'}</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Project</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">BCIM MR No</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Client MIS / Reference No</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Client Approved By</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Client Approved Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500">{r.project_name}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-700">{r.serial_no_formatted || r.mrs_number}</td>
                    <td className="px-4 py-2 font-mono text-teal-700">{r.client_reference_no || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2 text-slate-600">{r.client_approved_by_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2 text-slate-600">{r.client_approved_at ? dayjs(r.client_approved_at).format('DD-MM-YYYY') : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                        r.status === 'client_approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        {(r.status || '').replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isLoading && tracked.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-400 py-10">
                    <ClipboardCheck className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    No client-approved MRs found.
                  </td></tr>
                )}
                {isLoading && (
                  <tr><td colSpan={6} className="text-center text-slate-400 py-10">Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
