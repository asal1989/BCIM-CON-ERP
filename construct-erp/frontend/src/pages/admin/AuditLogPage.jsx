// src/pages/admin/AuditLogPage.jsx — Administration: Audit Log
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api, { auditLogAPI, mailAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import { Search, ChevronDown, ChevronRight, RefreshCw, History, Send } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

const ACTION_COLORS = {
  create:          { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  update:          { bg: 'bg-blue-50',    text: 'text-blue-700' },
  delete:          { bg: 'bg-red-50',     text: 'text-red-700' },
  deactivate:      { bg: 'bg-red-50',     text: 'text-red-700' },
  approve:         { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  verify:          { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  reject:          { bg: 'bg-amber-50',   text: 'text-amber-700' },
  pay:             { bg: 'bg-teal-50',    text: 'text-teal-700' },
  reset_password:  { bg: 'bg-violet-50',  text: 'text-violet-700' },
};

function DiffValue({ value }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  if (typeof value === 'object') {
    return (
      <div className="space-y-0.5">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <span className="text-slate-400">{k}:</span>
            <span className="text-slate-700 break-all">{v == null ? '—' : String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-slate-700">{String(value)}</span>;
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false);
  const colors = ACTION_COLORS[log.action] || { bg: 'bg-slate-100', text: 'text-slate-600' };
  const hasDetail = log.old_values || log.new_values;
  return (
    <>
      <tr className={clsx('border-t border-slate-100 hover:bg-slate-50/60', hasDetail && 'cursor-pointer')}
        onClick={() => hasDetail && setOpen(o => !o)}>
        <td className="px-3 py-2.5 w-6">
          {hasDetail && (open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)}
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dayjs(log.created_at).format('DD MMM YYYY, HH:mm')}</td>
        <td className="px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-800">{log.user_name || 'System'}</p>
          {log.user_role && <p className="text-[10px] text-slate-400">{log.user_role}</p>}
        </td>
        <td className="px-3 py-2.5">
          <span className={clsx('inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', colors.bg, colors.text)}>{log.action}</span>
        </td>
        <td className="px-3 py-2.5 text-xs font-mono text-slate-600">{log.table_name || '—'}</td>
        <td className="px-3 py-2.5 text-[10px] font-mono text-slate-400 truncate max-w-[140px]">{log.record_id || '—'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-400">{log.ip_address || '—'}</td>
      </tr>
      {open && hasDetail && (
        <tr className="border-t border-slate-50 bg-slate-50/40">
          <td />
          <td colSpan={6} className="px-3 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Before</p>
                <DiffValue value={log.old_values} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">After</p>
                <DiffValue value={log.new_values} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ user_id: '', table_name: '', action: '', date_from: '', date_to: '', search: '' });
  const [page, setPage] = useState(1);
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  const { data: users = [] } = useQuery({
    queryKey: ['users-list-for-audit'],
    queryFn: () => api.get('/users').then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });
  const { data: tables = [] } = useQuery({
    queryKey: ['audit-log-tables'],
    queryFn: () => auditLogAPI.tables().then(r => r.data?.data || []),
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-log', filters, page],
    queryFn: () => auditLogAPI.list({ ...filters, page, page_size: 50 }).then(r => r.data),
    staleTime: 0,
  });

  const logs = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, page_size: 50 };
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.page_size));

  const reportMut = useMutation({
    mutationFn: () => mailAPI.erpDailyReport().then(r => r.data),
    onMutate:   () => toast.loading('Sending daily report…', { id: 'erp-report' }),
    onSuccess:  (res) => toast.success(
      `Report sent to ${(res.sent_to || []).join(', ')} · ${res.commits ?? 0} change(s)`,
      { id: 'erp-report', duration: 6000 }
    ),
    onError:    (e)  => toast.error(e?.response?.data?.error || 'Failed to send report', { id: 'erp-report' }),
  });

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Audit Log"
        subtitle="Who did what, when — sensitive actions across the system"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit Log' }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => reportMut.mutate()} disabled={reportMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-60"
              style={{ background: Theme.navy, color: '#fff' }}>
              <Send className="w-3.5 h-3.5" />
              {reportMut.isPending ? 'Sending…' : 'Send Daily Report'}
            </button>
            <button onClick={() => refetch()} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="col-span-2 relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input value={filters.search} onChange={e => set('search', e.target.value)} placeholder="Search user, table, action…"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <select value={filters.user_id} onChange={e => set('user_id', e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={filters.table_name} onChange={e => set('table_name', e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="">All Tables</option>
              {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filters.action} onChange={e => set('action', e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="">All Actions</option>
              {Object.keys(ACTION_COLORS).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" value={filters.date_from} onChange={e => set('date_from', e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-5 space-y-2">{[1, 2, 3, 4, 5].map(n => <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <History className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-500 font-semibold text-sm">No activity recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Sensitive actions (user changes, deletions, approvals) will appear here as they happen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-6" />
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">When</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">User</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Table</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Record</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>
          )}

          {pagination.total > pagination.page_size && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <span>{pagination.total} total entries</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40">Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
