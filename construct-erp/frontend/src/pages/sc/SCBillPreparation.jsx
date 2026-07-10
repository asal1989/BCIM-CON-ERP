// src/pages/sc/SCBillPreparation.jsx — Subcontractor Bill Preparation
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { scAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, RefreshCw, Receipt, Eye, X, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, IndianRupee, FileText,
  ArrowRight, Building2, CalendarDays, Layers, Send,
  BarChart3, Info, HardHat, Printer, Pencil, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import RABillPrintTemplate from './SCBillPrintTemplate';
import { BOQ_COST_HEADS } from '../../constants/boqCostHeads';
import SCMeasurementBook from './mb/SCMeasurementBook';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmt2 = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const num  = (v) => parseFloat(v||0);

const STATUS_META = {
  draft:        { bg:'bg-slate-100',   text:'text-slate-600',   label:'Draft' },
  submitted:    { bg:'bg-blue-100',    text:'text-blue-700',    label:'Submitted' },
  under_review: { bg:'bg-amber-100',   text:'text-amber-700',   label:'Under Review' },
  approved:     { bg:'bg-emerald-100', text:'text-emerald-700', label:'Approved' },
  rejected:     { bg:'bg-red-100',     text:'text-red-700',     label:'Rejected' },
  paid:         { bg:'bg-teal-100',    text:'text-teal-700',    label:'Paid' },
};

const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition';
const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ─── Bill computation helper ──────────────────────────────────────────────────
function calcBill(items, f) {
  const gross = items.reduce((s,it) => s + num(it.curr_qty) * num(it.rate), 0);
  const gstAmt     = gross * num(f.gst_pct) / 100;
  // GST split: CGST+SGST (intra) or IGST (inter-state)
  const cgst       = f.is_igst ? 0 : Math.round(gstAmt / 2 * 100) / 100;
  const sgst       = f.is_igst ? 0 : gstAmt - cgst;
  const igst       = f.is_igst ? gstAmt : 0;
  const tdsAmt     = gross * num(f.tds_pct) / 100;
  const retAmt     = gross * num(f.retention_pct) / 100;
  const advRec     = num(f.advance_recovery);
  const matRec     = num(f.material_recovery);
  const pen        = num(f.penalty_amount);
  const oth        = num(f.other_deductions);
  const labourCess = gross * num(f.labour_cess_pct || 0) / 100;
  // Section E credits (increase payable)
  const retRelease = num(f.retention_release_amount || 0);
  const creditNote = num(f.credit_note_amount || 0);
  const net = gross + gstAmt + retRelease - creditNote - tdsAmt - retAmt - advRec - matRec - pen - labourCess - oth;
  return { gross, gstAmt, cgst, sgst, igst, tdsAmt, retAmt, advRec, matRec, pen, oth, labourCess, retRelease, creditNote, net };
}

function toQSPrintBill(b) {
  const items = (b.items || []).map((it, index) => {
    const currentQty = num(it.curr_qty ?? it.current_qty);
    const rate = num(it.rate);
    const woQty = num(it.wo_qty ?? it.wo_total_qty ?? it.qty);
    const prevQty = num(it.cum_prev_qty ?? it.prev_qty ?? it.prev_certified_qty);
    return {
      ...it,
      id: it.id || `${b.id || b.bill_number}-${index}`,
      sr_no: it.sequence_no || index + 1,
      description: it.description || it.wo_item_desc || 'Subcontractor work item',
      unit: it.unit || 'Nos',
      wo_qty: woQty,
      prev_certified_qty: prevQty,
      current_qty: currentQty,
      cum_qty: prevQty + currentQty,
      balance_qty: Math.max(0, woQty - (prevQty + currentQty)),
      rate,
      wo_amount: woQty * rate,
      prev_amount: prevQty * rate,
      curr_amount: num(it.amount || currentQty * rate),
      cum_amount: (prevQty + currentQty) * rate,
      balance_amount: Math.max(0, woQty - (prevQty + currentQty)) * rate,
      // legacy aliases kept for any other code
      boq_qty: woQty,
      qs_qty: currentQty,
      qs_amount: num(it.amount || currentQty * rate),
    };
  });

  const gross = num(b.gross_amount);
  const gst = num(b.gst_amount);
  const gstRate = num(b.gst_pct || b.wo_gst_pct || 18);
  const isIgst = b.is_igst || false;
  const materialRecovery = num(b.material_recovery);
  const penalty = num(b.penalty_amount);
  const otherDeductions = num(b.other_deductions);

  return {
    ...b,
    contract_number: b.wo_number,
    contractor_name: b.sc_name,
    invoice_number: b.invoice_number || b.bill_number,
    bill_period_from: b.period_from,
    bill_period_to: b.period_to,
    gst_rate: gstRate,
    is_igst: isIgst,
    gross_with_gst: gross + gst,
    total_contract_value: num(b.contract_amount),
    retention_percent: num(b.retention_pct || b.wo_ret_pct),
    retention_amount: num(b.retention_amount),
    mobilization_advance_recovery: num(b.advance_recovery),
    material_recovery_steel: materialRecovery,
    material_recovery_cement: 0,
    tds_amount: num(b.tds_amount),
    tds_rate: num(b.tds_pct || b.wo_tds_pct || 2),
    other_deductions: penalty + otherDeductions,
    total_deductions:
      num(b.tds_amount) +
      num(b.retention_amount) +
      num(b.advance_recovery) +
      materialRecovery +
      penalty +
      otherDeductions,
    items,
    mb_entries: b.mb_entries || [],
  };
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Select Work Order', 'Enter Quantities', 'Review & Submit'];
  return (
    <div className="flex items-center gap-0 border-b border-slate-100 bg-slate-50/60">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={i} className={clsx('flex-1 flex items-center gap-2.5 px-5 py-3.5 border-b-2 transition-colors',
            active ? 'border-indigo-600 bg-white' : done ? 'border-emerald-400 bg-emerald-50/30' : 'border-transparent')}>
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
              active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')}>
              {done ? '✓' : idx}
            </div>
            <span className={clsx('text-xs font-semibold hidden sm:block',
              active ? 'text-indigo-700' : done ? 'text-emerald-700' : 'text-slate-400')}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── NMR-Based Bill Raiser (Labour Contractors) ──────────────────────────────
function NMRBillModal({ wo, onClose }) {
  const qc = useQueryClient();
  const [selectedNmrId, setSelectedNmrId] = useState('');
  const fmt2 = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const { data: nmrs=[], isLoading } = useQuery({
    queryKey: ['sc-nmr-for-wo', wo.id],
    queryFn: () => scAPI.listNMR({ wo_id: wo.id, status: 'approved' }).then(r=>r.data?.data||[]),
    staleTime: 0,
  });

  const raiseMut = useMutation({
    mutationFn: () => scAPI.raiseBillNMR(selectedNmrId),
    onSuccess: (r) => {
      const bill = r.data.data.bill;
      toast.success(`Labour Bill ${bill.bill_number} created — ${fmt2(bill.gross_amount)}`);
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-dashboard'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to raise bill'),
  });

  const selected = nmrs.find(n => n.id === selectedNmrId);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base">Raise Labour Bill from NMR</h2>
          <p className="text-xs mt-0.5" style={{ color:'rgba(255,255,255,0.65)' }}>
            {wo.wo_number} · {wo.sc_name} — Select an approved Muster Roll
          </p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background:'rgba(255,255,255,0.10)', border:'1px solid rgba(255,255,255,0.20)' }}>
          <X className="w-4 h-4"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">
        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5"/>
          <span>
            <strong>Labour Contractor billing</strong> is based on the <strong>NMR (Nominal Muster Roll)</strong> — daily attendance × daily rate.
            Select an approved NMR below. The bill gross amount equals the total wages recorded in the NMR.
          </span>
        </div>

        {isLoading && <div className="text-center py-8 text-slate-400">Loading approved NMRs…</div>}

        {!isLoading && nmrs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3"/>
            <p className="font-semibold text-amber-800">No approved NMRs found for this Work Order</p>
            <p className="text-xs text-amber-700 mt-1">
              Go to <strong>Labour / Muster Roll tab</strong> → Create NMR for a billing period → Get it checked and approved → come back here to raise the bill.
            </p>
          </div>
        )}

        {nmrs.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select NMR to bill from</p>
            {nmrs.map(n => (
              <button key={n.id} type="button" onClick={() => setSelectedNmrId(n.id)}
                className={clsx('w-full text-left rounded-xl border-2 p-4 transition-all',
                  selectedNmrId === n.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-indigo-700 font-mono text-sm">{n.nmr_number}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Period: {dayjs(n.period_from).format('DD MMM')} – {dayjs(n.period_to).format('DD MMM YYYY')}
                      &nbsp;· {n.total_workers} workers · {n.total_mandays} man-days
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-emerald-700">{fmt2(n.total_wages)}</p>
                    <p className="text-[10px] text-slate-400">Total wages (= Gross Amount)</p>
                  </div>
                </div>
                {selectedNmrId === n.id && (
                  <div className="mt-3 pt-3 border-t border-indigo-200 grid grid-cols-3 gap-3">
                    {[['Skilled Wages', n.skilled_wages],['Unskilled Wages', n.unskilled_wages],['Total Wages', n.total_wages]].map(([l,v])=>(
                      <div key={l} className="bg-white border border-indigo-100 rounded-xl p-2.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                        <p className="text-sm font-bold text-indigo-800">{fmt2(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4">
            <p className="text-sm font-bold text-emerald-800">Bill Preview</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                ['Bill Type', 'RA Bill (Labour)'],
                ['Gross Amount', fmt2(selected.total_wages)],
                ['Period', `${dayjs(selected.period_from).format('DD MMM')} – ${dayjs(selected.period_to).format('DD MMM YYYY')}`],
                ['Description', `Labour charges as per ${selected.nmr_number}`],
              ].map(([l,v])=>(
                <div key={l} className="bg-white border border-emerald-100 rounded-xl p-2.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                  <p className="text-xs font-semibold text-slate-800">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-emerald-700 mt-2">
              After creation, bill will be in <strong>Draft</strong> status. Submit it for the 5-stage approval workflow.
            </p>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
        <button onClick={() => raiseMut.mutate()} disabled={!selectedNmrId || raiseMut.isPending}
          className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40"
          style={{ background:'linear-gradient(135deg,#059669 0%,#047857 100%)' }}>
          <Receipt className="w-4 h-4"/> {raiseMut.isPending ? 'Creating…' : 'Raise Labour Bill'}
        </button>
      </div>
    </div>
  );
}

// ─── Raise Bill Wizard ────────────────────────────────────────────────────────
function RaiseBillModal({ wos, onClose, initialWoId }) {
  const qc = useQueryClient();
  const [step, setStep]       = useState(1);
  const [woId, setWoId]       = useState(initialWoId || '');
  const [woDetail, setWoDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems]     = useState([]);
  const [showNMRModal, setShowNMRModal] = useState(false);   // for labour WOs
  const [showMB, setShowMB]   = useState(false);             // Open Measurement Book overlay
  // Count of approved MB entries not tied to a specific BOQ/WO item — these
  // can't be auto-attributed to one line's curr_qty, so they're excluded and
  // surfaced as a note instead of silently vanishing.
  const [unlinkedMbCount, setUnlinkedMbCount] = useState(0);
  const [form, setForm] = useState({
    bill_date: dayjs().format('YYYY-MM-DD'),
    bill_type: 'ra',
    period_from: '', period_to: '',
    description: '',
    gst_pct: 18, tds_pct: 2, retention_pct: 5,
    is_igst: false,
    labour_cess_pct: 0,
    advance_recovery: 0, material_recovery: 0,
    penalty_amount: 0, other_deductions: 0,
    retention_release_amount: 0, credit_note_amount: 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Detect if selected WO belongs to a Labour Contractor
  const isLabourWO = woDetail?.contractor_type === 'labour_contractor' ||
                     wos.find(w => w.id === woId)?.contractor_type === 'labour_contractor';

  const loadWO = async (id) => {
    if (!id) { setWoDetail(null); setItems([]); return; }
    setLoading(true);
    try {
      const r = await scAPI.getWO(id);
      const wo = r.data?.data;
      setWoDetail(wo);

      // Auto-load approved Measurement Book quantities — same idea as the client
      // RA bill's approved-measurements auto-fill: sum approved executed_qty per
      // wo_item_id, subtract what's already billed, and pre-fill curr_qty with
      // the claimable remainder instead of leaving it at 0 for manual entry.
      // Non-fatal: if the MB fetch fails, fall back to today's 0-quantity behavior.
      let mbMap = {};
      let unlinkedMbCount = 0;
      try {
        const mbRes = await scAPI.listMB({ wo_id: id, status: 'approved' });
        const mbEntries = mbRes.data?.data || [];
        for (const m of mbEntries) {
          if (!m.wo_item_id) { unlinkedMbCount++; continue; }
          mbMap[m.wo_item_id] = (mbMap[m.wo_item_id] || 0) + num(m.executed_qty);
        }
      } catch { /* MB fetch failing shouldn't block bill creation */ }
      setUnlinkedMbCount(unlinkedMbCount);

      setItems((wo.items || []).map(it => {
        const billed = num(it.billed_qty);
        const approved = mbMap[it.id] || 0;
        const claimable = Math.max(0, approved - billed);
        return {
          ...it,
          wo_item_id:  it.id,
          prev_qty:    billed,
          // Use server-computed live_balance so it's always accurate
          balance_qty: num(it.live_balance ?? Math.max(0, num(it.qty) - num(it.billed_qty))),
          billed_pct:  num(it.billed_pct || 0),
          curr_qty:    claimable,
          mb_approved_qty: approved,
        };
      }));
      set('gst_pct', wo.gst_pct || 18);
      set('tds_pct', wo.tds_pct || 2);
      set('retention_pct', wo.retention_pct || 5);
    } catch { toast.error('Failed to load work order details'); }
    finally { setLoading(false); }
  };

  // Deep-link support — e.g. opened from "Raise Bill for this WO" inside
  // SCMeasurementBook via /sc/bill-preparation?wo_id=...&open=1.
  useEffect(() => {
    if (initialWoId) loadWO(initialWoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWoId]);

  const calc = useMemo(() => calcBill(items, form), [items, form]);

  // Hard overbilling checks
  const overbilledItems = useMemo(() =>
    items.filter(it => num(it.curr_qty) > num(it.balance_qty) + 0.001), [items]);
  const hasOverbilled = overbilledItems.length > 0;

  // WO contract amount check
  const woContractAmt    = num(woDetail?.contract_amount || 0);
  const woAlreadyBilled  = num(woDetail?.total_billed || 0);
  const woRemainingValue = Math.max(0, woContractAmt - woAlreadyBilled);
  const exceedsContract  = woContractAmt > 0 && calc.gross > woRemainingValue + 0.5;

  const createMut = useMutation({
    mutationFn: () => scAPI.createBill({
      wo_id: woId, ...form,
      gross_amount: calc.gross,
      items: items.filter(it => num(it.curr_qty) > 0),
    }),
    onSuccess: () => {
      toast.success('Bill created successfully');
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-dashboard'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create bill'),
  });

  const activeWOs      = wos.filter(w => ['active', 'approved'].includes(w.status));
  const subConWOs      = activeWOs.filter(w => w.contractor_type !== 'labour_contractor');
  const labourWOs      = activeWOs.filter(w => w.contractor_type === 'labour_contractor');
  const canNext1  = !!woId && !!woDetail && !isLabourWO;
  const canNext2  = calc.gross > 0 && !hasOverbilled && !exceedsContract;

  // Labour Contractor WO selected → show NMR modal directly
  if (showNMRModal && woDetail) {
    return <NMRBillModal wo={{ ...woDetail, id: woId }} onClose={() => { setShowNMRModal(false); onClose(); }} />;
  }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-base">Raise Subcontractor Bill</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {woDetail ? `${woDetail.wo_number} — ${woDetail.sc_name}` : 'Select a work order to start billing'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <StepBar step={step} />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">

          {/* ── Step 1: Select Work Order ── */}
          {step === 1 && (
            <div className="space-y-5">
              <Field label="Work Order" required>
                <select value={woId} onChange={e => { setWoId(e.target.value); loadWO(e.target.value); }} className={inp}>
                  <option value="">— Choose an active / approved work order —</option>
                  {subConWOs.length > 0 && (
                    <optgroup label="── Sub-Contractors (BOQ-based billing) ──">
                      {subConWOs.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.wo_number} · {w.sc_name} · {w.project_name} · {fmt(w.contract_amount)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {labourWOs.length > 0 && (
                    <optgroup label="── Labour Contractors (NMR-based billing) ──">
                      {labourWOs.map(w => (
                        <option key={w.id} value={w.id}>
                          [LC] {w.wo_number} · {w.sc_name} · {w.project_name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {activeWOs.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> No active work orders. Create and approve a work order first.
                  </p>
                )}
              </Field>

              {/* Labour Contractor redirect notice */}
              {isLabourWO && woDetail && (
                <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 flex items-start gap-3">
                  <HardHat className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"/>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-800">Labour Contractor — NMR-Based Billing</p>
                    <p className="text-xs text-blue-700 mt-1">
                      This work order belongs to a <strong>Labour Contractor</strong>. Billing is based on the
                      <strong> Nominal Muster Roll (NMR)</strong> — daily attendance × daily rate.
                      You cannot use BOQ quantities for this contractor type.
                    </p>
                    <button onClick={() => setShowNMRModal(true)}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                      <Receipt className="w-4 h-4"/> Raise Labour Bill from NMR →
                    </button>
                  </div>
                </div>
              )}

              {loading && <div className="text-center py-8 text-slate-400 text-sm">Loading work order details…</div>}

              {woDetail && !loading && (
                <>
                  {/* WO summary card */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-2"
                      style={{ background: `linear-gradient(90deg, ${Theme.navy}dd 0%, ${Theme.navyDark}dd 100%)` }}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-white/80" />
                        <span className="text-xs font-bold text-white">{woDetail.wo_number} — {woDetail.subject}</span>
                      </div>
                      <button type="button" onClick={() => setShowMB(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white transition"
                        style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>
                        <Receipt className="w-3 h-3" /> Print Measurement Book
                      </button>
                    </div>
                    {unlinkedMbCount > 0 && (
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
                        {unlinkedMbCount} approved MB {unlinkedMbCount === 1 ? 'entry' : 'entries'} not linked to a specific BOQ item {unlinkedMbCount === 1 ? 'was' : 'were'} excluded from auto-load below.
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
                      {[
                        { l: 'Subcontractor',  v: woDetail.sc_name },
                        { l: 'Project',        v: woDetail.project_name },
                        { l: 'Contract Value', v: fmt(woDetail.contract_amount), bold: true },
                        { l: 'Already Billed', v: fmt(woDetail.total_billed), warn: true },
                        { l: 'GST Rate',       v: `${woDetail.gst_pct}%` },
                        { l: 'Retention',      v: `${woDetail.retention_pct}%` },
                        { l: 'TDS Rate',       v: `${woDetail.tds_pct}%` },
                        { l: 'Advance Paid',   v: fmt(woDetail.advance_paid) },
                        { l: 'Advance Balance (Unrecovered)', v: fmt(woDetail.advance_balance), warn: num(woDetail.advance_balance) > 0 },
                        { l: 'BOQ Items',      v: woDetail.items?.length || 0 },
                      ].map(({ l, v, bold, warn }) => (
                        <div key={l}>
                          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{l}</p>
                          <p className={clsx('text-sm font-bold mt-0.5', bold ? 'text-indigo-900' : warn ? 'text-orange-600' : 'text-slate-700')}>{v}</p>
                        </div>
                      ))}
                    </div>
                    {/* Balance progress */}
                    <div className="px-4 pb-4">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Billing Progress</span>
                        <span>{num(woDetail.contract_amount) > 0 ? Math.round((num(woDetail.total_billed)/num(woDetail.contract_amount))*100) : 0}% billed</span>
                      </div>
                      <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full"
                          style={{ width: `${num(woDetail.contract_amount) > 0 ? Math.min(100,(num(woDetail.total_billed)/num(woDetail.contract_amount))*100) : 0}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Bill type + dates */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Bill Type">
                      <select value={form.bill_type} onChange={e => set('bill_type', e.target.value)} className={inp}>
                        <option value="ra">RA Bill (Running Account)</option>
                        <option value="final">Final Bill</option>
                        <option value="advance">Advance Bill</option>
                        <option value="extra_item">Extra Item Bill</option>
                      </select>
                    </Field>
                    <Field label="Bill Date">
                      <input type="date" value={form.bill_date} onChange={e => set('bill_date', e.target.value)} className={inp} />
                    </Field>
                    <Field label="Period From">
                      <input type="date" value={form.period_from} onChange={e => set('period_from', e.target.value)} className={inp} />
                    </Field>
                    <Field label="Period To">
                      <input type="date" value={form.period_to} onChange={e => set('period_to', e.target.value)} className={inp} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Enter Quantities + Deductions ── */}
          {step === 2 && woDetail && (
            <div className="space-y-5">

              {/* ── Overbilling guard banner ── */}
              {hasOverbilled && (
                <div className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">Overbilling Detected — Cannot Proceed</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      The following items exceed their Work Order balance. Reduce the quantity to the balance or less:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {overbilledItems.map((it, i) => (
                        <li key={i} className="text-xs font-semibold text-red-700">
                          • {it.description}: entered {num(it.curr_qty).toFixed(3)} {it.unit} — max allowed {num(it.balance_qty).toFixed(3)} {it.unit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ── WO contract ceiling warning ── */}
              {exceedsContract && !hasOverbilled && (
                <div className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">Exceeds WO Contract Value</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      This bill's gross amount ({fmt(calc.gross)}) exceeds the remaining billable value
                      of {fmt(woRemainingValue)} (Contract: {fmt(woContractAmt)}, Already billed: {fmt(woAlreadyBilled)}).
                    </p>
                  </div>
                </div>
              )}

              {/* ── WO balance summary bar ── */}
              {woDetail && woContractAmt > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-indigo-700">WO Contract Utilisation</span>
                    <span className="text-xs font-bold text-indigo-800">
                      {fmt(woAlreadyBilled + calc.gross)} / {fmt(woContractAmt)}
                      &nbsp;({Math.min(100, Math.round(((woAlreadyBilled + calc.gross) / woContractAmt) * 100))}%)
                    </span>
                  </div>
                  <div className="h-3 bg-indigo-100 rounded-full overflow-hidden">
                    {/* Already billed segment */}
                    <div className="h-full flex">
                      <div className="h-full bg-indigo-400 transition-all"
                        style={{ width: `${Math.min(100,(woAlreadyBilled/woContractAmt)*100)}%` }} />
                      <div className={clsx('h-full transition-all', exceedsContract ? 'bg-red-500' : 'bg-emerald-400')}
                        style={{ width: `${Math.min(100 - Math.min(100,(woAlreadyBilled/woContractAmt)*100), (calc.gross/woContractAmt)*100)}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-indigo-500">
                    <span>Previously billed: {fmt(woAlreadyBilled)}</span>
                    <span className={exceedsContract ? 'text-red-600 font-bold' : 'text-emerald-600'}>
                      This bill: {fmt(calc.gross)}
                    </span>
                    <span>Remaining after: {fmt(Math.max(0, woRemainingValue - calc.gross))}</span>
                  </div>
                </div>
              )}

              {/* BOQ items table */}
              {items.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-700">
                      BOQ Items — Enter Current Bill Quantity
                      {hasOverbilled && <span className="ml-2 text-red-600 text-xs font-bold">({overbilledItems.length} item{overbilledItems.length>1?'s':''} exceed balance)</span>}
                    </h3>
                    <span className="text-xs text-slate-400">{items.filter(it => num(it.curr_qty) > 0).length} of {items.length} items filled</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                        <tr>
                          {['#','Description','Unit','WO Qty','Prev Billed','Balance Qty','Billing Progress','Current Bill Qty','Cost Head','Rate','Amount'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-white/80 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, i) => {
                          const amt      = num(it.curr_qty) * num(it.rate);
                          const balance  = num(it.balance_qty);
                          const overBill = num(it.curr_qty) > balance + 0.001;
                          const atLimit  = num(it.curr_qty) > 0 && num(it.curr_qty) >= balance - 0.001 && !overBill;
                          const billedSoFar = num(it.prev_qty);
                          const woQty    = num(it.qty);
                          const usedPct  = woQty > 0 ? Math.min(100, ((billedSoFar + num(it.curr_qty)) / woQty) * 100) : 0;
                          const prevPct  = woQty > 0 ? Math.min(100, (billedSoFar / woQty) * 100) : 0;

                          return (
                            <tr key={i} className={clsx('border-t border-slate-100',
                              overBill ? 'bg-red-50' : atLimit ? 'bg-amber-50' : i%2===0 ? 'bg-white' : 'bg-slate-50/30')}>
                              <td className="px-3 py-3 text-slate-400 font-semibold">{i+1}</td>
                              <td className="px-3 py-3 max-w-[180px]">
                                <p className="font-semibold text-slate-800 leading-tight">{it.description}</p>
                                {it.item_code && <p className="text-slate-400 text-[9px] mt-0.5 font-mono">{it.item_code}</p>}
                              </td>
                              <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{it.unit || '—'}</td>
                              <td className="px-3 py-3 text-right text-slate-600 font-medium">{woQty}</td>
                              <td className="px-3 py-3 text-right font-semibold text-orange-600">{billedSoFar}</td>
                              <td className="px-3 py-3 text-right">
                                <span className={clsx('font-bold text-sm',
                                  balance <= 0 ? 'text-red-500' : balance < woQty * 0.1 ? 'text-amber-600' : 'text-blue-600')}>
                                  {balance <= 0 ? '0 — FULLY BILLED' : balance}
                                </span>
                              </td>

                              {/* Progress bar column */}
                              <td className="px-3 py-3 min-w-[110px]">
                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden w-24">
                                  <div className="h-full flex">
                                    <div className="bg-orange-400 h-full transition-all" style={{ width:`${prevPct}%` }} />
                                    <div className={clsx('h-full transition-all', overBill ? 'bg-red-500' : 'bg-emerald-400')}
                                      style={{ width:`${Math.min(100 - prevPct, (num(it.curr_qty)/Math.max(woQty,0.001))*100)}%` }} />
                                  </div>
                                </div>
                                <p className={clsx('text-[9px] mt-0.5 font-semibold',
                                  overBill ? 'text-red-600' : usedPct >= 100 ? 'text-amber-600' : 'text-slate-400')}>
                                  {Math.round(usedPct)}% of WO
                                </p>
                              </td>

                              {/* Input — hard-clamped at balance */}
                              <td className="px-3 py-3">
                                {balance <= 0 ? (
                                  <div className="w-28 bg-slate-100 border border-slate-200 rounded px-2 py-1.5 text-center text-[10px] font-bold text-slate-400">
                                    Fully Billed
                                  </div>
                                ) : (
                                  <div>
                                    <input type="number" value={it.curr_qty} min={0}
                                      onChange={e => {
                                        // Allow typing but show error; do NOT hard-clamp so user sees the red state
                                        const v = Math.max(0, parseFloat(e.target.value || 0));
                                        setItems(prev => prev.map((bi, idx) => idx === i ? { ...bi, curr_qty: v } : bi));
                                      }}
                                      className={clsx('w-28 border rounded px-2 py-1.5 text-xs text-right font-bold outline-none focus:ring-2 transition',
                                        overBill
                                          ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-300'
                                          : atLimit
                                          ? 'border-amber-400 bg-amber-50 focus:ring-amber-300'
                                          : 'border-indigo-300 bg-white focus:ring-indigo-300')} />
                                    {overBill ? (
                                      <p className="text-[9px] text-red-600 font-bold mt-0.5">
                                        ❌ Max: {balance}
                                      </p>
                                    ) : atLimit ? (
                                      <p className="text-[9px] text-amber-600 font-bold mt-0.5">
                                        ⚠ At limit
                                      </p>
                                    ) : (
                                      <p className="text-[9px] text-slate-400 mt-0.5">
                                        Max: {balance}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <select value={it.cost_head || ''} onChange={e => {
                                    const v = e.target.value;
                                    setItems(prev => prev.map((bi, idx) => idx === i ? { ...bi, cost_head: v } : bi));
                                  }}
                                  className="border border-slate-200 rounded px-1.5 py-1 text-[10px] bg-white">
                                  <option value="">Unallocated</option>
                                  {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-3 text-right text-slate-600">{fmt(it.rate)}</td>
                              <td className={clsx('px-3 py-3 text-right font-bold text-sm',
                                overBill ? 'text-red-600' : amt > 0 ? 'text-indigo-700' : 'text-slate-300')}>
                                {fmt(amt)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Gross total row */}
                        <tr className="border-t-2 border-slate-300 bg-slate-50">
                          <td colSpan={10} className="px-3 py-2.5 text-right font-bold text-slate-700 text-xs uppercase tracking-wider">Gross Work Amount</td>
                          <td className={clsx('px-3 py-2.5 text-right font-bold text-sm', exceedsContract ? 'text-red-600' : 'text-indigo-700')}>{fmt(calc.gross)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {calc.gross === 0 && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Enter quantity for at least one item to compute the bill amount.
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  This work order has no BOQ items. Please add BOQ items to the work order before billing.
                </div>
              )}

              {/* Rates section */}
              <div className="space-y-4">
                {/* ── Section A: GST ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700">Section A — GST</h3>
                    {/* Inter-state (IGST) toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div
                        onClick={() => set('is_igst', !form.is_igst)}
                        className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                          form.is_igst ? 'bg-indigo-600' : 'bg-slate-300'
                        )}>
                        <span className={clsx(
                          'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                          form.is_igst ? 'translate-x-4' : 'translate-x-0.5'
                        )}/>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        {form.is_igst ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="GST %">
                      <div className="relative">
                        <input type="number" value={form.gst_pct} min={0} max={28}
                          onChange={e => set('gst_pct', parseFloat(e.target.value || 0))}
                          className={inp + ' pr-8'} />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-indigo-600">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {form.is_igst
                          ? `IGST = ${fmt2(calc.igst)}`
                          : `CGST ${fmt2(calc.cgst)} + SGST ${fmt2(calc.sgst)}`}
                      </p>
                    </Field>
                    {!form.is_igst && (
                      <>
                        <Field label="CGST Amount (auto)">
                          <div className="relative">
                            <input type="text" readOnly value={fmt2(calc.cgst)}
                              className={inp + ' bg-slate-50 cursor-not-allowed text-slate-500'} />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">= GST / 2</p>
                        </Field>
                        <Field label="SGST Amount (auto)">
                          <div className="relative">
                            <input type="text" readOnly value={fmt2(calc.sgst)}
                              className={inp + ' bg-slate-50 cursor-not-allowed text-slate-500'} />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">= GST / 2</p>
                        </Field>
                      </>
                    )}
                    {form.is_igst && (
                      <Field label="IGST Amount (auto)">
                        <div className="relative">
                          <input type="text" readOnly value={fmt2(calc.igst)}
                            className={inp + ' bg-slate-50 cursor-not-allowed text-slate-500'} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">= Full GST (inter-state)</p>
                      </Field>
                    )}
                  </div>
                </div>

                {/* ── Section B: Deductions ── */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Section B — TDS & Retention</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { k:'tds_pct',          l:'TDS %',          color:'text-red-600' },
                      { k:'retention_pct',    l:'Retention %',    color:'text-orange-600' },
                    ].map(({ k, l, color }) => (
                      <Field key={k} label={l}>
                        <div className="relative">
                          <input type="number" value={form[k]} min={0}
                            onChange={e => set(k, parseFloat(e.target.value || 0))}
                            className={inp + ' pr-8'} />
                          <span className={clsx('absolute right-3 top-2.5 text-xs font-bold', color)}>%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">= {fmt2(calc.gross * num(form[k]) / 100)}</p>
                      </Field>
                    ))}
                    <Field label="Labour Cess %">
                      <div className="relative">
                        <input type="number" value={form.labour_cess_pct} min={0} step={0.1}
                          onChange={e => set('labour_cess_pct', parseFloat(e.target.value || 0))}
                          className={inp + ' pr-8'} />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-amber-600">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        BOCW Act — {fmt2(calc.labourCess)}
                        {calc.gross > 5000000 && form.labour_cess_pct === 0 && (
                          <span className="text-amber-500 ml-1">(1% suggested for &gt;₹50L)</span>
                        )}
                      </p>
                    </Field>
                  </div>
                </div>

                {/* ── Section C: Other Deductions ── */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Section C — Other Deductions</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { k:'advance_recovery', l:'Advance Recovery ₹', color:'text-slate-600' },
                      { k:'material_recovery',l:'Material Recovery ₹', color:'text-slate-600' },
                      { k:'penalty_amount',   l:'Penalty ₹',           color:'text-red-600' },
                      { k:'other_deductions', l:'Other Deductions ₹',  color:'text-slate-600' },
                    ].map(({ k, l, color }) => {
                      // Advance Recovery is otherwise a blind manual entry — the WO's
                      // real outstanding advance (from the Advance Tracker) is shown
                      // here so the user can see, and match, what's actually owed.
                      const isAdvance = k === 'advance_recovery';
                      const advBalance = num(woDetail?.advance_balance);
                      const overRecovered = isAdvance && num(form[k]) > advBalance + 0.01;
                      return (
                        <Field key={k} label={l}>
                          <div className="relative">
                            <input type="number" value={form[k]} min={0}
                              onChange={e => set(k, parseFloat(e.target.value || 0))}
                              className={clsx(inp, 'pr-8', overRecovered && 'border-red-400 bg-red-50 text-red-700')} />
                            <span className={clsx('absolute right-3 top-2.5 text-xs font-bold', color)}>₹</span>
                          </div>
                          {isAdvance && advBalance > 0 ? (
                            <p className={clsx('text-[10px] mt-1', overRecovered ? 'text-red-600 font-semibold' : 'text-slate-400')}>
                              {overRecovered ? `Exceeds outstanding balance of ${fmt2(advBalance)}` : `Outstanding: ${fmt2(advBalance)}`}
                              {!overRecovered && (
                                <button type="button" onClick={() => set('advance_recovery', advBalance)}
                                  className="ml-1.5 text-indigo-600 font-semibold hover:underline">Recover full</button>
                              )}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 mt-1">= {fmt2(num(form[k]))}</p>
                          )}
                        </Field>
                      );
                    })}
                  </div>
                </div>

                {/* ── Section E: Credits ── */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">Section E — Credits &amp; Releases</h3>
                  <p className="text-[10px] text-slate-400 mb-3">Amounts here ADD to the net payable (retention being released, credit notes received)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="Retention Release ₹">
                      <div className="relative">
                        <input type="number" value={form.retention_release_amount} min={0}
                          onChange={e => set('retention_release_amount', parseFloat(e.target.value || 0))}
                          className={inp + ' pr-8'} />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-emerald-600">₹</span>
                      </div>
                      <p className="text-[10px] text-emerald-600 mt-1">
                        + {fmt2(calc.retRelease)} added to payable
                      </p>
                    </Field>
                    <Field label="Credit Note ₹">
                      <div className="relative">
                        <input type="number" value={form.credit_note_amount} min={0}
                          onChange={e => set('credit_note_amount', parseFloat(e.target.value || 0))}
                          className={inp + ' pr-8'} />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-red-500">₹</span>
                      </div>
                      <p className="text-[10px] text-red-500 mt-1">
                        − {fmt2(calc.creditNote)} deducted from payable
                      </p>
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Submit ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Bill abstract */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between"
                  style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                  <div>
                    <p className="text-xs font-bold text-white">{woDetail?.sc_name}</p>
                    <p className="text-[10px] text-white/60">{woDetail?.wo_number} · {woDetail?.project_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">Bill Type</p>
                    <p className="text-xs font-bold text-white capitalize">{form.bill_type.replace('_',' ')} Bill</p>
                  </div>
                </div>

                {/* Bill breakdown */}
                <div className="p-5 space-y-0">
                  {[
                    { label: 'Gross Work Amount',                    value: calc.gross,    highlight: false },
                    // GST rows: show split when intra-state, single row when inter-state
                    form.is_igst
                      ? { label: `+ IGST (${form.gst_pct}%)`,       value: calc.igst,     add: true }
                      : { label: `+ CGST (${form.gst_pct/2}%)`,      value: calc.cgst,     add: true },
                    !form.is_igst
                      && { label: `+ SGST (${form.gst_pct/2}%)`,    value: calc.sgst,     add: true },
                    { label: 'Sub-total (Gross + GST)',              value: calc.gross + calc.gstAmt, bold: true, border: true },
                    calc.retRelease > 0
                      && { label: '+ Retention Release',             value: calc.retRelease, add: true },
                    { label: `− TDS (${form.tds_pct}%)`,            value: calc.tdsAmt,   deduct: true },
                    { label: `− Retention (${form.retention_pct}%)`,value: calc.retAmt,   deduct: true },
                    calc.labourCess > 0
                      && { label: `− Labour Cess (${form.labour_cess_pct}%)`, value: calc.labourCess, deduct: true },
                    calc.advRec > 0 && { label: '− Advance Recovery', value: calc.advRec,  deduct: true },
                    calc.matRec > 0 && { label: '− Material Recovery', value: calc.matRec, deduct: true },
                    calc.pen > 0    && { label: '− Penalty',           value: calc.pen,    deduct: true },
                    calc.creditNote > 0
                      && { label: '− Credit Note',                    value: calc.creditNote, deduct: true },
                    calc.oth > 0    && { label: '− Other Deductions',  value: calc.oth,    deduct: true },
                  ].filter(Boolean).map(({ label, value, bold, border, deduct, add }) => (
                    <div key={label} className={clsx('flex justify-between items-center py-2',
                      border ? 'border-y border-slate-200 my-1 font-bold' : 'border-b border-slate-50')}>
                      <span className={clsx('text-sm', bold ? 'font-bold text-slate-800' : deduct ? 'text-red-600' : add ? 'text-indigo-600' : 'text-slate-600')}>{label}</span>
                      <span className={clsx('text-sm font-semibold tabular-nums', bold ? 'text-slate-900' : deduct ? 'text-red-600' : add ? 'text-indigo-600' : 'text-slate-700')}>
                        {fmt2(value)}
                      </span>
                    </div>
                  ))}
                  {/* Net payable */}
                  <div className="flex justify-between items-center py-3 mt-1 rounded-xl px-3"
                    style={{ background: `linear-gradient(135deg, ${Theme.navyLight}22 0%, ${Theme.navy}11 100%)`, border: `1px solid ${Theme.navy}33` }}>
                    <span className="text-base font-bold text-slate-900">NET PAYABLE</span>
                    <span className="text-xl font-bold" style={{ color: Theme.navy }}>{fmt2(calc.net)}</span>
                  </div>
                </div>

                {/* Items summary */}
                {items.filter(it => num(it.curr_qty) > 0).length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Items in this bill ({items.filter(it => num(it.curr_qty) > 0).length})
                    </p>
                    <div className="space-y-1">
                      {items.filter(it => num(it.curr_qty) > 0).map((it, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-600 truncate max-w-[60%]">{it.description}</span>
                          <span className="text-slate-700 font-semibold tabular-nums">
                            {num(it.curr_qty)} {it.unit} × {fmt(it.rate)} = {fmt(num(it.curr_qty)*num(it.rate))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <Field label="Bill Narration / Description">
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  rows={2} className={inp + ' resize-none'}
                  placeholder="Describe the work covered in this bill e.g. 'RA Bill No.1 for RCC work at Block A, Ground Floor'" />
              </Field>

              {/* Info note */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-blue-700">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">After creating:</span> This bill will be saved as a <strong>Draft</strong>.
                  Click <strong>Submit for Approval</strong> in the bill list to send it through the approval workflow.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t bg-slate-50/60">
          <button onClick={() => setStep(s => Math.max(1, s-1))} disabled={step === 1}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
            {step < 3 ? (
              <div className="flex flex-col items-end gap-1">
                {step === 2 && hasOverbilled && (
                  <p className="text-xs text-red-600 font-semibold">Fix overbilled items before proceeding</p>
                )}
                {step === 2 && exceedsContract && !hasOverbilled && (
                  <p className="text-xs text-red-600 font-semibold">Bill exceeds WO contract value</p>
                )}
                {step === 2 && calc.gross === 0 && !hasOverbilled && (
                  <p className="text-xs text-amber-600 font-semibold">Enter at least one quantity</p>
                )}
                <button onClick={() => setStep(s => s+1)}
                  disabled={step === 1 ? !canNext1 : !canNext2}
                  className={clsx('flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg transition',
                    (step === 2 && (hasOverbilled || exceedsContract)) ? 'opacity-40 cursor-not-allowed bg-red-500' : 'disabled:opacity-40')}
                  style={(step === 2 && (hasOverbilled || exceedsContract)) ? {} : { background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
                  Next Step <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => createMut.mutate()}
                disabled={createMut.isPending || calc.gross <= 0}
                className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-40 transition"
                style={{ background: `linear-gradient(135deg, #059669 0%, #047857 100%)` }}>
                <Receipt className="w-4 h-4" />
                {createMut.isPending ? 'Creating Bill…' : 'Create Bill'}
              </button>
            )}
          </div>
        </div>
    </div>
    {showMB && woId && (
      <SCMeasurementBook wo_id={woId} onClose={() => setShowMB(false)} onRaiseBill={() => setShowMB(false)} />
    )}
    </>
  );
}

// ─── Edit Bill Modal — correct GST/TDS/Retention/other deductions ─────────────
function EditBillModal({ bill, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEditQty = ['super_admin', 'qs_engineer'].includes(user?.role);

  const [f, setF] = useState({
    gst_pct: bill.gst_pct, tds_pct: bill.tds_pct, retention_pct: bill.retention_pct,
    is_igst: !!bill.is_igst, labour_cess_pct: bill.gross_amount > 0 ? +(100 * bill.labour_cess_amount / bill.gross_amount).toFixed(2) : 0,
    advance_recovery: bill.advance_recovery, material_recovery: bill.material_recovery,
    penalty_amount: bill.penalty_amount, other_deductions: bill.other_deductions,
    retention_release_amount: bill.retention_release_amount, credit_note_amount: bill.credit_note_amount,
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // Item qty state — only used when canEditQty
  const [itemQtys, setItemQtys] = useState(() =>
    (bill.items || []).map(it => ({ id: it.id, curr_qty: it.curr_qty, rate: it.rate, description: it.description, unit: it.unit }))
  );
  const setItemQty = (id, val) => setItemQtys(prev => prev.map(it => it.id === id ? { ...it, curr_qty: val } : it));

  const grossAmt = canEditQty && itemQtys.length > 0
    ? itemQtys.reduce((s, it) => s + num(it.curr_qty) * num(it.rate), 0)
    : num(bill.gross_amount);
  const gst = grossAmt * num(f.gst_pct) / 100;
  const tds = grossAmt * num(f.tds_pct) / 100;
  const ret = grossAmt * num(f.retention_pct) / 100;
  const labourCess = grossAmt * num(f.labour_cess_pct) / 100;
  const net = grossAmt + gst + num(f.retention_release_amount) - num(f.credit_note_amount)
    - tds - ret - num(f.advance_recovery) - num(f.material_recovery) - num(f.penalty_amount) - num(f.other_deductions) - labourCess;

  const saveMut = useMutation({
    mutationFn: () => scAPI.editBill(bill.id, {
      ...f,
      ...(canEditQty && itemQtys.length > 0 ? { items: itemQtys.map(it => ({ id: it.id, curr_qty: num(it.curr_qty) })) } : {}),
    }),
    onSuccess: () => {
      toast.success('Bill updated');
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-bill-detail', bill.id] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to update bill'),
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-sm">Edit Bill</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{bill.bill_number} · Gross {fmt(grossAmt)}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {canEditQty && itemQtys.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">BOQ Item Quantities</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Unit</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-600 w-20">Rate</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-24">This Bill Qty</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-600 w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemQtys.map((it, idx) => (
                      <tr key={it.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-3 py-2 text-slate-700">{it.description}</td>
                        <td className="px-2 py-2 text-center text-slate-500">{it.unit}</td>
                        <td className="px-2 py-2 text-right text-slate-600">{fmt(it.rate)}</td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min="0" step="any"
                            value={it.curr_qty}
                            onChange={e => setItemQty(it.id, e.target.value)}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-center text-sm font-medium outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-700">{fmt(num(it.curr_qty) * num(it.rate))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-indigo-50 border-t border-indigo-200">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-bold text-indigo-700 text-xs">Gross Work Amount</td>
                      <td className="px-2 py-2 text-right font-bold text-indigo-700">{fmt(grossAmt)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="GST %"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.gst_pct} onChange={e => set('gst_pct', e.target.value)} /></Field>
            <Field label="TDS %"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.tds_pct} onChange={e => set('tds_pct', e.target.value)} /></Field>
            <Field label="Retention %"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.retention_pct} onChange={e => set('retention_pct', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Advance Recovery ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.advance_recovery} onChange={e => set('advance_recovery', e.target.value)} /></Field>
            <Field label="Material Recovery ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.material_recovery} onChange={e => set('material_recovery', e.target.value)} /></Field>
            <Field label="Penalty ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.penalty_amount} onChange={e => set('penalty_amount', e.target.value)} /></Field>
            <Field label="Other Deductions ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.other_deductions} onChange={e => set('other_deductions', e.target.value)} /></Field>
            <Field label="Retention Release ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.retention_release_amount} onChange={e => set('retention_release_amount', e.target.value)} /></Field>
            <Field label="Credit Note ₹"><input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" value={f.credit_note_amount} onChange={e => set('credit_note_amount', e.target.value)} /></Field>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Recalculated Net Payable</span>
            <span className="text-base font-bold text-indigo-700">{fmt(net)}</span>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
            {saveMut.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bill Detail Drawer ───────────────────────────────────────────────────────
function BillDetailPage({ billId, onClose }) {
  const qc = useQueryClient();
  const printRef = useRef(null);
  const { data: raw, isLoading } = useQuery({
    queryKey: ['sc-bill-detail', billId],
    queryFn: () => scAPI.getBill(billId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!billId,
  });

  const submitMut = useMutation({
    mutationFn: () => scAPI.submitBill(billId, {}),
    onSuccess: () => {
      toast.success('Bill submitted for approval');
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['sc-bill-detail', billId] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const b        = raw || {};
  const sm       = STATUS_META[b.status] || STATUS_META.draft;
  const items    = b.items || [];
  const approvals = b.approvals || [];
  const payments  = b.payments || [];
  const printData = useMemo(() => toQSPrintBill(b), [b]);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SC_RA_Bill_${b?.bill_number || 'print'}`,
  });
  const [showEdit, setShowEdit] = useState(false);
  const canEdit   = !['approved', 'paid'].includes(b.status);
  const canDelete = ['draft', 'rejected'].includes(b.status);

  const deleteMut = useMutation({
    mutationFn: () => scAPI.deleteBill(billId),
    onSuccess: () => {
      toast.success('Bill deleted');
      qc.invalidateQueries({ queryKey: ['sc-bills'] });
      qc.invalidateQueries({ queryKey: ['hire-log'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to delete'),
  });

  const handleDelete = () => {
    if (!window.confirm(`Delete bill ${b.bill_number}? This cannot be undone.`)) return;
    deleteMut.mutate();
  };

  // Resolve rate percentages — backend aliases WO rates as wo_gst_pct etc.
  const gstPct = num(b.gst_pct || b.wo_gst_pct || 18);
  const tdsPct = num(b.tds_pct || b.wo_tds_pct || 2);
  const retPct = num(b.retention_pct || b.wo_ret_pct || 5);

  const infoCards = [
    { label: 'WO Number',     value: b.wo_number, Icon: FileText,     mono: true, tint: 'text-indigo-700', bg: 'bg-indigo-50', ic: 'text-indigo-500' },
    { label: 'Bill Date',     value: b.bill_date ? dayjs(b.bill_date).format('DD MMM YYYY') : '—', Icon: CalendarDays, tint: 'text-slate-800', bg: 'bg-sky-50', ic: 'text-sky-500' },
    { label: 'Bill Type',     value: (b.bill_type||'ra').toUpperCase(), Icon: Layers, tint: 'text-slate-800', bg: 'bg-violet-50', ic: 'text-violet-500' },
    { label: 'Subcontractor', value: b.sc_name, Icon: HardHat, tint: 'text-slate-800', bg: 'bg-amber-50', ic: 'text-amber-500' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 overflow-hidden">

      {/* ── Top action bar — white, clean ── */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0 z-10">
        <div className="flex items-center justify-between px-6 py-3">
          <button onClick={onClose}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-sm font-semibold transition group">
            <span className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center group-hover:border-slate-400 group-hover:bg-slate-50 transition">
              <X className="w-4 h-4" />
            </span>
            Back to Bills
          </button>
          <div className="flex items-center gap-2">
            {!isLoading && b?.id && canDelete && (
              <button onClick={handleDelete} disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition disabled:opacity-60">
                <Trash2 className="w-4 h-4" /> {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            )}
            {!isLoading && b?.id && canEdit && (
              <button onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition">
                <Pencil className="w-4 h-4" /> Edit Bill
              </button>
            )}
            {!isLoading && b?.id && (
              <button onClick={() => handlePrint()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition">
                <Printer className="w-4 h-4" /> Print RA Bill
              </button>
            )}
            {b.status === 'draft' && (
              <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-60">
                <Send className="w-4 h-4" /> {submitMut.isPending ? 'Submitting…' : 'Submit for Approval'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 max-w-7xl mx-auto space-y-4">
            <div className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(n => <div key={n} className="h-24 bg-white rounded-xl animate-pulse border border-slate-100" />)}
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 h-72 bg-white rounded-xl animate-pulse border border-slate-100" />
              <div className="h-72 bg-white rounded-xl animate-pulse border border-slate-100" />
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-7xl mx-auto space-y-6">

            {/* ── Document header banner ── */}
            <div className="rounded-2xl overflow-hidden shadow-lg"
              style={{ background: `linear-gradient(120deg, ${Theme.navy} 0%, ${Theme.navyDark || '#152c47'} 100%)` }}>
              <div className="px-7 py-6 flex items-start justify-between gap-6 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-white/50 text-[11px] font-bold uppercase tracking-[0.2em] mb-2">
                    <Receipt className="w-3.5 h-3.5" /> Subcontractor RA Bill
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-3xl font-black text-white font-mono tracking-tight">{b.bill_number || '…'}</h1>
                    {b.status && (
                      <span className={clsx('text-xs px-3 py-1 rounded-full font-bold', sm.bg, sm.text)}>{sm.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70 mt-2.5 font-medium flex-wrap">
                    <HardHat className="w-4 h-4 text-white/50" />
                    <span className="font-semibold text-white/90">{b.sc_name || '—'}</span>
                    <span className="text-white/30">•</span>
                    <Building2 className="w-4 h-4 text-white/50" />
                    <span>{b.project_name || '—'}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 rounded-xl px-6 py-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50 mb-1">Net Payable</p>
                  <p className="text-3xl font-black text-white font-mono tabular-nums">{fmt2(b.net_payable)}</p>
                </div>
              </div>
            </div>

            {/* ── Info cards row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {infoCards.map(({ label, value, mono, tint, bg, ic, Icon }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
                    <Icon className={clsx('w-5 h-5', ic)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className={clsx('text-[15px] font-bold truncate', mono && 'font-mono', tint)}>{value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── BOQ Items — full width so amounts never clip ── */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <p className="text-sm font-bold text-slate-700">BOQ Items</p>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-base text-slate-400 text-center py-10">No items</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-5 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Description</th>
                            <th className="text-center px-3 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Unit</th>
                            <th className="text-right px-3 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Rate</th>
                            <th className="text-right px-3 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Prev Qty</th>
                            <th className="text-right px-3 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">This Bill Qty</th>
                            <th className="text-right px-5 py-3 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                              <td className="px-5 py-3.5 min-w-[180px]">
                                <p className="font-semibold text-slate-800 leading-snug">{it.description || it.wo_item_desc}</p>
                              </td>
                              <td className="text-center px-3 py-3.5 text-slate-500 font-medium whitespace-nowrap">{it.unit || '—'}</td>
                              <td className="text-right px-3 py-3.5 font-mono font-semibold text-slate-600 whitespace-nowrap tabular-nums">{fmt2(it.rate)}</td>
                              <td className="text-right px-3 py-3.5 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                                {num(it.cum_prev_qty ?? it.prev_qty ?? 0).toFixed(3)}
                              </td>
                              <td className="text-right px-3 py-3.5 font-mono font-bold text-indigo-700 whitespace-nowrap tabular-nums">
                                {num(it.curr_qty ?? it.current_qty ?? 0).toFixed(3)}
                              </td>
                              <td className="text-right px-5 py-3.5 font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                                {fmt2(num(it.curr_qty ?? it.current_qty ?? 0) * num(it.rate))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200" style={{ background: `${Theme.navy}0d` }}>
                            <td colSpan={5} className="px-5 py-4 font-bold text-slate-700 whitespace-nowrap">Gross Work Amount</td>
                            <td className="text-right px-5 py-4 font-black font-mono text-lg whitespace-nowrap tabular-nums" style={{ color: Theme.navy }}>{fmt2(b.gross_amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* ── Left: approval trail + payments ── */}
              <div className="lg:col-span-2 space-y-6">
                {/* Approval trail */}
                {approvals.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">Approval Trail</p>
                    </div>
                    <div className="p-5">
                      {approvals.map((a, i) => (
                        <div key={i} className="flex gap-4 relative">
                          {i < approvals.length - 1 && (
                            <div className="absolute left-4 top-9 bottom-0 w-px bg-slate-200" />
                          )}
                          <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold z-10 ring-4 ring-white',
                            a.action==='approved' ? 'bg-emerald-500' : a.action==='rejected' ? 'bg-red-500' : 'bg-amber-500')}>
                            {i + 1}
                          </div>
                          <div className={clsx('flex-1 pb-5', i < approvals.length - 1 && 'border-b border-slate-100 mb-1')}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <span className="font-bold text-slate-800 capitalize">{a.action}</span>
                                <span className="text-slate-500 text-sm ml-2">by {a.actor_name || 'System'}</span>
                                {a.stage && <span className="text-slate-400 text-sm ml-1 capitalize">({(a.stage||'').replace(/_/g,' ')})</span>}
                              </div>
                              <span className="text-sm text-slate-400 whitespace-nowrap">{dayjs(a.created_at).format('DD MMM YYYY · HH:mm')}</span>
                            </div>
                            {a.comments && (
                              <p className="text-sm text-slate-500 mt-2 italic bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">"{a.comments}"</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payments */}
                {payments.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">Payment History</p>
                    </div>
                    <div className="p-5 space-y-2">
                      {payments.map((p, i) => (
                        <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-emerald-800">{fmt2(p.amount)}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">{dayjs(p.payment_date).format('DD MMM YYYY')} · {p.payment_mode?.replace('_',' ')}</p>
                            {p.reference_no && <p className="text-xs text-slate-500 mt-0.5">Ref: {p.reference_no}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right: Bill Abstract ── */}
              <div>
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden sticky top-4">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <p className="text-sm font-bold text-slate-700">Bill Abstract</p>
                  </div>
                  <div className="px-5 py-4 space-y-1">
                    {[
                      { l: 'Gross Work Amount', v: b.gross_amount, bold: true, c: 'text-slate-900' },
                      num(b.cgst_amount) > 0
                        ? { l: `CGST (${(gstPct/2).toFixed(1)}%)`, v: b.cgst_amount, c: 'text-indigo-600' }
                        : null,
                      num(b.sgst_amount) > 0
                        ? { l: `SGST (${(gstPct/2).toFixed(1)}%)`, v: b.sgst_amount, c: 'text-indigo-600' }
                        : null,
                      num(b.igst_amount) > 0
                        ? { l: `IGST (${gstPct}%)`, v: b.igst_amount, c: 'text-indigo-600' }
                        : null,
                      (!num(b.cgst_amount) && !num(b.igst_amount))
                        && { l: `GST (${gstPct}%)`, v: b.gst_amount, c: 'text-indigo-600' },
                      num(b.retention_release_amount) > 0
                        && { l: 'Retention Release', v: b.retention_release_amount, c: 'text-emerald-600' },
                      { l: `TDS (${tdsPct}%)`,       v: -b.tds_amount,       c: 'text-red-500' },
                      { l: `Retention (${retPct}%)`, v: -b.retention_amount, c: 'text-orange-500' },
                      num(b.labour_cess_amount) > 0 && { l: 'Labour Cess', v: -b.labour_cess_amount, c: 'text-amber-600' },
                      num(b.advance_recovery)   > 0 && { l: 'Advance Recovery', v: -b.advance_recovery, c: 'text-red-500' },
                      num(b.material_recovery)  > 0 && { l: 'Material Recovery', v: -b.material_recovery, c: 'text-red-500' },
                      num(b.penalty_amount)     > 0 && { l: 'Penalty', v: -b.penalty_amount, c: 'text-red-500' },
                      num(b.other_deductions)   > 0 && { l: 'Other Deductions', v: -b.other_deductions, c: 'text-red-500' },
                    ].filter(Boolean).map(({ l, v, c, bold }, idx) => (
                      <div key={l} className={clsx('flex justify-between items-center py-2.5', idx > 0 && 'border-t border-slate-50')}>
                        <span className={clsx('text-sm', bold ? 'font-bold text-slate-800' : 'text-slate-500')}>{l}</span>
                        <span className={clsx('font-bold tabular-nums font-mono whitespace-nowrap', c, bold ? 'text-base' : 'text-sm')}>
                          {num(v) < 0 ? `(${fmt2(Math.abs(num(v)))})` : fmt2(Math.abs(num(v)))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center px-5 py-5 text-white"
                    style={{ background: `linear-gradient(120deg, ${Theme.navy} 0%, ${Theme.navyDark || '#152c47'} 100%)` }}>
                    <span className="font-bold text-sm uppercase tracking-wider text-white/80">Net Payable</span>
                    <span className="text-2xl font-black font-mono tabular-nums">{fmt2(b.net_payable)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden print template */}
      {!isLoading && b?.id && (
        <div className="hidden print:block">
          <RABillPrintTemplate ref={printRef} data={printData} variations={[]} />
        </div>
      )}

      {showEdit && b?.id && (
        <EditBillModal bill={b} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SCBillPreparation() {
  const qc = useQueryClient();
  const [search,        setSearch]      = useState('');
  const { selectedProjectId } = useAuthStore();
  const [projectFilter, setProject]     = useState(selectedProjectId || '');
  const [statusFilter,  setStatus]      = useState('');
  useEffect(() => { setProject(selectedProjectId || ''); }, [selectedProjectId]);
  const [showForm,      setShowForm]    = useState(false);
  const [drawerBillId,  setDrawerBill]  = useState(null);

  // Deep-link support — e.g. "Raise Bill for this WO" from SCMeasurementBook
  // navigates to /sc/bill-preparation?wo_id=...&open=1.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkWoId = searchParams.get('wo_id') || '';
  useEffect(() => {
    if (deepLinkWoId && searchParams.get('open') === '1') {
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projects = [] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  // Scoped to the selected project — previously fetched with no project_id at
  // all, so the Raise Bill wizard's WO picker showed every project's work
  // orders mixed together (e.g. LANCO Hills WOs alongside every other project).
  const { data: wos = [] }      = useQuery({
    queryKey:['sc-wo-all', projectFilter],
    queryFn:()=>scAPI.listWO({ project_id: projectFilter || undefined }).then(r=>r.data?.data||[]),
    staleTime:0,
  });
  const { data: bills = [], isLoading, refetch } = useQuery({
    queryKey: ['sc-bills', projectFilter, statusFilter],
    queryFn:  () => scAPI.listBills({ project_id:projectFilter||undefined, status:statusFilter||undefined }).then(r=>r.data?.data||[]),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  const submitMut = useMutation({
    mutationFn: id => scAPI.submitBill(id, {}),
    onSuccess: () => { toast.success('Submitted for approval'); qc.invalidateQueries({ queryKey:['sc-bills'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const filtered = useMemo(() => {
    if (!search) return bills;
    const q = search.toLowerCase();
    return bills.filter(b => [b.bill_number,b.sc_name,b.wo_number,b.project_name].some(v=>v?.toLowerCase().includes(q)));
  }, [bills, search]);

  // KPI counts
  const kpi = useMemo(() => ({
    total:    bills.length,
    draft:    bills.filter(b=>b.status==='draft').length,
    pending:  bills.filter(b=>['submitted','under_review'].includes(b.status)).length,
    approved: bills.filter(b=>b.status==='approved').length,
    totalNet: bills.reduce((s,b)=>s+num(b.net_payable),0),
  }), [bills]);

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>

      <PageHeader
        title="Bill Preparation"
        subtitle="Raise, manage and submit subcontractor bills for approval"
        breadcrumbs={[{ label:'Subcontractors' }, { label:'Bill Preparation' }]}
        actions={
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
            style={{ background:'#fff', color: Theme.navyDark }}>
            <Plus className="w-3.5 h-3.5" /> Raise Bill
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* Workflow hint */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Billing Workflow</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: Layers,      label:'1. Create WO',       desc:'Approve a work order',   color:'bg-blue-100 text-blue-700' },
              { icon: Receipt,     label:'2. Raise Bill',      desc:'Enter BOQ quantities',   color:'bg-indigo-100 text-indigo-700' },
              { icon: Send,        label:'3. Submit',          desc:'Send for approval',       color:'bg-amber-100 text-amber-700' },
              { icon: CheckCircle2,label:'4. Approve',         desc:'Stage-wise approval',     color:'bg-emerald-100 text-emerald-700' },
              { icon: IndianRupee, label:'5. Payment',         desc:'Record payment',          color:'bg-teal-100 text-teal-700' },
            ].map(({ icon: Icon, label, desc, color }, i, arr) => (
              <React.Fragment key={label}>
                <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold', color)}>
                  <Icon className="w-3.5 h-3.5" /> <div><div>{label}</div><div className="font-normal opacity-70">{desc}</div></div>
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ThemeKpiCard icon={FileText}     label="Total Bills"     value={kpi.total}    color="blue"    sub="All bills" />
          <ThemeKpiCard icon={FileText}     label="Drafts"          value={kpi.draft}    color="slate"   sub="Not submitted" />
          <ThemeKpiCard icon={Clock}        label="Pending Approval"value={kpi.pending}  color="amber"   sub="Under review" />
          <ThemeKpiCard icon={CheckCircle2} label="Approved"        value={kpi.approved} color="emerald" sub="Ready to pay" />
          <ThemeKpiCard icon={IndianRupee}  label="Total Net Value" value={fmt(kpi.totalNet)} color="orange" sub="All bills" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bill no., subcontractor, WO…"
              className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-300 shadow-sm" />
          </div>
          <select value={projectFilter} onChange={e => setProject(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-40">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatus(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Bills table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-5 space-y-2">{[1,2,3,4,5].map(n=><div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-semibold">No bills found</p>
              <p className="text-xs text-slate-400 mt-1">{search||projectFilter||statusFilter ? 'Try adjusting filters' : 'Raise your first subcontractor bill'}</p>
              {!search && !projectFilter && !statusFilter && (
                <button onClick={()=>setShowForm(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl mx-auto"
                  style={{ background:`linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
                  <Plus className="w-4 h-4" /> Raise First Bill
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                    {['Bill No.','Date','WO Number','Subcontractor','Project','Gross Amt','Net Payable','Status','Actions'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const sm = STATUS_META[b.status] || STATUS_META.draft;
                    return (
                      <tr key={b.id}
                        className={clsx('border-b border-slate-50 hover:bg-indigo-50/30 transition-colors cursor-pointer', i%2===0?'bg-white':'bg-slate-50/30')}
                        onClick={() => setDrawerBill(b.id)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{b.bill_number}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {b.bill_date ? dayjs(b.bill_date).format('DD MMM YY') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-slate-600">{b.wo_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-800">{b.sc_name}</p>
                          <p className="text-[10px] text-slate-400">{b.sc_code}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[130px] truncate">{b.project_name}</td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs font-semibold text-slate-800">{fmt(b.gross_amount)}</p>
                          <p className="text-[10px] text-slate-400">GST: {fmt(b.gst_amount)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-bold" style={{ color: Theme.navy }}>{fmt(b.net_payable)}</p>
                          <p className="text-[10px] text-red-500">TDS: -{fmt(b.tds_amount)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-block text-[10px] px-2 py-0.5 rounded-full font-bold', sm.bg, sm.text)}>
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setDrawerBill(b.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="View">
                              <Eye className="w-4 h-4" />
                            </button>
                            {b.status === 'draft' && (
                              <button onClick={() => submitMut.mutate(b.id)}
                                disabled={submitMut.isPending}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                                <Send className="w-3 h-3" /> Submit
                              </button>
                            )}
                          </div>
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

      {showForm    && <RaiseBillModal wos={wos} onClose={() => setShowForm(false)} initialWoId={deepLinkWoId} />}
      {drawerBillId && <BillDetailPage billId={drawerBillId} onClose={() => setDrawerBill(null)} />}
    </div>
  );
}
