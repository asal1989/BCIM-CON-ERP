// src/pages/quality/MTCPage.jsx
// Material Test Certificates — upload, test parameters, auto pass/fail, review workflow

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ShieldCheck, Plus, X, CheckCircle2, XCircle, Clock,
  ThumbsUp, ThumbsDown, Search, Edit2, Trash2,
  Save, Eye, Award, AlertTriangle
} from 'lucide-react';
import { qualityAPI, projectAPI, vendorAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const AUTO_RESULT_CFG = {
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-600',     icon: Clock },
  pass:    { label: 'Pass',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  fail:    { label: 'Fail',    color: 'bg-red-100 text-red-700',         icon: XCircle },
};
const STATUS_CFG = {
  pending_review: { label: 'Pending Review', color: 'bg-amber-100 text-amber-700',    icon: Clock },
  accepted:       { label: 'Accepted',       color: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2 },
  rejected:       { label: 'Rejected',       color: 'bg-red-100 text-red-700',        icon: XCircle },
  conditional:    { label: 'Conditional',    color: 'bg-blue-100 text-blue-700',      icon: AlertTriangle },
};

function ResultBadge({ result, cfg }) {
  const c = cfg[result] || cfg[Object.keys(cfg)[0]];
  const Icon = c.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', c.color)}>
      <Icon className="w-3 h-3" />{c.label}
    </span>
  );
}

// Evaluate a single test parameter row
function evalParam(p) {
  if (p.actual == null || p.actual === '') return 'pending';
  const v = parseFloat(p.actual);
  if (isNaN(v)) return 'pending';
  if (p.required_min != null && v < parseFloat(p.required_min)) return 'fail';
  if (p.required_max != null && v > parseFloat(p.required_max)) return 'fail';
  return 'pass';
}

const emptyParam = () => ({ parameter: '', required_min: '', required_max: '', unit: '', actual: '' });

export default function MTCPage() {
  const qc = useQueryClient();
  const [showForm,    setShowForm]    = useState(false);
  const [editMTC,     setEditMTC]     = useState(null);
  const [detailMTC,   setDetailMTC]   = useState(null);
  const [reviewData,  setReviewData]  = useState(null); // { id, action }
  const [reviewRemark,setReviewRemark]= useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search, setSearch] = useState('');

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: mtcs = [], isLoading } = useQuery({
    queryKey: ['quality-mtc', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listMTC({
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

  const { data: mirs = [] } = useQuery({
    queryKey: ['quality-mir'],
    queryFn: () => qualityAPI.listMIR().then(r => r.data?.data ?? []),
  });

  const { data: mtcDetail } = useQuery({
    queryKey: ['quality-mtc-detail', detailMTC?.id],
    queryFn: () => qualityAPI.getMTC(detailMTC.id).then(r => r.data?.data),
    enabled: !!detailMTC?.id,
  });

  // ── form ───────────────────────────────────────────────────────────────────
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm({
    defaultValues: { test_parameters: [emptyParam()] }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'test_parameters' });
  const watchedParams = watch('test_parameters');

  const openCreate = () => { reset({ test_parameters: [emptyParam()] }); setEditMTC(null); setShowForm(true); };
  const openEdit   = (m) => {
    const params = Array.isArray(m.test_parameters) && m.test_parameters.length
      ? m.test_parameters : [emptyParam()];
    reset({
      project_id: m.project_id, mtc_number: m.mtc_number,
      material_name: m.material_name, material_grade: m.material_grade || '',
      manufacturer: m.manufacturer || '', heat_number: m.heat_number || '',
      batch_number: m.batch_number || '', test_lab: m.test_lab || '',
      nabl_accredited: m.nabl_accredited, iso_certified: m.iso_certified,
      accreditation_no: m.accreditation_no || '',
      cert_date: m.cert_date?.slice(0,10) || '',
      expiry_date: m.expiry_date?.slice(0,10) || '',
      applicable_spec: m.applicable_spec || '',
      mir_id: m.mir_id || '', vendor_id: m.vendor_id || '',
      test_parameters: params,
    });
    setEditMTC(m); setShowForm(true);
  };

  // ── mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (d) => {
      // Clean up test_parameters — remove empty rows
      const cleaned = {
        ...d,
        test_parameters: (d.test_parameters || [])
          .filter(p => p.parameter?.trim())
          .map(p => ({
            ...p,
            required_min: p.required_min !== '' ? parseFloat(p.required_min) : null,
            required_max: p.required_max !== '' ? parseFloat(p.required_max) : null,
            actual:       p.actual       !== '' ? parseFloat(p.actual) : null,
          })),
      };
      return editMTC ? qualityAPI.updateMTC(editMTC.id, cleaned) : qualityAPI.createMTC(cleaned);
    },
    onSuccess: () => {
      toast.success(editMTC ? 'MTC updated' : 'MTC created');
      qc.invalidateQueries({ queryKey: ['quality-mtc'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action, review_remarks }) => qualityAPI.reviewMTC(id, { action, review_remarks }),
    onSuccess: () => {
      toast.success(`MTC ${reviewData.action}`);
      qc.invalidateQueries({ queryKey: ['quality-mtc'] });
      setReviewData(null); setReviewRemark('');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Review failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deleteMTC(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quality-mtc'] }); },
  });

  const attachMut = useMutation({
    mutationFn: ({ id, attachments }) => qualityAPI.updateMTCAttachments(id, attachments),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['quality-mtc'] });
      qc.invalidateQueries({ queryKey: ['quality-mtc-detail', id] });
    },
  });

  // ── counts ─────────────────────────────────────────────────────────────────
  const counts = {
    total:    mtcs.length,
    pending:  mtcs.filter(m => m.auto_result === 'pending').length,
    pass:     mtcs.filter(m => m.auto_result === 'pass').length,
    fail:     mtcs.filter(m => m.auto_result === 'fail').length,
    accepted: mtcs.filter(m => m.status === 'accepted').length,
  };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-black">Material Test Certificates</h1>
            <p className="text-xs text-slate-500">MTC / MIL Register — Auto pass/fail vs spec · NABL / ISO 17025</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New MTC
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Certs', value: counts.total,    color: 'text-slate-700' },
          { label: 'Pending',     value: counts.pending,  color: 'text-amber-600' },
          { label: 'Pass',        value: counts.pass,     color: 'text-emerald-600' },
          { label: 'Fail',        value: counts.fail,     color: 'text-red-600' },
          { label: 'Accepted',    value: counts.accepted, color: 'text-violet-600' },
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
            placeholder="Search ref, cert no, material…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-violet-400" />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : mtcs.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No Test Certificates uploaded yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Ref #','Cert No','Material','Grade','Lab','NABL','Cert Date','Test Result','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mtcs.map(mtc => (
                <tr key={mtc.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                      {mtc.internal_ref}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700">{mtc.mtc_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-black text-sm">{mtc.material_name}</p>
                    {mtc.heat_number && <p className="text-xs text-slate-400">Heat: {mtc.heat_number}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{mtc.material_grade || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{mtc.test_lab || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {mtc.nabl_accredited ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                        <Award className="w-3 h-3" /> NABL
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {mtc.cert_date ? dayjs(mtc.cert_date).format('DD MMM YYYY') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ResultBadge result={mtc.auto_result} cfg={AUTO_RESULT_CFG} />
                  </td>
                  <td className="px-4 py-3">
                    <ResultBadge result={mtc.status} cfg={STATUS_CFG} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDetailMTC(mtc)} title="View"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-all">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {mtc.status === 'pending_review' && (
                        <>
                          <button onClick={() => openEdit(mtc)} title="Edit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setReviewData({ id: mtc.id, action: 'accepted' })} title="Accept"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all">
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setReviewData({ id: mtc.id, action: 'rejected' })} title="Reject"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-all">
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm('Delete?')) deleteMut.mutate(mtc.id); }} title="Delete"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review modal */}
      {reviewData && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className={clsx('text-base font-semibold flex items-center gap-2',
              reviewData.action === 'accepted' ? 'text-emerald-700' : 'text-red-700')}>
              {reviewData.action === 'accepted'
                ? <><ThumbsUp className="w-4 h-4" /> Accept Test Certificate</>
                : <><ThumbsDown className="w-4 h-4" /> Reject Test Certificate</>}
            </h2>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                Review Remarks {reviewData.action === 'rejected' && '*'}
              </label>
              <textarea rows={3} value={reviewRemark} onChange={e => setReviewRemark(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
                placeholder={reviewData.action === 'accepted' ? 'Observations (optional)…' : 'Reason for rejection *'} />
            </div>
            {reviewData.action === 'accepted' && (
              <div className="flex gap-2">
                {['accepted','conditional'].map(a => (
                  <button key={a} type="button"
                    onClick={() => setReviewData(p => ({ ...p, action: a }))}
                    className={clsx('flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all',
                      reviewData.action === a
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300')}>
                    {a === 'accepted' ? 'Full Accept' : 'Conditional'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setReviewData(null); setReviewRemark(''); }}
                className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-lg py-2 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => reviewMut.mutate({ id: reviewData.id, action: reviewData.action, review_remarks: reviewRemark })}
                disabled={reviewData.action === 'rejected' && !reviewRemark.trim()}
                className={clsx('flex-1 text-white text-sm rounded-lg py-2 transition-colors disabled:opacity-60',
                  reviewData.action === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
                {reviewMut.isPending ? 'Saving…' : `Confirm ${reviewData.action}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailMTC && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-violet-600">
              <div>
                <p className="text-base font-semibold text-white">
                  {mtcDetail?.internal_ref || detailMTC.internal_ref} — {mtcDetail?.mtc_number || detailMTC.mtc_number}
                </p>
                <p className="text-xs text-violet-200 mt-0.5">{mtcDetail?.material_name || detailMTC.material_name}</p>
              </div>
              <button onClick={() => setDetailMTC(null)} className="text-violet-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              {mtcDetail ? (
                <>
                  {/* Info grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Auto Result', value: <ResultBadge result={mtcDetail.auto_result} cfg={AUTO_RESULT_CFG} /> },
                      { label: 'Review Status', value: <ResultBadge result={mtcDetail.status} cfg={STATUS_CFG} /> },
                      { label: 'NABL', value: mtcDetail.nabl_accredited ? '✓ Accredited' : 'Not accredited' },
                      { label: 'Test Lab', value: mtcDetail.test_lab || '—' },
                      { label: 'Grade', value: mtcDetail.material_grade || '—' },
                      { label: 'Heat/Batch', value: `${mtcDetail.heat_number || '—'} / ${mtcDetail.batch_number || '—'}` },
                      { label: 'Spec', value: mtcDetail.applicable_spec || '—' },
                      { label: 'Cert Date', value: mtcDetail.cert_date ? dayjs(mtcDetail.cert_date).format('DD MMM YYYY') : '—' },
                      { label: 'Expiry', value: mtcDetail.expiry_date ? dayjs(mtcDetail.expiry_date).format('DD MMM YYYY') : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                        <div className="text-sm font-semibold text-black mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Test parameters table */}
                  {Array.isArray(mtcDetail.test_parameters) && mtcDetail.test_parameters.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Test Parameters</p>
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              {['Parameter','Unit','Min Req','Max Req','Actual','Result'].map(h => (
                                <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {mtcDetail.test_parameters.map((p, i) => {
                              const r = evalParam(p);
                              return (
                                <tr key={i} className={r === 'fail' ? 'bg-red-50' : r === 'pass' ? 'bg-emerald-50/30' : ''}>
                                  <td className="px-3 py-2 font-medium text-black">{p.parameter}</td>
                                  <td className="px-3 py-2 text-slate-500">{p.unit || '—'}</td>
                                  <td className="px-3 py-2 text-slate-500">{p.required_min != null ? p.required_min : '—'}</td>
                                  <td className="px-3 py-2 text-slate-500">{p.required_max != null ? p.required_max : '—'}</td>
                                  <td className={clsx('px-3 py-2 font-semibold', r === 'fail' ? 'text-red-700' : r === 'pass' ? 'text-emerald-700' : 'text-slate-400')}>
                                    {p.actual != null && p.actual !== '' ? p.actual : '—'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {r === 'pass' ? <span className="text-emerald-600 font-semibold">PASS</span>
                                    : r === 'fail' ? <span className="text-red-600 font-semibold">FAIL</span>
                                    : <span className="text-slate-400">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Review remarks */}
                  {mtcDetail.review_remarks && (
                    <div className={clsx('rounded-xl p-4 border', mtcDetail.status === 'rejected' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200')}>
                      <p className="text-xs font-semibold mb-1 text-slate-700">Review Remarks</p>
                      <p className="text-sm text-slate-700">{mtcDetail.review_remarks}</p>
                    </div>
                  )}

                  {/* Attachments */}
                  <AttachmentPanel
                    attachments={mtcDetail.attachments || []}
                    onUpdate={(atts) => attachMut.mutate({ id: mtcDetail.id, attachments: atts })}
                    label="Certificates & Test Reports"
                  />
                </>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editMTC ? `Edit MTC — ${editMTC.internal_ref}` : 'New Material Test Certificate'}
              </h2>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-5">

              {/* Row 1: project + cert no + material */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                  <select {...register('project_id', { required: true })} disabled={!!editMTC}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400',
                      errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                    <option value="">Select…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cert Number (from supplier) *</label>
                  <input {...register('mtc_number', { required: true })}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400',
                      errors.mtc_number ? 'border-red-300' : 'border-slate-200')}
                    placeholder="e.g. ABC/2025/001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Material Name *</label>
                  <input {...register('material_name', { required: true })}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400',
                      errors.material_name ? 'border-red-300' : 'border-slate-200')}
                    placeholder="e.g. TMT Steel Bars" />
                </div>
              </div>

              {/* Row 2: grade, manufacturer, heat, batch */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Grade</label>
                  <input {...register('material_grade')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Fe500D / M30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Manufacturer</label>
                  <input {...register('manufacturer')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="SAIL / JSW" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Heat No.</label>
                  <input {...register('heat_number')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Heat # " />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Batch No.</label>
                  <input {...register('batch_number')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Batch # " />
                </div>
              </div>

              {/* Row 3: lab details + dates */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Test Laboratory</label>
                  <input {...register('test_lab')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Lab name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cert Date</label>
                  <input type="date" {...register('cert_date')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Expiry Date</label>
                  <input type="date" {...register('expiry_date')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400" />
                </div>
              </div>

              {/* Row 4: NABL / ISO / spec / MIR */}
              <div className="grid grid-cols-4 gap-4 items-end">
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="nabl" {...register('nabl_accredited')} className="w-4 h-4 text-violet-600 rounded" />
                  <label htmlFor="nabl" className="text-sm font-medium text-slate-700">NABL Accredited</label>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="iso" {...register('iso_certified')} className="w-4 h-4 text-violet-600 rounded" />
                  <label htmlFor="iso" className="text-sm font-medium text-slate-700">ISO 17025 Certified</label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Applicable Spec</label>
                  <input {...register('applicable_spec')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="IS 1786 / IS 432" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Linked MIR</label>
                  <select {...register('mir_id')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
                    <option value="">None</option>
                    {mirs.map(m => <option key={m.id} value={m.id}>{m.mir_number} — {m.material_name}</option>)}
                  </select>
                </div>
              </div>

              {/* Test parameters table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Test Parameters <span className="font-normal text-slate-400 normal-case">(values vs spec — auto pass/fail)</span>
                  </label>
                  <button type="button" onClick={() => append(emptyParam())}
                    className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add row
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Parameter','Unit','Min Required','Max Required','Actual Value','Result',''].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {fields.map((field, i) => {
                        const p = watchedParams?.[i] || {};
                        const r = evalParam(p);
                        return (
                          <tr key={field.id} className={r === 'fail' ? 'bg-red-50' : r === 'pass' ? 'bg-emerald-50/30' : ''}>
                            <td className="px-3 py-1.5">
                              <input {...register(`test_parameters.${i}.parameter`)}
                                className="w-full border-0 bg-transparent outline-none text-sm placeholder:text-slate-300"
                                placeholder="e.g. Yield Strength" />
                            </td>
                            <td className="px-3 py-1.5 w-16">
                              <input {...register(`test_parameters.${i}.unit`)}
                                className="w-full border-0 bg-transparent outline-none text-xs placeholder:text-slate-300"
                                placeholder="MPa" />
                            </td>
                            <td className="px-3 py-1.5 w-24">
                              <input type="number" step="any" {...register(`test_parameters.${i}.required_min`)}
                                className="w-full border-0 bg-transparent outline-none text-xs placeholder:text-slate-300"
                                placeholder="415" />
                            </td>
                            <td className="px-3 py-1.5 w-24">
                              <input type="number" step="any" {...register(`test_parameters.${i}.required_max`)}
                                className="w-full border-0 bg-transparent outline-none text-xs placeholder:text-slate-300"
                                placeholder="600" />
                            </td>
                            <td className="px-3 py-1.5 w-24">
                              <input type="number" step="any" {...register(`test_parameters.${i}.actual`)}
                                className="w-full border-0 bg-transparent outline-none text-xs placeholder:text-slate-300"
                                placeholder="450" />
                            </td>
                            <td className="px-3 py-1.5 w-16 text-center">
                              {r === 'pass' && <span className="text-emerald-600 font-bold text-xs">PASS</span>}
                              {r === 'fail' && <span className="text-red-600 font-bold text-xs">FAIL</span>}
                              {r === 'pending' && <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className="px-2 w-8">
                              {fields.length > 1 && (
                                <button type="button" onClick={() => remove(i)}
                                  className="text-slate-300 hover:text-red-400">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : editMTC ? 'Update MTC' : 'Create MTC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
