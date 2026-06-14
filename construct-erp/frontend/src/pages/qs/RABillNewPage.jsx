// src/pages/qs/RABillNewPage.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Plus, AlertTriangle, FileText, Wallet,
  Building2, CalendarRange, Percent, TrendingUp, Layers, Receipt, Send
} from 'lucide-react';
import { clsx } from 'clsx';
// FIX: Added missing measurementAPI, vendorAPI, and materialReconAPI imports
import { raBillAPI, projectAPI, boqAPI, measurementAPI, vendorAPI, variationAPI, normsAPI, materialReconAPI, priceEscalationAPI } from '../../api/client';
import SearchableSelect from '../../components/shared/SearchableSelect';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compactInr = v => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
};

export default function RABillNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [formData, setFormData] = useState({
    project_id: '',
    bill_number: '',
    bill_date: dayjs().format('YYYY-MM-DD'),
    contractor_name: '',
    contractor_gstin: '',
    contractor_pan: '',
    work_description: '',
    bill_period_from: dayjs().startOf('month').format('YYYY-MM-DD'),
    bill_period_to: dayjs().format('YYYY-MM-DD'),
    retention_percent: 5,
    mobilization_advance_recovery: 0,
    adhoc_advance_recovery: 0,
    material_recovery_steel: 0,
    material_recovery_cement: 0,
    price_escalation: 0,
    remarks: '',
    gst_rate: 18,
    tds_rate: 2,
    other_deductions: 0,
  });

  const [items, setItems] = useState([]);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: boqItems } = useQuery({
    queryKey: ['boq-summary', formData.project_id],
    queryFn: () => boqAPI.summary(formData.project_id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id,
  });

  const { data: activeProjectDetail } = useQuery({
    queryKey: ['project-detail', formData.project_id],
    queryFn: () => projectAPI.get(formData.project_id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id,
  });

  // FIX: measurementAPI was used but never imported — added to import above
  const { data: approvedMeasurements } = useQuery({
    queryKey: ['approved-measurements-hyper-sync', formData.project_id],
    queryFn: () =>
      measurementAPI.list().then(r => {
        const all = r.data?.data || [];
        const pid = String(formData.project_id);
        return all.filter(m => {
          const mPid = String(m.project_id || m.projectId || m.project?.id || '');
          const isApproved = ['pm_approved', 'qs_approved', 'approved', 'Approved'].includes(m.status);
          return mPid === pid && isApproved;
        });
      }),
    enabled: !!formData.project_id,
  });

  const { data: previousStats } = useQuery({
    queryKey: ['project-billing-stats', formData.project_id],
    queryFn: () =>
      raBillAPI.list({ project_id: formData.project_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id,
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: approvedVOs } = useQuery({
    queryKey: ['approved-variations', formData.project_id],
    queryFn: () => variationAPI.list({ project_id: formData.project_id, status: 'approved' }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id,
  });

  const { data: norms } = useQuery({
    queryKey: ['norms-all'],
    queryFn: () => normsAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: voDetails } = useQuery({
    queryKey: ['vo-details-bulk', approvedVOs],
    queryFn: async () => {
      if (!approvedVOs) return [];
      const results = await Promise.all(approvedVOs.map(vo => variationAPI.get(vo.id)));
      return results.flatMap(r => r.data.data.items || []);
    },
    enabled: !!approvedVOs?.length,
  });

  useEffect(() => {
    if (boqItems && Array.isArray(boqItems)) {
      const measurementMap = {};
      if (Array.isArray(approvedMeasurements)) {
        approvedMeasurements.forEach(m => {
          const bid = String(m.boq_item_id);
          if (!measurementMap[bid]) measurementMap[bid] = 0;
          measurementMap[bid] += parseFloat(m.net_quantity || 0);
        });
      }

      const standardItems = boqItems.map(it => {
        const bid = String(it.id);
        const prevBilled = parseFloat(it.certified_qty || 0);
        const totalApproved = measurementMap[bid] || 0;
        const claimable = Math.max(0, totalApproved - prevBilled);
        return {
          boq_item_id: it.id,
          description: it.description,
          unit: it.unit,
          rate: it.rate,
          boq_qty: it.quantity,
          prev_certified_qty: prevBilled,
          current_qty: claimable,
          amount: claimable * it.rate,
          is_variation: false,
        };
      });

      const variationItems = (voDetails || []).map(it => {
        // VO items are billed at 100% since they are approved extra works
        return {
          boq_item_id: it.boq_item_id, // can be null
          variation_item_id: it.id,
          description: `[VO] ${it.new_item_description || 'Variation Item'}`,
          unit: it.unit,
          rate: it.rate,
          boq_qty: it.quantity,
          prev_certified_qty: 0, // Simplified; real track needs variation_items billing history
          current_qty: it.quantity,
          amount: it.quantity * it.rate,
          is_variation: true,
        };
      });

      setItems([...standardItems, ...variationItems]);

      const count = (previousStats || []).length + 1;
      setFormData(prev => {
        const next = {
          ...prev,
          bill_number: prev.bill_number || `RA/${dayjs().format('YY')}/${String(count).padStart(2, '0')}`,
        };

        // Auto-configure from Project
        if (activeProjectDetail) {
          next.retention_percent = activeProjectDetail.retention_percent || 5;

          // Auto-calculate Advance Recovery
          const gross = (standardItems.reduce((acc, it) => acc + (it.amount || 0), 0) +
                         variationItems.reduce((acc, it) => acc + (it.amount || 0), 0));
          const unrecovered = parseFloat(activeProjectDetail.mobilization_advance_total || 0) -
                              parseFloat(activeProjectDetail.mobilization_advance_recovered || 0);

          if (unrecovered > 0) {
            const recoveryGoal = gross * (parseFloat(activeProjectDetail.recovery_percentage || 10) / 100);
            next.mobilization_advance_recovery = Math.min(recoveryGoal, unrecovered);
          }
        }
        return next;
      });
    }
  }, [boqItems, approvedMeasurements, previousStats, voDetails, activeProjectDetail]);

  const handleQtyChange = (idx, qty) => {
    const newItems = [...items];
    const it = newItems[idx];
    it.current_qty = parseFloat(qty || 0);
    it.amount = it.current_qty * it.rate;
    setItems(newItems);
  };

  const set = (key, val) => setFormData(p => ({ ...p, [key]: val }));

  // FIX: variable was named `totals` (singular misread as plural) — renamed to `grossTotal` for clarity
  const grossTotal = items.reduce((acc, it) => acc + (it.amount || 0), 0);
  const priceEscalation = parseFloat(formData.price_escalation || 0);
  // GST and retention are both charged on gross + price escalation (escalation is part of the certified value)
  const gstAmount = (grossTotal + priceEscalation) * (formData.gst_rate / 100);
  const retentionAmount = (grossTotal + priceEscalation) * (formData.retention_percent / 100);
  const tdsAmount = grossTotal * (formData.tds_rate / 100);
  const totalDeductions =
    retentionAmount +
    parseFloat(formData.mobilization_advance_recovery || 0) +
    parseFloat(formData.adhoc_advance_recovery || 0) +
    parseFloat(formData.material_recovery_steel || 0) +
    parseFloat(formData.material_recovery_cement || 0) +
    parseFloat(formData.other_deductions || 0) +
    tdsAmount;
  const netPayable = grossTotal + gstAmount - totalDeductions + priceEscalation;

  const activeItemCount = items.filter(it => it.current_qty > 0).length;
  const selectedProject = projects?.find(p => p.id === formData.project_id);

  const { data: auditSummary } = useQuery({
    queryKey: ['audit-summary-impact', formData.project_id],
    queryFn: () => materialReconAPI.audit(formData.project_id).then(r => r.data.summary),
    enabled: !!formData.project_id,
  });

  // Price Escalation Tracker — net escalation for this project & RA No.
  const { data: priceEscStats } = useQuery({
    queryKey: ['price-escalation-stats-for-bill', formData.project_id, formData.bill_number],
    queryFn: () => priceEscalationAPI.stats({ project_id: formData.project_id, ra_no: formData.bill_number })
      .then(r => r.data?.data ?? {}).catch(() => ({})),
    enabled: !!formData.project_id && !!formData.bill_number,
  });

  // Auto-fill Price Escalation from tracker when it's still at its default (0)
  useEffect(() => {
    if (priceEscStats && formData.price_escalation === 0) {
      const net = parseFloat(priceEscStats.net_escalation || 0);
      if (net !== 0) set('price_escalation', net);
    }
  }, [priceEscStats]);

  const handleSyncEscalation = () => {
    const net = parseFloat(priceEscStats?.net_escalation || 0);
    if (net !== 0) {
      set('price_escalation', net);
      toast.success(`Synced from Price Escalation Tracker: ${inr(net)}`);
    } else {
      toast(`No escalation records found for RA No. "${formData.bill_number}" in the Price Escalation Tracker.`, { icon: 'ℹ️', duration: 5000 });
    }
  };

  const handleSyncRecovery = () => {
    if (auditSummary?.net_recovery_due > 0) {
      set('material_recovery_steel', auditSummary.net_recovery_due);
      toast.success(`Synced recovery to Steel field: ${inr(auditSummary.net_recovery_due)}`);
    } else if (auditSummary?.reason) {
      toast(auditSummary.reason, { icon: 'ℹ️', duration: 5000 });
    } else {
      toast('Audit engine found no excess material usage for this project.', { icon: 'ℹ️', duration: 4000 });
    }
  };

  // --- Theoretical Audit Calculation ---
  const billTheoretics = items.reduce((acc, it) => {
    if (it.current_qty <= 0) return acc;
    const itemNorms = (norms || []).filter(n => n.boq_item_id === it.boq_item_id);
    itemNorms.forEach(norm => {
      const key = `${norm.material_name}-${norm.unit}`;
      if (!acc[key]) acc[key] = { material: norm.material_name, qty: 0, unit: norm.unit };
      acc[key].qty += it.current_qty * parseFloat(norm.norm_quantity);
    });
    return acc;
  }, {});
  const theoreticList = Object.values(billTheoretics);

  const createMut = useMutation({
    mutationFn: d => raBillAPI.create(d),
    onSuccess: () => {
      toast.success('RA Bill created successfully');
      qc.invalidateQueries({ queryKey: ['ra-bills'] });
      navigate('/qs/ra-bills');
    },
    onError: e => toast.error(e?.response?.data?.error || 'Creation failed'),
  });

  const handleSubmit = (submitForApproval = false) => {
    const activeItems = items.filter(it => it.current_qty > 0);
    if (!formData.project_id) return toast.error('Select a project site');
    if (!activeItems.length) return toast.error('No work progress entered');

    const project = projects?.find(p => p.id === formData.project_id);

    createMut.mutate({
      ...formData,
      contractor_name: project?.client_name || 'Client',
      contractor_gstin: project?.client_gstin || '',
      contractor_pan: project?.client_pan || '',
      gross_amount: grossTotal,
      gst_amount: gstAmount,
      status: submitForApproval ? 'submitted' : 'draft',
      items: activeItems,
    });
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] font-sans text-slate-700 ra-bill-modern">

      {/* ── Sticky top bar ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/80">
        <div className="max-w-[1480px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="grid place-items-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span>QS</span><span className="text-slate-300">/</span><span>Client Billing</span>
              </div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[19px] font-semibold text-slate-900 leading-tight truncate">New RA Bill</h1>
                {selectedProject && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {approvedMeasurements?.length || 0} measurements synced
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end pr-3 mr-1 border-r border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Payable</span>
              <span className="text-[18px] font-bold text-indigo-600 leading-tight">{inr(netPayable)}</span>
            </div>
            <button
              onClick={() => handleSubmit(false)}
              disabled={createMut.isPending || !formData.project_id}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <Save size={15} /> {createMut.isPending ? 'Saving…' : 'Draft'}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={createMut.isPending || !formData.project_id}
              className="h-10 px-5 inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-40 transition-all shadow-sm shadow-indigo-200"
            >
              <Send size={15} /> Submit for Approval
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1480px] mx-auto px-6 py-6 space-y-6">

        {/* ── KPI hero strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Layers size={16} />}
            label="Gross Valuation"
            value={compactInr(grossTotal)}
            sub={`${activeItemCount} item${activeItemCount === 1 ? '' : 's'} claimed`}
            tone="slate"
          />
          <KpiCard
            icon={<Percent size={16} />}
            label={`GST @ ${formData.gst_rate}%`}
            value={`+ ${compactInr(gstAmount)}`}
            sub="Added to gross"
            tone="blue"
          />
          <KpiCard
            icon={<TrendingUp size={16} />}
            label="Total Deductions"
            value={`− ${compactInr(totalDeductions)}`}
            sub="Retention, TDS, recoveries"
            tone="rose"
          />
          <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-200/60">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative">
              <div className="flex items-center gap-2 text-white/80">
                <Wallet size={16} />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Net Payable</span>
              </div>
              <div className="mt-2 text-[26px] font-bold leading-none">{inr(netPayable)}</div>
              <div className="mt-1.5 text-[11px] text-white/70">
                {parseFloat(formData.price_escalation) !== 0 && `incl. escalation ${inr(formData.price_escalation)}`}
                {parseFloat(formData.price_escalation) === 0 && 'after all deductions'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">

          {/* Measurement sheet card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid place-items-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600">
                  <Receipt size={16} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 leading-tight">Measurement Ledger</h2>
                  <p className="text-[11px] text-slate-400">Claim quantities pulled from approved measurements</p>
                </div>
              </div>
              {items.length > 0 && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                  {items.length} line items
                </span>
              )}
            </div>

            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-left border-separate border-spacing-0" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-slate-50/70">
                    <th className="px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      Description of Work Item
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right w-24 border-b border-slate-100">
                      BOQ Cap
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right w-24 border-b border-slate-100">
                      Previous
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider text-right w-32 border-b border-slate-100 bg-indigo-50/40">
                      Claim Qty
                    </th>
                    <th className="px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right w-36 border-b border-slate-100">
                      Value (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="grid place-items-center w-12 h-12 rounded-2xl bg-slate-50 text-slate-300">
                            <Plus className="w-6 h-6" />
                          </div>
                          <span className="text-[13px] text-slate-400 font-medium">
                            Select a project site to load billable items
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {items.map((it, idx) => {
                    const cumQty = (it.prev_certified_qty || 0) + (it.current_qty || 0);
                    const isOver = cumQty > it.boq_qty;
                    return (
                      <tr key={idx} className="group hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3.5 border-b border-slate-50">
                          <div className={clsx(
                            'text-[13px] font-medium leading-snug',
                            isOver ? 'text-rose-600' : 'text-slate-800'
                          )}>
                            {it.is_variation && (
                              <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-100 text-violet-600 align-middle">VO</span>
                            )}
                            {it.description}
                            {isOver && <AlertTriangle size={12} className="inline ml-1 mb-0.5 text-rose-400" />}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="border border-slate-200 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold text-slate-500">
                              {it.unit}
                            </span>
                            <span>Rate ₹{Number(it.rate).toLocaleString('en-IN')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-[12px] text-slate-400 border-b border-slate-50">
                          {(it.boq_qty || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-[12px] text-slate-400 border-b border-slate-50">
                          {(it.prev_certified_qty || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right border-b border-slate-50 bg-indigo-50/20">
                          <input
                            type="number"
                            className={clsx(
                              'w-full h-9 text-right bg-white border rounded-lg px-2.5 text-[13px] font-semibold outline-none transition-all',
                              isOver
                                ? 'border-rose-300 text-rose-600 focus:ring-2 focus:ring-rose-100'
                                : 'border-slate-200 text-indigo-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50'
                            )}
                            value={it.current_qty}
                            onChange={e => handleQtyChange(idx, e.target.value)}
                            min={0}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-[13px] font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors border-b border-slate-50">
                          {inr(it.amount || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Remarks */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Notes</span>
                <input
                  className="flex-1 bg-transparent border-none text-[13px] text-slate-700 outline-none placeholder:text-slate-400 placeholder:italic"
                  placeholder="Annotate measurement discrepancies or physical progress details…"
                  value={formData.remarks}
                  onChange={e => set('remarks', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Right rail: input cards ── */}
          <div className="space-y-5">

            {/* Bill Info */}
            <Card icon={<Building2 size={15} />} title="Bill Information">
              <Field label="Project Site *">
                <SearchableSelect
                  value={formData.project_id}
                  onChange={v => set('project_id', v)}
                  options={(projects || []).map(p => ({ value: p.id, label: p.name }))}
                  placeholder="— Select project —"
                  searchPlaceholder="Search projects…"
                />
              </Field>

              {selectedProject && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                  <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Billing To Client</div>
                  <div className="text-[13px] font-semibold text-slate-800">{selectedProject.client_name || 'Generic Client'}</div>
                  {(selectedProject.client_gstin || selectedProject.client_pan) && (
                    <div className="text-[10px] font-medium text-slate-500">
                      GST {selectedProject.client_gstin || '—'} · PAN {selectedProject.client_pan || '—'}
                    </div>
                  )}
                </div>
              )}

              <Field label="RA Bill No. *">
                <input className="field-input font-mono bg-slate-50" value={formData.bill_number} onChange={e => set('bill_number', e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Period From">
                  <input type="date" className="field-input text-[12px]" value={formData.bill_period_from} onChange={e => set('bill_period_from', e.target.value)} />
                </Field>
                <Field label="Period To">
                  <input type="date" className="field-input text-[12px]" value={formData.bill_period_to} onChange={e => set('bill_period_to', e.target.value)} />
                </Field>
              </div>
            </Card>

            {/* Rates */}
            <Card icon={<Percent size={15} />} title="Rates">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Retention %">
                  <input type="number" className="field-input" value={formData.retention_percent} onChange={e => set('retention_percent', parseFloat(e.target.value) || 0)} min={0} max={100} />
                </Field>
                <Field label="GST %">
                  <input type="number" className="field-input" value={formData.gst_rate} onChange={e => set('gst_rate', parseFloat(e.target.value) || 0)} min={0} />
                </Field>
                <Field label="TDS %">
                  <input type="number" className="field-input" value={formData.tds_rate} onChange={e => set('tds_rate', parseFloat(e.target.value) || 0)} min={0} />
                </Field>
              </div>
            </Card>

            {/* Deductions & Recovery */}
            <Card icon={<Wallet size={15} />} title="Deductions & Recovery">
              {/* Advance Recovery */}
              <div className="space-y-3 p-3 bg-blue-50/40 border border-blue-100 rounded-xl">
                <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Advance Recovery</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mobilization ₹">
                    <input type="number" className="field-input border-blue-200" value={formData.mobilization_advance_recovery} onChange={e => set('mobilization_advance_recovery', parseFloat(e.target.value) || 0)} min={0} />
                  </Field>
                  <Field label="Adhoc ₹">
                    <input type="number" className="field-input border-blue-200" value={formData.adhoc_advance_recovery} onChange={e => set('adhoc_advance_recovery', parseFloat(e.target.value) || 0)} min={0} />
                  </Field>
                </div>
              </div>

              {/* Technical Recovery */}
              <div className="space-y-3 p-3 bg-amber-50/40 border border-amber-100 rounded-xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Material Recovery</h4>
                  <button onClick={handleSyncRecovery} className="text-[10px] font-semibold text-indigo-500 hover:underline">Auto-Sync</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Steel ₹">
                    <input type="number" className="field-input border-amber-200" value={formData.material_recovery_steel} onChange={e => set('material_recovery_steel', parseFloat(e.target.value) || 0)} min={0} />
                  </Field>
                  <Field label="Cement ₹">
                    <input type="number" className="field-input border-amber-200" value={formData.material_recovery_cement} onChange={e => set('material_recovery_cement', parseFloat(e.target.value) || 0)} min={0} />
                  </Field>
                </div>
              </div>

              {/* Price Escalation */}
              <Field
                label="Price Escalation (± ₹)"
                action={<button onClick={handleSyncEscalation} className="text-[10px] font-semibold text-indigo-500 hover:underline">Sync from Tracker</button>}
              >
                <input
                  type="number"
                  className={clsx('field-input font-bold', parseFloat(formData.price_escalation) >= 0 ? 'text-emerald-600' : 'text-rose-500')}
                  value={formData.price_escalation}
                  onChange={e => set('price_escalation', parseFloat(e.target.value) || 0)}
                />
                {priceEscStats?.line_count > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tracker: {priceEscStats.line_count} line(s) — net {inr(priceEscStats.net_escalation)}
                  </p>
                )}
              </Field>

              {/* Other Deductions */}
              <Field label="Other Deductions ₹">
                <input type="number" className="field-input" value={formData.other_deductions} onChange={e => set('other_deductions', parseFloat(e.target.value) || 0)} min={0} />
              </Field>
            </Card>

            {/* Bill Summary breakdown */}
            <Card icon={<Receipt size={15} />} title="Bill Summary">
              <div className="space-y-2">
                {/* Certified value (additions) */}
                <SummaryRow label="Gross Valuation" value={inr(grossTotal)} />
                <SummaryRow label={`GST (${formData.gst_rate}% of gross + escl.)`} value={`+ ${inr(gstAmount)}`} valueClass="text-blue-600" />
                {parseFloat(formData.price_escalation) !== 0 && (
                  <SummaryRow
                    label="Price Escalation"
                    value={priceEscalation > 0 ? `+ ${inr(priceEscalation)}` : `− ${inr(Math.abs(priceEscalation))}`}
                    valueClass={priceEscalation > 0 ? 'text-emerald-600' : 'text-rose-500'}
                  />
                )}
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                  <span className="text-[12px] font-medium text-slate-600">Gross Bill Value</span>
                  <span className="text-[12px] font-semibold font-mono text-slate-800">{inr(grossTotal + gstAmount + priceEscalation)}</span>
                </div>

                {/* Deductions block */}
                <div className="mt-3 rounded-xl bg-rose-50/40 border border-rose-100 p-3 space-y-2">
                  <div className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Deductions</div>
                  <SummaryRow label={`Retention (${formData.retention_percent}% of gross + escl.)`} value={`− ${inr(retentionAmount)}`} valueClass="text-rose-500" />
                  <SummaryRow label={`TDS (${formData.tds_rate}%)`} value={`− ${inr(tdsAmount)}`} valueClass="text-rose-500" />
                  {parseFloat(formData.mobilization_advance_recovery) > 0 && (
                    <SummaryRow label="Mob. Adv. Recovery" value={`− ${inr(formData.mobilization_advance_recovery)}`} valueClass="text-rose-500" />
                  )}
                  {parseFloat(formData.adhoc_advance_recovery) > 0 && (
                    <SummaryRow label="Adhoc Recovery" value={`− ${inr(formData.adhoc_advance_recovery)}`} valueClass="text-rose-500" />
                  )}
                  {parseFloat(formData.material_recovery_steel) > 0 && (
                    <SummaryRow label="Steel Recovery" value={`− ${inr(formData.material_recovery_steel)}`} valueClass="text-rose-500" />
                  )}
                  {parseFloat(formData.material_recovery_cement) > 0 && (
                    <SummaryRow label="Cement Recovery" value={`− ${inr(formData.material_recovery_cement)}`} valueClass="text-rose-500" />
                  )}
                  {parseFloat(formData.other_deductions) > 0 && (
                    <SummaryRow label="Other Deductions" value={`− ${inr(formData.other_deductions)}`} valueClass="text-rose-500" />
                  )}
                  <div className="border-t border-rose-200/70 pt-2 mt-1 flex justify-between items-center">
                    <span className="text-[12px] font-semibold text-rose-700">Total Deductions</span>
                    <span className="text-[13px] font-bold font-mono text-rose-600">− {inr(totalDeductions)}</span>
                  </div>
                </div>

                {/* Net */}
                <div className="border-t border-slate-100 pt-3 mt-1 flex justify-between items-center">
                  <span className="text-[13px] font-semibold text-slate-900">Net Payable</span>
                  <span className="text-[17px] font-bold text-indigo-600">{inr(netPayable)}</span>
                </div>
              </div>
            </Card>

            {/* Theoretical Targets */}
            {theoreticList.length > 0 && (
              <Card icon={<TrendingUp size={15} />} title="Theoretical Targets" badge="AUTO">
                <div className="space-y-2">
                  {theoreticList.map((theo, i) => (
                    <div key={i} className="flex justify-between items-center text-[12px]">
                      <span className="font-medium text-slate-500">{theo.material}</span>
                      <span className="font-semibold text-slate-800 font-mono">{theo.qty.toFixed(2)} {theo.unit}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-100 flex gap-2">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 leading-snug">These targets are mapped against site issues during reconciliation audit.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .ra-bill-modern .field-input {
          width: 100%;
          height: 40px;
          border: 1px solid #378ADD;
          border-radius: 10px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 500;
          color: #0f172a;
          background: #E6F1FB;
          box-shadow: 0 0 0 3px rgba(55,138,221,0.15);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ra-bill-modern .field-input:focus { border-color: #2569b3; }
        .ra-bill-modern input::-webkit-outer-spin-button,
        .ra-bill-modern input::-webkit-inner-spin-button { -webkit-appearance: none; }
        .ra-bill-modern input[type=number] { -moz-appearance: textfield; }
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 bg-slate-100',
    blue: 'text-blue-600 bg-blue-50',
    rose: 'text-rose-500 bg-rose-50',
  };
  return (
    <div className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={clsx('grid place-items-center w-8 h-8 rounded-lg', tones[tone])}>{icon}</div>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 text-[22px] font-bold text-slate-900 leading-none">{value}</div>
      <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function Card({ icon, title, badge, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center w-7 h-7 rounded-lg bg-slate-50 text-slate-500">{icon}</div>
          <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
        </div>
        {badge && <span className="text-[9px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded">{badge}</span>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, action, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold text-slate-500">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, valueClass = 'text-slate-800' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className={clsx('text-[12px] font-semibold font-mono', valueClass)}>{value}</span>
    </div>
  );
}
