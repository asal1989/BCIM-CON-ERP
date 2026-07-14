import React, { useState } from 'react';
import { ClipboardList, Clock, CheckCircle, XCircle, User, Calendar, MessageSquare, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrAdvancedAPI } from '../../../api/client';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'all',      label: 'All',      icon: ClipboardList },
  { key: 'pending',  label: 'Pending',  icon: Clock         },
  { key: 'approved', label: 'Approved', icon: CheckCircle   },
  { key: 'rejected', label: 'Rejected', icon: XCircle       },
];

const STATUS_STYLE = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

function RequestRow({ req, onApprove, onReject, isPending }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-slate-100 rounded-full">
          <User size={14} className="text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{req.employee_name || '—'}</p>
          {req.employee_code && <p className="text-xs text-slate-400">{req.employee_code}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={11} /> {req.attendance_date ? String(req.attendance_date).slice(0,10) : '—'}
            </span>
            {req.reason && (
              <span className="flex items-center gap-1">
                <MessageSquare size={11} /> {req.reason}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
            {req.requested_status && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                → {req.requested_status}
              </span>
            )}
            {req.requested_in_time  && <span>In:  {String(req.requested_in_time).slice(0,5)}</span>}
            {req.requested_out_time && <span>Out: {String(req.requested_out_time).slice(0,5)}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[req.status] || 'bg-slate-100 text-slate-500'}`}>
          {req.status}
        </span>
        {req.status === 'pending' && (
          <>
            <button onClick={() => onApprove(req.id)} disabled={isPending}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
              Approve
            </button>
            <button onClick={() => onReject(req.id)} disabled={isPending}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AttendanceRegularizationPage() {
  const [tab, setTab] = useState('pending');
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-regularizations'] });

  const { data, isLoading } = useQuery({
    queryKey: ['hr-regularizations', tab],
    queryFn: () =>
      hrAdvancedAPI.listRegularizations({ status: tab === 'all' ? undefined : tab })
        .then(r => r.data?.data || []),
  });

  const approve = useMutation({
    mutationFn: (id) => hrAdvancedAPI.actionRegularization(id, 'approve'),
    onSuccess: () => { toast.success('Request approved — attendance updated'); refresh(); },
    onError:   e  => toast.error(e.response?.data?.error || 'Failed to approve'),
  });

  const reject = useMutation({
    mutationFn: (id) => hrAdvancedAPI.actionRegularization(id, 'reject'),
    onSuccess: () => { toast.success('Request rejected'); refresh(); },
    onError:   e  => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  const rows = Array.isArray(data) ? data : [];
  const isPending = approve.isPending || reject.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList size={20} className="text-indigo-500" /> Attendance Regularization
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and approve employee punch correction requests</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <ClipboardList size={36} className="mx-auto text-slate-200 mb-3"/>
          <p className="text-slate-500 font-semibold">No {tab === 'all' ? '' : tab} requests</p>
          <p className="text-slate-400 text-xs mt-1">Employees submit corrections via the ESS portal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(req => (
            <RequestRow key={req.id} req={req}
              onApprove={id => approve.mutate(id)}
              onReject={id => reject.mutate(id)}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
