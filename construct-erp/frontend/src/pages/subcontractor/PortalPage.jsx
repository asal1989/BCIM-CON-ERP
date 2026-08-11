// src/pages/subcontractor/PortalPage.jsx — Subcontractor self-service portal
// Restricted view: a logged-in user with vendor_id set can see only their own bills.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, AlertCircle, Building2, FileText, Clock, CheckCircle2 } from 'lucide-react';
import { subcontractorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { clsx } from 'clsx';

const fmt = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_PILL = {
  pending:   'bg-slate-100 text-slate-600',
  submitted: 'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  paid:      'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

export default function SubcontractorPortalPage() {
  const { user } = useAuthStore();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['portal-my-bills'],
    queryFn: () => subcontractorAPI.portalMyBills().then(r => r.data?.data || []),
    retry: 1,
  });

  // Not provisioned check
  if (isError && error?.response?.status === 403) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-amber-200 rounded-2xl p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-black">Portal Access Not Configured</h2>
          <p className="text-sm text-slate-600 mt-2">
            Your account is not linked to a vendor record. Please contact the administrator
            to enable your subcontractor portal access.
          </p>
        </div>
      </div>
    );
  }

  const bills = data || [];
  const stats = {
    total:   bills.length,
    pending: bills.filter(b => ['pending', 'submitted'].includes(b.status)).length,
    paid:    bills.filter(b => b.status === 'paid').length,
    rejected:bills.filter(b => b.status === 'rejected').length,
    totalPayable: bills.reduce((s, b) => s + Number(b.net_payable || 0), 0),
    totalPaid:    bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.net_payable || 0), 0),
  };
  const outstanding = stats.totalPayable - stats.totalPaid;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Subcontractor Portal</h1>
              <p className="text-sm text-white/80">Welcome, {user?.name || user?.email}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/80 uppercase tracking-wider">Outstanding</div>
            <div className="text-2xl font-bold">{fmt(outstanding)}</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Receipt}      label="Total Bills" value={stats.total}   color="text-slate-700" />
          <KpiCard icon={Clock}        label="Pending"     value={stats.pending} color="text-amber-600" />
          <KpiCard icon={CheckCircle2} label="Paid"        value={stats.paid}    color="text-emerald-600" />
          <KpiCard icon={AlertCircle}  label="Rejected"    value={stats.rejected} color="text-red-600" />
        </div>

        {/* Bills */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-black">My Bills</span>
            <span className="ml-auto text-xs text-slate-400">{bills.length} record{bills.length !== 1 ? 's' : ''}</span>
          </div>
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : bills.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              No bills yet. Bills raised against your work orders will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Bill #</th>
                    <th className="px-4 py-3 text-left">WO</th>
                    <th className="px-4 py-3 text-left">Project</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Bill Date</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Net Payable</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bills.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-700">{b.bill_number}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.wo_number}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{b.project_name}</td>
                      <td className="px-4 py-3 text-xs uppercase text-slate-600">{b.bill_type || 'ra'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-semibold">{fmt(b.gross_amount || b.bill_amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-bold">{fmt(b.net_payable)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                          STATUS_PILL[b.status] || STATUS_PILL.pending)}>
                          {b.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {b.status === 'paid' && b.payment_date ? (
                          <div>
                            <div className="text-emerald-700 font-semibold">{new Date(b.payment_date).toLocaleDateString('en-IN')}</div>
                            {b.payment_ref && <div className="text-[10px] text-slate-400">Ref: {b.payment_ref}</div>}
                          </div>
                        ) : b.status === 'rejected' ? (
                          <span className="text-red-600 text-[11px]">{b.rejection_reason?.slice(0, 40) || 'Rejected'}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-slate-400">
          Read-only portal · For questions contact your project manager.
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={clsx('w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
        <div className={clsx('text-xl font-bold leading-none', color)}>{value}</div>
      </div>
    </div>
  );
}
