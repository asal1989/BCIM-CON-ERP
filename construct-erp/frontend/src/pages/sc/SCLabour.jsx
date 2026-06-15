// src/pages/sc/SCLabour.jsx — Worker Registry + Daily Attendance + NMR (Muster Roll)
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, RefreshCw, HardHat, Users, CheckCircle, X,
  FileText, ChevronRight, ThumbsUp, ThumbsDown, IndianRupee,
  Clock, Send, Receipt, Eye, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const SKILL_TYPES = ['Mason','Carpenter','Barbender','Scaffolder','Plumber','Electrician','Painter','Helper','Unskilled','Supervisor','Engineer','Other'];
const ATT_STATUS  = { present:'bg-emerald-100 text-emerald-700', absent:'bg-red-100 text-red-700', half_day:'bg-amber-100 text-amber-700', holiday:'bg-blue-100 text-blue-700' };
const ATT_CELL    = { present:'P', absent:'A', half_day:'H', holiday:'–' };
const ATT_CELL_BG = { present:'bg-emerald-100 text-emerald-800', absent:'bg-red-100 text-red-700', half_day:'bg-amber-100 text-amber-700', holiday:'bg-slate-100 text-slate-500' };

const NMR_STATUS = {
  draft:     { bg:'bg-slate-100',   text:'text-slate-600',   label:'Draft' },
  submitted: { bg:'bg-blue-100',    text:'text-blue-700',    label:'Submitted' },
  checked:   { bg:'bg-amber-100',   text:'text-amber-700',   label:'Checked' },
  approved:  { bg:'bg-emerald-100', text:'text-emerald-700', label:'Approved' },
  billed:    { bg:'bg-purple-100',  text:'text-purple-700',  label:'Billed' },
};

const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 transition';

// ─── Create NMR Modal ─────────────────────────────────────────────────────────
function CreateNMRModal({ wos, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    wo_id: '', sc_id: '',
    period_from: dayjs().startOf('week').format('YYYY-MM-DD'),
    period_to:   dayjs().endOf('week').format('YYYY-MM-DD'),
    remarks: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // When WO selected, auto-fill sc_id
  const handleWOChange = (id) => {
    const wo = wos.find(w => w.id === id);
    set('wo_id', id);
    if (wo) set('sc_id', wo.sc_id);
  };

  // Preview count
  const { data: preview } = useQuery({
    queryKey: ['nmr-preview-count', form.wo_id, form.period_from, form.period_to],
    queryFn: async () => {
      if (!form.wo_id || !form.period_from || !form.period_to) return null;
      const [att, workers] = await Promise.all([
        scAPI.listAttendance({ sc_id: form.sc_id, from_date: form.period_from, to_date: form.period_to }).then(r => r.data?.data || []),
        scAPI.listWorkers({ sc_id: form.sc_id }).then(r => r.data?.data || []),
      ]);
      return { att: att.length, workers: workers.length };
    },
    enabled: !!form.wo_id,
    staleTime: 0,
  });

  const mut = useMutation({
    mutationFn: () => scAPI.createNMR(form),
    onSuccess: () => { toast.success('NMR created from attendance records'); qc.invalidateQueries({ queryKey: ['sc-nmr'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create NMR'),
  });

  const labourWOs = wos.filter(w => w.contractor_type === 'labour_contractor' && ['active','approved'].includes(w.status));
  const days = form.period_from && form.period_to
    ? dayjs(form.period_to).diff(dayjs(form.period_from), 'day') + 1 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base">Create Nominal Muster Roll (NMR)</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Attendance for the selected period is auto-pulled and wages computed
          </p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">

        {labourWOs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            No active Labour Contractor work orders found. Create a WO for a Labour Contractor first.
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Work Order (Labour Contractor) <span className="text-red-400">*</span>
          </label>
          <select value={form.wo_id} onChange={e => handleWOChange(e.target.value)} className={inp}>
            <option value="">— Select Labour Contractor Work Order —</option>
            {labourWOs.map(w => (
              <option key={w.id} value={w.id}>
                {w.wo_number} — {w.sc_name} — {w.project_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Period From <span className="text-red-400">*</span></label>
            <input type="date" value={form.period_from} onChange={e => set('period_from', e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Period To <span className="text-red-400">*</span></label>
            <input type="date" value={form.period_to} onChange={e => set('period_to', e.target.value)} className={inp} min={form.period_from} />
          </div>
        </div>

        {/* Preview summary */}
        {form.wo_id && (
          <div className={clsx('rounded-xl p-4 border', preview ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200')}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Attendance Preview for Period</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'Period (days)', v: days, color: 'text-slate-800' },
                { l: 'Workers found', v: preview?.workers ?? '…', color: 'text-blue-700' },
                { l: 'Attendance records', v: preview?.att ?? '…', color: 'text-emerald-700' },
              ].map(({ l, v, color }) => (
                <div key={l} className="bg-white border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                  <p className={clsx('text-2xl font-bold', color)}>{v}</p>
                </div>
              ))}
            </div>
            {preview?.att === 0 && (
              <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> No attendance records found for this period. Mark attendance first, then create the NMR.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks</label>
          <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={2} className={inp + ' resize-none'} placeholder="Optional remarks…" />
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700">
          <strong>How wages are computed:</strong>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>Present (full day) = Daily Rate × 1.0</li>
            <li>Half Day = Daily Rate × 0.5</li>
            <li>Overtime = OT hours × (Daily Rate ÷ 8)</li>
            <li>Absent / Holiday = ₹0</li>
          </ul>
          <p className="mt-1.5">Total wages from NMR become the <strong>Gross Amount</strong> of the Labour Bill.</p>
        </div>
      </div>

      <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!form.wo_id || !form.period_from || !form.period_to || mut.isPending}
          className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
          {mut.isPending ? 'Creating…' : 'Create NMR'}
        </button>
      </div>
    </div>
  );
}

// ─── NMR Detail Drawer ────────────────────────────────────────────────────────
function NMRDrawer({ nmrId, onClose }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const { data: raw, isLoading } = useQuery({
    queryKey: ['sc-nmr-detail', nmrId],
    queryFn: () => scAPI.previewNMR(nmrId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!nmrId,
  });

  const mutOpts = (msg) => ({
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['sc-nmr'] }); qc.invalidateQueries({ queryKey: ['sc-nmr-detail', nmrId] }); setComment(''); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const submitMut  = useMutation({ mutationFn: () => scAPI.submitNMR(nmrId),             ...mutOpts('Submitted') });
  const checkMut   = useMutation({ mutationFn: () => scAPI.checkNMR(nmrId, { remarks: comment }), ...mutOpts('Checked') });
  const approveMut = useMutation({ mutationFn: () => scAPI.approveNMR(nmrId, { remarks: comment }), ...mutOpts('Approved') });
  const billMut    = useMutation({
    mutationFn: () => scAPI.raiseBillNMR(nmrId),
    onSuccess: (r) => {
      toast.success(`Bill ${r.data.data.bill.bill_number} created — ₹${Number(r.data.data.bill.gross_amount).toLocaleString('en-IN',{maximumFractionDigits:0})}`);
      qc.invalidateQueries({ queryKey: ['sc-nmr'] });
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-nmr-detail', nmrId] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to raise bill'),
  });

  const nmr     = raw?.nmr;
  const dates   = raw?.dates || [];
  const workers = raw?.workers || [];
  const sm      = NMR_STATUS[nmr?.status] || NMR_STATUS.draft;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-4xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-300 text-xs font-bold">{nmr?.nmr_number || '…'}</span>
              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>
            </div>
            <p className="font-bold text-white text-sm mt-0.5">{nmr?.sc_name} — {nmr?.project_name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {nmr ? `${dayjs(nmr.period_from).format('DD MMM')} – ${dayjs(nmr.period_to).format('DD MMM YYYY')}` : ''}
              &nbsp;· {nmr?.total_workers || 0} workers · {nmr?.total_mandays || 0} man-days
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(n => <div key={n} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : nmr && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: 'Total Workers',  v: nmr.total_workers, color: 'text-blue-700' },
                  { l: 'Total Man-days', v: nmr.total_mandays, color: 'text-indigo-700' },
                  { l: 'Skilled Wages',  v: fmt(nmr.skilled_wages),   color: 'text-emerald-700' },
                  { l: 'Total Wages',    v: fmt(nmr.total_wages),     color: 'text-orange-700', big: true },
                ].map(({ l, v, color, big }) => (
                  <div key={l} className={clsx('border rounded-xl p-3', big ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-white')}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className={clsx('font-bold', big ? 'text-xl' : 'text-lg', color)}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Worker-Day Matrix — the actual muster roll */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Nominal Muster Roll — Worker Attendance Matrix
                </p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                        <tr>
                          <th className="px-3 py-2 text-left text-white/80 whitespace-nowrap sticky left-0 z-10" style={{ background: Theme.navyDark, minWidth: 140 }}>Worker</th>
                          <th className="px-2 py-2 text-white/80 whitespace-nowrap" style={{ minWidth: 70 }}>Trade / Rate</th>
                          {dates.map(d => (
                            <th key={d} className="px-1.5 py-2 text-center text-white/80 whitespace-nowrap" style={{ minWidth: 36 }}>
                              <div>{dayjs(d).format('ddd')}</div>
                              <div style={{ fontSize: 9 }}>{dayjs(d).format('D')}</div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center text-white/80 whitespace-nowrap">Days</th>
                          <th className="px-2 py-2 text-center text-white/80 whitespace-nowrap">OT hrs</th>
                          <th className="px-3 py-2 text-right text-white/80 whitespace-nowrap">Total Wages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workers.map((w, i) => (
                          <tr key={w.worker_id || i} className={clsx('border-t border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <td className="px-3 py-2 sticky left-0 z-10 bg-inherit">
                              <p className="font-semibold text-slate-800 whitespace-nowrap">{w.worker_name}</p>
                              <p className="text-[10px] font-mono text-slate-400">{w.worker_code}</p>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <p className="text-slate-600">{w.skill_type}</p>
                              <p className="text-[10px] font-bold text-blue-600">₹{Number(w.daily_rate).toLocaleString()}/day</p>
                            </td>
                            {w.days.map(day => {
                              const st = day.status;
                              const bg = st ? ATT_CELL_BG[st] : 'text-slate-400';
                              return (
                                <td key={day.date} className="px-1 py-2 text-center">
                                  <span className={clsx('inline-block w-7 h-6 rounded text-[10px] font-bold flex items-center justify-center', bg || 'text-slate-400')}>
                                    {st ? ATT_CELL[st] : '–'}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center font-bold text-indigo-700">{w.mandays}</td>
                            <td className="px-2 py-2 text-center text-slate-600">{w.overtime_hours > 0 ? w.overtime_hours : '—'}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(w.total_wages)}</td>
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                          <td className="px-3 py-2.5 sticky left-0 bg-slate-50" colSpan={2}>TOTAL</td>
                          {dates.map(d => <td key={d} />)}
                          <td className="px-2 py-2.5 text-center text-indigo-700 text-sm">{nmr.total_mandays}</td>
                          <td />
                          <td className="px-3 py-2.5 text-right text-orange-700 text-base">{fmt(nmr.total_wages)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legend:</p>
                {[['P','Present','bg-emerald-100 text-emerald-800'],['A','Absent','bg-red-100 text-red-700'],['H','Half Day','bg-amber-100 text-amber-700'],['–','No Record','text-slate-400']].map(([code,label,cls])=>(
                  <div key={code} className="flex items-center gap-1">
                    <span className={clsx('inline-flex w-6 h-5 rounded text-[10px] font-bold items-center justify-center', cls)}>{code}</span>
                    <span className="text-[11px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>

              {/* Approval actions */}
              {['draft','submitted','checked'].includes(nmr.status) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Remarks</label>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} className={inp + ' resize-none'} placeholder="Add remarks…" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {nmr.status === 'draft' && (
                      <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                        <Send className="w-3 h-3" /> Submit for Check
                      </button>
                    )}
                    {nmr.status === 'submitted' && (
                      <button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600">
                        <CheckCircle2 className="w-3 h-3" /> Mark Checked
                      </button>
                    )}
                    {['submitted','checked'].includes(nmr.status) && (
                      <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
                        <ThumbsUp className="w-3 h-3" /> Approve NMR
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Raise Bill (approved NMR only) */}
              {nmr.status === 'approved' && !nmr.bill_id && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">NMR Approved — Ready to raise bill</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Bill will be created with Gross Amount = <strong>{fmt(nmr.total_wages)}</strong>
                    </p>
                  </div>
                  <button onClick={() => billMut.mutate()} disabled={billMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
                    <Receipt className="w-4 h-4" /> {billMut.isPending ? 'Raising…' : 'Raise Labour Bill'}
                  </button>
                </div>
              )}

              {/* Already billed */}
              {nmr.bill_id && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-purple-800">
                  <Receipt className="w-4 h-4 flex-shrink-0 text-purple-600" />
                  Bill raised from this NMR. View in <strong>Bill Preparation</strong> to track approval &amp; payment.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ESSL Sync Modal ──────────────────────────────────────────────────────────
function EsslSyncModal({ onClose }) {
  const qc = useQueryClient();
  const [syncDate,   setSyncDate]   = useState(new Date().toISOString().slice(0,10));
  const [toDate,     setToDate]     = useState(new Date().toISOString().slice(0,10));
  const [overwrite,  setOverwrite]  = useState(false);
  const [preview,    setPreview]    = useState(null);
  const [syncing,    setSyncing]    = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result,     setResult]     = useState(null);

  const fmtWage = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

  const handlePreview = async () => {
    setPreviewing(true); setPreview(null);
    try {
      const r = await scAPI.esslPreview({ from_date: syncDate, to_date: toDate });
      setPreview(r.data?.data);
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Preview failed — check ESSL settings');
    } finally { setPreviewing(false); }
  };

  const handleSync = async () => {
    setSyncing(true); setResult(null);
    try {
      const r = await scAPI.esslSync({ from_date: syncDate, to_date: toDate, overwrite });
      setResult(r.data?.data);
      toast.success(r.data.message);
      qc.invalidateQueries({ queryKey:['sc-attendance'] });
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const STATUS_BADGE = { present:'bg-emerald-100 text-emerald-700', half_day:'bg-amber-100 text-amber-700', absent:'bg-red-100 text-red-700' };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{background:`linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
        <div>
          <p className="font-bold text-white text-base">Sync Attendance from ESSL Biometric</p>
          <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>Pulls punch records from ESSL server and creates attendance entries</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)'}}>
          <X className="w-4 h-4"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">From Date *</label>
            <input type="date" value={syncDate} onChange={e=>setSyncDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">To Date</label>
            <input type="date" value={toDate} min={syncDate} onChange={e=>setToDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
          </div>
        </div>

        {/* Overwrite toggle */}
        <div className={clsx('flex items-center justify-between p-3 rounded-xl border-2',overwrite?'border-amber-300 bg-amber-50':'border-slate-100')}>
          <div>
            <p className="text-sm font-semibold text-slate-700">Overwrite existing records</p>
            <p className="text-xs text-slate-400 mt-0.5">If attendance already marked for a worker+date, overwrite it with ESSL data</p>
          </div>
          <button onClick={()=>setOverwrite(p=>!p)}
            className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',overwrite?'bg-amber-500':'bg-slate-300')}>
            <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',overwrite?'translate-x-6':'translate-x-1')}/>
          </button>
        </div>

        {/* Preview section */}
        {!result && (
          <div className="flex gap-3">
            <button onClick={handlePreview} disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-300 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 disabled:opacity-50">
              <RefreshCw className={clsx('w-4 h-4',previewing&&'animate-spin')}/> {previewing?'Loading preview…':'Preview (Dry Run)'}
            </button>
            {preview && !result && (
              <button onClick={handleSync} disabled={syncing || preview.mapped===0}
                className="flex items-center gap-2 px-5 py-2 text-white rounded-xl text-sm font-bold disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#059669 0%,#047857 100%)'}}>
                <CheckCircle2 className={clsx('w-4 h-4',syncing&&'animate-spin')}/>
                {syncing?'Syncing…':`Sync ${preview.mapped} Records`}
              </button>
            )}
          </div>
        )}

        {/* Preview results */}
        {preview && !result && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preview — {preview.total} ESSL records ({preview.mapped} mapped to workers)</p>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Schema: {preview.schema}</span>
              {preview.total > preview.mapped && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{preview.total-preview.mapped} not mapped</span>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                  <tr>{['ESSL Code','Worker','Date','First Punch','Last Punch','Hours','Status','Wage'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-white/80 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(preview.preview||[]).map((r,i)=>(
                    <tr key={i} className={clsx('border-b border-slate-50',i%2===0?'bg-white':'bg-slate-50/30',!r.mapped&&'opacity-50')}>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.emp_code}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {r.worker_name}
                        {!r.mapped && <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1 rounded">NOT MAPPED</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{r.date}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.first_punch ? new Date(r.first_punch).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.last_punch && r.last_punch !== r.first_punch ? new Date(r.last_punch).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td className="px-3 py-2 text-center">{r.hours_worked}h</td>
                      <td className="px-3 py-2">
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold capitalize', STATUS_BADGE[r.status]||'bg-slate-100 text-slate-600')}>{r.status?.replace('_',' ')}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{r.mapped ? fmtWage(r.wage) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sync result */}
        {result && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-5">
            <p className="font-bold text-emerald-800 text-base mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5"/> Sync Complete!
            </p>
            <div className="grid grid-cols-4 gap-3">
              {[
                ['ESSL Records', result.essl_records_found, 'text-slate-800'],
                ['New Created',  result.created,            'text-emerald-700'],
                ['Updated',      result.updated,            'text-blue-700'],
                ['Skipped',      result.skipped,            'text-slate-500'],
              ].map(([l,v,c])=>(
                <div key={l} className="bg-white border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                  <p className={clsx('text-2xl font-bold', c)}>{v}</p>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 mb-1">{result.errors.length} errors:</p>
                {result.errors.slice(0,5).map((e,i)=>(
                  <p key={i} className="text-xs text-red-600">{e.emp_code} / {e.date}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Not configured notice */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
          <p className="font-bold mb-1">Prerequisites:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>ESSL server IP and MySQL credentials saved in <strong>SC → Settings → ESSL tab</strong></li>
            <li>Each worker must have an <strong>ESSL Employee Code</strong> set in Workers Registry</li>
            <li>ESSL server must be on the same LAN as this ERP server</li>
          </ul>
        </div>
      </div>

      <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Close</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SCLabour() {
  const [tab, setTab]           = useState('workers');
  const [search, setSearch]     = useState('');
  const [projectFilter, setProject] = useState('');
  const [scFilter, setScFilter] = useState('');
  const [attDate, setAttDate]   = useState(new Date().toISOString().slice(0,10));
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [showAttForm,   setShowAttForm]   = useState(false);
  const [showNMRForm,   setShowNMRForm]   = useState(false);
  const [nmrDrawer,     setNmrDrawer]     = useState(null);
  const [workerForm, setWorkerForm] = useState({ project_id:'',sc_id:'',wo_id:'',worker_name:'',skill_type:'Unskilled',daily_rate:0,mobile:'',essl_emp_code:'' });
  const [showEsslSync, setShowEsslSync] = useState(false);
  const [attForm,    setAttForm]    = useState({ project_id:'',sc_id:'',wo_id:'',worker_id:'',attendance_date:new Date().toISOString().slice(0,10),status:'present',hours_worked:8,overtime_hours:0,wage_amount:0,remarks:'' });
  const [nmrStatFilter, setNmrStat] = useState('');
  const qc = useQueryClient();

  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: subs=[] }     = useQuery({ queryKey:['sc-list-all'], queryFn:()=>scAPI.listSC().then(r=>r.data?.data||[]), staleTime:0 });
  const labourContractors      = subs.filter(s => s.contractor_type==='labour_contractor' && s.status==='active');
  const allActiveContractors   = subs.filter(s => s.status==='active');

  const { data: wos=[] } = useQuery({ queryKey:['sc-wo-all'], queryFn:()=>scAPI.listWO({status:'active'}).then(r=>r.data?.data||[]), staleTime:0 });

  const { data: workers=[], refetch:refetchWorkers } = useQuery({
    queryKey:['sc-workers', projectFilter, scFilter],
    queryFn:()=>scAPI.listWorkers({project_id:projectFilter||undefined, sc_id:scFilter||undefined}).then(r=>r.data?.data||[]),
    staleTime:0,
  });
  const { data: attendance=[], refetch:refetchAtt } = useQuery({
    queryKey:['sc-attendance', projectFilter, scFilter, attDate],
    queryFn:()=>scAPI.listAttendance({project_id:projectFilter||undefined, sc_id:scFilter||undefined, from_date:attDate, to_date:attDate}).then(r=>r.data?.data||[]),
    staleTime:0, enabled: tab==='attendance',
  });
  const { data: nmrs=[], refetch:refetchNMR } = useQuery({
    queryKey:['sc-nmr', projectFilter, scFilter, nmrStatFilter],
    queryFn:()=>scAPI.listNMR({project_id:projectFilter||undefined, sc_id:scFilter||undefined, status:nmrStatFilter||undefined}).then(r=>r.data?.data||[]),
    staleTime:0, enabled: tab==='nmr',
  });

  const addWorkerMut = useMutation({
    mutationFn: d=>scAPI.createWorker(d),
    onSuccess:()=>{ toast.success('Worker added'); qc.invalidateQueries({queryKey:['sc-workers']}); setShowWorkerForm(false); setWorkerForm({project_id:'',sc_id:'',wo_id:'',worker_name:'',skill_type:'Unskilled',daily_rate:0,mobile:''}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const markAttMut = useMutation({
    mutationFn: d=>scAPI.markAttendance(d),
    onSuccess:()=>{ toast.success('Attendance saved'); qc.invalidateQueries({queryKey:['sc-attendance']}); setShowAttForm(false); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  const bulkMut = useMutation({
    mutationFn: ()=>{
      const projWorkers = workers.filter(w=>!projectFilter||w.project_id===projectFilter);
      const entries = projWorkers.map(w=>({ project_id:w.project_id, sc_id:w.sc_id, wo_id:w.wo_id, worker_id:w.id, attendance_date:attDate, status:'present', hours_worked:8, wage_amount:parseFloat(w.daily_rate||0) }));
      return scAPI.bulkAttendance({entries});
    },
    onSuccess:()=>{ toast.success('Bulk attendance marked'); qc.invalidateQueries({queryKey:['sc-attendance']}); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });

  const filteredWorkers = workers.filter(w=>!search||[w.worker_name,w.worker_code,w.skill_type].some(v=>v?.toLowerCase().includes(search.toLowerCase())));

  // KPIs
  const kpi = useMemo(()=>({
    totalWorkers: workers.length,
    labourWorkers: workers.filter(w => {
      const sc = subs.find(s => s.id === w.sc_id);
      return sc?.contractor_type === 'labour_contractor';
    }).length,
    presentToday: attendance.filter(a => a.status === 'present').length,
    pendingNMR:   nmrs.filter(n => ['draft','submitted','checked'].includes(n.status)).length,
  }),[workers, attendance, nmrs, subs]);

  const TABS = [
    { k:'workers',    label:'Workers Registry',  icon: Users     },
    { k:'attendance', label:'Daily Attendance',   icon: CheckCircle },
    { k:'nmr',        label:'Muster Roll (NMR)',  icon: FileText  },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="Labour / Worker Management"
        subtitle="Worker registry, daily attendance and NMR-based billing"
        breadcrumbs={[{label:'Subcontractors'},{label:'Labour Management'}]}
        actions={
          <div className="flex gap-2">
            {tab==='workers' && (
              <button onClick={()=>setShowWorkerForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                style={{background:'#fff', color: Theme.navyDark}}>
                <Plus className="w-3.5 h-3.5"/> Register Worker
              </button>
            )}
            {tab==='attendance' && (
              <>
                <button onClick={()=>setShowEsslSync(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
                  <RefreshCw className="w-3.5 h-3.5"/> Sync from ESSL
                </button>
                <button onClick={()=>bulkMut.mutate()} disabled={bulkMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
                  style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
                  <CheckCircle className="w-3.5 h-3.5"/> Mark All Present
                </button>
                <button onClick={()=>setShowAttForm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                  style={{background:'#fff', color: Theme.navyDark}}>
                  <Plus className="w-3.5 h-3.5"/> Mark Attendance
                </button>
              </>
            )}
            {tab==='nmr' && (
              <button onClick={()=>setShowNMRForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
                style={{background:'#fff', color: Theme.navyDark}}>
                <Plus className="w-3.5 h-3.5"/> Create NMR
              </button>
            )}
          </div>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ThemeKpiCard icon={Users}       label="Total Workers"     value={kpi.totalWorkers}  color="blue"    sub="Registered workers"/>
          <ThemeKpiCard icon={HardHat}     label="Labour Workers"    value={kpi.labourWorkers} color="orange"  sub="Under LC contractors"/>
          <ThemeKpiCard icon={CheckCircle} label="Present Today"     value={kpi.presentToday}  color="emerald" sub={`Date: ${dayjs(attDate).format('DD MMM')}`}/>
          <ThemeKpiCard icon={FileText}    label="NMR Pending"       value={kpi.pendingNMR}    color="amber"   sub="Awaiting approval"/>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {TABS.map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => setTab(k)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap',
                tab === k ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
              style={tab === k ? { background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` } : {}}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {tab !== 'nmr' && (
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workers…"
                className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none shadow-sm" />
            </div>
          )}
          <select value={projectFilter} onChange={e=>setProject(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-40">
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={scFilter} onChange={e=>setScFilter(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-44">
            <option value="">All Contractors</option>
            {labourContractors.length > 0 && <optgroup label="── Labour Contractors ──">
              {labourContractors.map(s=><option key={s.id} value={s.id}>[LC] {s.name}</option>)}
            </optgroup>}
            {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').length > 0 && <optgroup label="── Sub-Contractors ──">
              {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').map(s=><option key={s.id} value={s.id}>[SC] {s.name}</option>)}
            </optgroup>}
          </select>
          {tab === 'attendance' && (
            <input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)}
              className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none" />
          )}
          {tab === 'nmr' && (
            <select value={nmrStatFilter} onChange={e=>setNmrStat(e.target.value)}
              className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
              <option value="">All Status</option>
              {Object.entries(NMR_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <button onClick={() => tab==='workers'?refetchWorkers():tab==='attendance'?refetchAtt():refetchNMR()}
            className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* ── Workers Tab ── */}
        {tab === 'workers' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['Code','Worker Name','Contractor','Skill Type','Daily Rate (₹)','Mobile','Status'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkers.length===0 ? (
                    <tr><td colSpan={7} className="py-12 text-center">
                      <Users className="w-10 h-10 text-slate-400 mx-auto mb-2"/>
                      <p className="text-slate-400">No workers registered</p>
                    </td></tr>
                  ) : filteredWorkers.map((w,i)=>(
                    <tr key={w.id} className={clsx('border-b border-slate-50 hover:bg-slate-50',i%2===0?'bg-white':'bg-slate-50/30')}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">{w.worker_code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{w.worker_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.sc_name||'—'}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{w.skill_type}</span></td>
                      <td className="px-4 py-3 font-semibold text-slate-700">₹{Number(w.daily_rate||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.mobile||'—'}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold', w.status==='active'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500')}>
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Attendance Tab ── */}
        {tab === 'attendance' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"
              style={{background:`linear-gradient(90deg, ${Theme.navy}22 0%, transparent 100%)`}}>
              <span className="text-sm font-bold text-slate-700">
                {dayjs(attDate).format('dddd, DD MMMM YYYY')}
              </span>
              <span className="text-xs text-slate-400 ml-1">{attendance.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                    {['Worker','Contractor','Skill','Status','Hours','Overtime','Wage (₹)','Remarks'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendance.length===0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                      No attendance records for this date.<br/>
                      <span className="text-xs">Click "Mark All Present" or "Mark Attendance" to add records.</span>
                    </td></tr>
                  ) : attendance.map((a,i)=>(
                    <tr key={a.id} className={clsx('border-b border-slate-50', i%2===0?'bg-white':'bg-slate-50/30')}>
                      <td className="px-4 py-3 font-semibold text-slate-800">{a.worker_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.sc_name||'—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.skill_type}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold capitalize', ATT_STATUS[a.status]||'bg-slate-100 text-slate-600')}>
                          {a.status?.replace('_',' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{a.hours_worked}h</td>
                      <td className="px-4 py-3 text-center">{a.overtime_hours > 0 ? `${a.overtime_hours}h` : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">₹{Number(a.wage_amount||0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{a.remarks||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NMR Tab ── */}
        {tab === 'nmr' && (
          <div>
            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5 text-xs text-blue-800">
              <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600"/>
              <div>
                <strong>Nominal Muster Roll (NMR):</strong> A formal legal document (under Contract Labour Act 1970) recording daily attendance and wages for Labour Contractors.
                Mark attendance first → Create NMR for a period → Get it checked &amp; approved → Raise Labour Bill automatically.
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {nmrs.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-slate-300"/>
                  </div>
                  <p className="text-slate-500 font-semibold">No Muster Rolls created yet</p>
                  <p className="text-xs text-slate-400 mt-1">First mark attendance, then create an NMR for the billing period</p>
                  <button onClick={()=>setShowNMRForm(true)}
                    className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl mx-auto"
                    style={{background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)`}}>
                    <Plus className="w-4 h-4"/> Create NMR
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                        {['NMR No.','Period','Contractor','Project','Workers','Man-days','Total Wages','Status','Actions'].map(h=>(
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nmrs.map((n,i)=>{
                        const sm = NMR_STATUS[n.status] || NMR_STATUS.draft;
                        return (
                          <tr key={n.id}
                            className={clsx('border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer', i%2===0?'bg-white':'bg-slate-50/30')}
                            onClick={()=>setNmrDrawer(n.id)}>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{n.nmr_number}</span>
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              <p className="font-semibold text-slate-700">{dayjs(n.period_from).format('DD MMM')} – {dayjs(n.period_to).format('DD MMM YYYY')}</p>
                              <p className="text-slate-400">{dayjs(n.period_to).diff(dayjs(n.period_from),'day')+1} days</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-800">{n.sc_name}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{n.project_name}</td>
                            <td className="px-4 py-3 text-center font-bold text-blue-700">{n.total_workers}</td>
                            <td className="px-4 py-3 text-center font-bold text-indigo-700">{n.total_mandays}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(n.total_wages)}</td>
                            <td className="px-4 py-3">
                              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>
                            </td>
                            <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>setNmrDrawer(n.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                                <Eye className="w-4 h-4"/>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {showWorkerForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-blue-600">
            <h2 className="font-bold text-white">Register Worker</h2>
            <button onClick={()=>setShowWorkerForm(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 md:p-8 grid grid-cols-2 gap-4 content-start">
            {[['worker_name','Worker Name *','text'],['skill_type','Skill Type','select'],['daily_rate','Daily Rate (₹)','number'],['mobile','Mobile','text'],['essl_emp_code','ESSL Employee Code','text']].map(([k,l,type])=>(
              <div key={k}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{l}</label>
                {type==='select'?(
                  <select value={workerForm[k]||''} onChange={e=>setWorkerForm(f=>({...f,[k]:e.target.value}))} className={inp}>
                    {SKILL_TYPES.map(s=><option key={s}>{s}</option>)}
                  </select>
                ):(
                  <input type={type} value={workerForm[k]||''} onChange={e=>setWorkerForm(f=>({...f,[k]:e.target.value}))} className={inp} />
                )}
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project</label>
              <select value={workerForm.project_id} onChange={e=>setWorkerForm(f=>({...f,project_id:e.target.value}))} className={inp}>
                <option value="">Select…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contractor</label>
              <select value={workerForm.sc_id} onChange={e=>setWorkerForm(f=>({...f,sc_id:e.target.value}))} className={inp}>
                <option value="">Select…</option>
                {labourContractors.length > 0 && <optgroup label="── Labour Contractors ──">
                  {labourContractors.map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
                {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').length > 0 && <optgroup label="── Sub-Contractors ──">
                  {allActiveContractors.filter(s=>s.contractor_type!=='labour_contractor').map(s=><option key={s.id} value={s.id}>{s.sc_code} — {s.name}</option>)}
                </optgroup>}
              </select>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50">
            <button onClick={()=>setShowWorkerForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
            <button onClick={()=>addWorkerMut.mutate(workerForm)} disabled={!workerForm.worker_name||addWorkerMut.isPending}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {addWorkerMut.isPending?'Adding…':'Add Worker'}
            </button>
          </div>
        </div>
      )}

      {showAttForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-emerald-600">
            <h2 className="font-bold text-white">Mark Attendance</h2>
            <button onClick={()=>setShowAttForm(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Worker *</label>
              <select value={attForm.worker_id} onChange={e=>setAttForm(f=>({...f,worker_id:e.target.value}))} className={inp}>
                <option value="">Select worker…</option>{workers.map(w=><option key={w.id} value={w.id}>{w.worker_name} — {w.skill_type}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                <input type="date" value={attForm.attendance_date} onChange={e=>setAttForm(f=>({...f,attendance_date:e.target.value}))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <select value={attForm.status} onChange={e=>setAttForm(f=>({...f,status:e.target.value}))} className={inp}>
                  <option value="present">Present</option><option value="absent">Absent</option>
                  <option value="half_day">Half Day</option><option value="holiday">Holiday</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Hours Worked</label>
                <input type="number" value={attForm.hours_worked} onChange={e=>setAttForm(f=>({...f,hours_worked:e.target.value}))} className={inp} min={0} max={24}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Overtime Hours</label>
                <input type="number" value={attForm.overtime_hours} onChange={e=>setAttForm(f=>({...f,overtime_hours:e.target.value}))} className={inp} min={0}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Wage Amount (₹)</label>
                <input type="number" value={attForm.wage_amount} onChange={e=>setAttForm(f=>({...f,wage_amount:e.target.value}))} className={inp} min={0}/>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
            <button onClick={()=>setShowAttForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
            <button onClick={()=>markAttMut.mutate(attForm)} disabled={!attForm.worker_id||markAttMut.isPending}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {markAttMut.isPending?'Saving…':'Save Attendance'}
            </button>
          </div>
        </div>
      )}

      {showNMRForm   && <CreateNMRModal wos={wos} onClose={() => setShowNMRForm(false)} />}
      {nmrDrawer     && <NMRDrawer nmrId={nmrDrawer} onClose={() => setNmrDrawer(null)} />}
      {showEsslSync  && <EsslSyncModal onClose={() => { setShowEsslSync(false); refetchAtt(); }} />}
    </div>
  );
}
