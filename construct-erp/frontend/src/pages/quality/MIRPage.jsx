// src/pages/quality/MIRPage.jsx
// Material Inspection Request register

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  PackageCheck, Plus, X, CheckCircle2, Clock, XCircle,
  AlertCircle, ThumbsUp, ThumbsDown, Search, Edit2,
  Trash2, Save, Play, Eye
} from 'lucide-react';
import { qualityAPI, projectAPI, vendorAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const STATUS_CFG = {
  pending:                { label: 'Pending',               color: 'bg-slate-100 text-slate-600',    icon: Clock },
  inspecting:             { label: 'Inspecting',            color: 'bg-blue-100 text-blue-700',      icon: Play },
  approved:               { label: 'Approved',              color: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2 },
  conditionally_approved: { label: 'Cond. Approved',        color: 'bg-amber-100 text-amber-700',    icon: AlertCircle },
  rejected:               { label: 'Rejected',              color: 'bg-red-100 text-red-700',        icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function MIRPage() {
  const qc = useQueryClient();
  const [showForm,    setShowForm]    = useState(false);
  const [editMIR,     setEditMIR]     = useState(null);
  const [detailMIR,   setDetailMIR]   = useState(null);
  const [rejectId,    setRejectId]    = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveId,   setApproveId]   = useState(null);
  const [conditions,  setConditions]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search, setSearch] = useState('');

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: mirs = [], isLoading } = useQuery({
    queryKey: ['quality-mir', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listMIR({
      project_id: projectFilter || undefined,
      status:     statusFilter  || undefined,
      search:     search        || undefined,
    }).then(r => r.data?.data ?? []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d?.data ?? []; }),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['quality-checklists'],
    queryFn: () => qualityAPI.listChecklists().then(r => r.data?.data ?? []),
  });

  // detail query
  const { data: mirDetail } = useQuery({
    queryKey: ['quality-mir-detail', detailMIR?.id],
    queryFn: () => qualityAPI.getMIR(detailMIR.id).then(r => r.data?.data),
    enabled: !!detailMIR?.id,
  });

  // ── form ───────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const openCreate = () => { reset({}); setEditMIR(null); setShowForm(true); };
  const openEdit   = (m) => {
    reset({
      project_id: m.project_id, material_name: m.material_name,
      material_code: m.material_code || '', vendor_id: m.vendor_id || '',
      vendor_name: m.vendor_name || '', delivery_date: m.delivery_date?.slice(0,10) || '',
      delivery_location: m.delivery_location || '', quantity: m.quantity || '',
      unit: m.unit || '', purchase_order_ref: m.purchase_order_ref || '',
      grn_ref: m.grn_ref || '', traceability_ref: m.traceability_ref || '',
      remarks: m.remarks || '', mtc_required: m.mtc_required,
    });
    setEditMIR(m); setShowForm(true);
  };

  // ── mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (d) => editMIR ? qualityAPI.updateMIR(editMIR.id, d) : qualityAPI.createMIR(d),
    onSuccess: () => {
      toast.success(editMIR ? 'MIR updated' : 'MIR created');
      qc.invalidateQueries({ queryKey: ['quality-mir'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const startMut = useMutation({
    mutationFn: (id) => qualityAPI.startMIRInspection(id),
    onSuccess: () => { toast.success('Inspection started'); qc.invalidateQueries({ queryKey: ['quality-mir'] }); },
  });

  const approveMut = useMutation({
    mutationFn: ({ id, conditions_of_approval }) => qualityAPI.approveMIR(id, { conditions_of_approval }),
    onSuccess: () => {
      toast.success('MIR approved');
      qc.invalidateQueries({ queryKey: ['quality-mir'] });
      setApproveId(null); setConditions('');
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, rejection_reason }) => qualityAPI.rejectMIR(id, { rejection_reason }),
    onSuccess: () => {
      toast.success('MIR rejected');
      qc.invalidateQueries({ queryKey: ['quality-mir'] });
      setRejectId(null); setRejectReason('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deleteMIR(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quality-mir'] }); },
  });

  const attachMut = useMutation({
    mutationFn: ({ id, attachments }) => qualityAPI.updateMIRAttachments(id, attachments),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['quality-mir'] });
      qc.invalidateQueries({ queryKey: ['quality-mir-detail', id] });
    },
  });

  // ── counts ─────────────────────────────────────────────────────────────────
  const counts = {
    total:     mirs.length,
    pending:   mirs.filter(m => m.status === 'pending').length,
    inspecting:mirs.filter(m => m.status === 'inspecting').length,
    approved:  mirs.filter(m => ['approved','conditionally_approved'].includes(m.status)).length,
    rejected:  mirs.filter(m => m.status === 'rejected').length,
  };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
            <PackageCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Material Inspection Requests</h1>
            <p className="text-xs text-slate-500">MIR Register — Pending → Inspect → Approve / Reject</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New MIR
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',      value: counts.total,      color: 'text-slate-700' },
          { label: 'Pending',    value: counts.pending,    color: 'text-slate-500' },
          { label: 'Inspecting', value: counts.inspecting, color: 'text-blue-600' },
          { label: 'Approved',   value: counts.approved,   color: 'text-emerald-600' },
          { label: 'Rejected',   value: counts.rejected,   color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className={clsx('text-xl font-bold', k.color)}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search MIR number, material, vendor…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-teal-400" />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : mirs.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No Material Inspection Requests found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['MIR #','Material','Vendor','Project','Delivery Date','MTC Req','Status','Tests / MTCs','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mirs.map(mir => (
                <tr key={mir.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                      {mir.mir_number}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 text-sm">{mir.material_name}</p>
                    {mir.traceability_ref && <p className="text-xs text-slate-400">Batch: {mir.traceability_ref}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{mir.vendor_name || mir.vendor_name_resolved || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{mir.project_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {mir.delivery_date ? dayjs(mir.delivery_date).format('DD MMM YYYY') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {mir.mtc_required ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Required</span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={mir.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      {mir.lab_test_count > 0 && (
                        <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                          {mir.lab_test_count} tests
                        </span>
                      )}
                      {mir.mtc_count > 0 && (
                        <span className="bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                          {mir.mtc_count} MTCs
                        </span>
                      )}
                      {!mir.lab_test_count && !mir.mtc_count && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDetailMIR(mir)} title="View details"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-300 transition-all">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {['pending','inspecting'].includes(mir.status) && (
                        <button onClick={() => openEdit(mir)} title="Edit"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {mir.status === 'pending' && (
                        <button onClick={() => startMut.mutate(mir.id)} title="Start inspection"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['pending','inspecting'].includes(mir.status) && (
                        <>
                          <button onClick={() => setApproveId(mir.id)} title="Approve"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all">
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setRejectId(mir.id)} title="Reject"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-all">
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {mir.status === 'pending' && (
                        <button onClick={() => { if (window.confirm('Delete this MIR?')) deleteMut.mutate(mir.id); }} title="Delete"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve modal */}
      {approveId && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-emerald-500" /> Approve Material Inspection
            </h2>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                Conditions of Approval <span className="text-slate-400">(optional — leave blank for unconditional)</span>
              </label>
              <textarea rows={3} value={conditions} onChange={e => setConditions(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
                placeholder="Any conditions, restrictions or observations…" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setApproveId(null); setConditions(''); }}
                className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-lg py-2 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => approveMut.mutate({ id: approveId, conditions_of_approval: conditions || undefined })}
                disabled={approveMut.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg py-2 disabled:opacity-60">
                {approveMut.isPending ? 'Approving…' : conditions ? 'Conditionally Approve' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-red-500" /> Reject Material
            </h2>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Rejection Reason *</label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                placeholder="Reason for rejection…" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-lg py-2 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => rejectMut.mutate({ id: rejectId, rejection_reason: rejectReason })}
                disabled={!rejectReason.trim() || rejectMut.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg py-2 disabled:opacity-60">
                {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailMIR && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-teal-600">
              <div>
                <p className="text-base font-semibold text-white">
                  {mirDetail?.mir_number || detailMIR.mir_number}
                </p>
                <p className="text-xs text-teal-200 mt-0.5">{mirDetail?.material_name || detailMIR.material_name}</p>
              </div>
              <button onClick={() => setDetailMIR(null)} className="text-teal-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              {mirDetail ? (
                <>
                  {/* Info grid */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Status',      value: <StatusBadge status={mirDetail.status} /> },
                      { label: 'Project',     value: mirDetail.project_name },
                      { label: 'Vendor',      value: mirDetail.vendor_name || mirDetail.vendor_name_resolved || '—' },
                      { label: 'Delivery Date', value: mirDetail.delivery_date ? dayjs(mirDetail.delivery_date).format('DD MMM YYYY') : '—' },
                      { label: 'Quantity',    value: mirDetail.quantity ? `${mirDetail.quantity} ${mirDetail.unit || ''}` : '—' },
                      { label: 'MTC Required', value: mirDetail.mtc_required ? 'Yes' : 'No' },
                      { label: 'PO Ref',      value: mirDetail.purchase_order_ref || '—' },
                      { label: 'GRN Ref',     value: mirDetail.grn_ref || '—' },
                      { label: 'Traceability', value: mirDetail.traceability_ref || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                        <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Conditions / Rejection */}
                  {mirDetail.conditions_of_approval && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Conditions of Approval</p>
                      <p className="text-sm text-amber-800">{mirDetail.conditions_of_approval}</p>
                    </div>
                  )}
                  {mirDetail.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-red-700 mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-800">{mirDetail.rejection_reason}</p>
                    </div>
                  )}

                  {/* Linked lab tests */}
                  {mirDetail.lab_tests?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Linked Lab Tests</p>
                      <div className="space-y-1">
                        {mirDetail.lab_tests.map(lt => (
                          <div key={lt.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                            <span className="font-mono text-xs text-indigo-700">{lt.test_number}</span>
                            <span className="text-xs text-slate-600">{lt.material_name} — {lt.test_name}</span>
                            <span className={clsx('ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              lt.result_status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                              lt.result_status === 'fail' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700')}>
                              {lt.result_status || 'pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linked MTCs */}
                  {mirDetail.mtcs?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Linked Test Certificates</p>
                      <div className="space-y-1">
                        {mirDetail.mtcs.map(mt => (
                          <div key={mt.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                            <span className="font-mono text-xs text-violet-700">{mt.internal_ref}</span>
                            <span className="text-xs text-slate-600">{mt.material_name} — {mt.mtc_number}</span>
                            <span className={clsx('ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              mt.auto_result === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                              mt.auto_result === 'fail' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-600')}>
                              {mt.auto_result}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attachments */}
                  <AttachmentPanel
                    attachments={mirDetail.attachments || []}
                    onUpdate={(atts) => attachMut.mutate({ id: mirDetail.id, attachments: atts })}
                    label="MIR Attachments & Photos"
                  />
                </>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editMIR ? `Edit MIR — ${editMIR.mir_number}` : 'New Material Inspection Request'}
              </h2>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                  <select {...register('project_id', { required: true })} disabled={!!editMIR}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400',
                      errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Material Name *</label>
                  <input {...register('material_name', { required: true })}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400',
                      errors.material_name ? 'border-red-300' : 'border-slate-200')}
                    placeholder="e.g. Reinforcement Steel Fe500D" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Material Code</label>
                  <input {...register('material_code')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="e.g. STEEL-FE500D-12MM" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Traceability Ref (Heat/Batch)</label>
                  <input {...register('traceability_ref')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Heat No. / Batch No." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vendor</label>
                  <select {...register('vendor_id')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400">
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Date</label>
                  <input type="date" {...register('delivery_date')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                  <input type="number" step="any" {...register('quantity')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                  <input {...register('unit')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="MT / bags / Nos" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">PO Reference</label>
                  <input {...register('purchase_order_ref')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="PO number" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GRN Reference</label>
                  <input {...register('grn_ref')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="GRN number" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Location</label>
                  <input {...register('delivery_location')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Site Gate / Store" />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <input type="checkbox" id="mtc_req" {...register('mtc_required')}
                    className="w-4 h-4 text-teal-600 rounded" />
                  <label htmlFor="mtc_req" className="text-sm font-medium text-slate-700">
                    MTC / Test Certificate Required
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                <textarea {...register('remarks')} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 resize-none"
                  placeholder="Any additional observations…" />
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : editMIR ? 'Update MIR' : 'Create MIR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
