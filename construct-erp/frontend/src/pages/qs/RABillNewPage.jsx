// src/pages/qs/RABillNewPage.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Save, Plus, AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';
// FIX: Added missing measurementAPI, vendorAPI, and materialReconAPI imports
import { raBillAPI, projectAPI, boqAPI, measurementAPI, vendorAPI, variationAPI, normsAPI, materialReconAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const gstAmount = grossTotal * (formData.gst_rate / 100);
  const retentionAmount = grossTotal * (formData.retention_percent / 100);
  const tdsAmount = grossTotal * (formData.tds_rate / 100);
  const netPayable =
    grossTotal + gstAmount - (
      retentionAmount + 
      parseFloat(formData.mobilization_advance_recovery || 0) + 
      parseFloat(formData.material_recovery_steel || 0) +
      parseFloat(formData.material_recovery_cement || 0) +
      parseFloat(formData.other_deductions || 0) +
      tdsAmount
    ) + parseFloat(formData.price_escalation || 0);

  const { data: auditSummary } = useQuery({
    queryKey: ['audit-summary-impact', formData.project_id],
    queryFn: () => materialReconAPI.audit(formData.project_id).then(r => r.data.summary),
    enabled: !!formData.project_id,
  });

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
    <div className="flex flex-col h-screen font-sans text-sm overflow-hidden bg-[#f4f6f9] text-[#404452]">

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 h-14 bg-white border-b border-[#e2e6ec] flex items-center justify-between px-6 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-[#f4f6f9] text-[#6a6f7d] hover:text-[#1a1c21] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-[#e2e6ec]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-medium text-[#1a1c21] leading-none">
                New Bill Certification
              </h1>
              {formData.project_id && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-[#0067ff] border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0067ff] animate-pulse" />
                  {approvedMeasurements?.length || 0} measurements synced
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#8e94a3] mt-0.5 uppercase tracking-wider font-medium">
              Measurement Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider">
              Total Payable
            </span>
            <span className="text-[17px] font-medium text-[#0067ff] leading-tight">
              {inr(netPayable)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={createMut.isPending || !formData.project_id}
              className="h-9 px-4 rounded-lg text-xs font-medium border border-[#d8dce1] bg-white text-[#404452] hover:bg-[#f4f6f9] disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Saving…' : 'Save as Draft'}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={createMut.isPending || !formData.project_id}
              className="h-9 px-5 rounded-lg text-xs font-medium bg-[#0067ff] text-white hover:bg-[#0056d6] disabled:opacity-50 transition-colors shadow-sm"
            >
              Submit for Approval
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 flex overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-[272px] flex-shrink-0 border-r border-[#e2e6ec] flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scroll">

            {/* Bill Headers */}
            <section className="space-y-3">
              <h3 className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-[0.15em]">
                Bill Headers
              </h3>

              <Field label="Project Site *">
                <select
                  className="field-input"
                  value={formData.project_id}
                  onChange={e => set('project_id', e.target.value)}
                >
                  <option value="">— Select —</option>
                  {projects?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {formData.project_id && projects?.find(p => p.id === formData.project_id) && (
                  <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg space-y-1">
                    <div className="text-[10px] font-medium text-blue-400 uppercase tracking-widest">Billing To Client</div>
                    <div className="text-xs font-medium text-[#1a1c21] uppercase tracking-tight">
                       {projects.find(p => p.id === formData.project_id)?.client_name || 'Generic Client'}
                    </div>
                    {(projects.find(p => p.id === formData.project_id)?.client_gstin || projects.find(p => p.id === formData.project_id)?.client_pan) && (
                      <div className="text-[9px] font-medium text-slate-900 font-medium uppercase">
                        GST: {projects.find(p => p.id === formData.project_id)?.client_gstin || '---'} | PAN: {projects.find(p => p.id === formData.project_id)?.client_pan || '---'}
                      </div>
                    )}
                  </div>
                )}
              </Field>

              <Field label="RA Bill No. *">
                <input
                  className="field-input font-mono bg-[#f4f6f9]"
                  value={formData.bill_number}
                  onChange={e => set('bill_number', e.target.value)}
                />
              </Field>
            </section>

            {/* Period */}
            <section className="space-y-3">
              <h3 className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-[0.15em]">
                Period
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From">
                  <input
                    type="date"
                    className="field-input text-[11px]"
                    value={formData.bill_period_from}
                    onChange={e => set('bill_period_from', e.target.value)}
                  />
                </Field>
                <Field label="To">
                  <input
                    type="date"
                    className="field-input text-[11px]"
                    value={formData.bill_period_to}
                    onChange={e => set('bill_period_to', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            {/* Deductions */}
            <section className="space-y-3">
              <h3 className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-[0.15em]">
                Deductions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Retention %">
                  <input
                    type="number"
                    className="field-input"
                    value={formData.retention_percent}
                    onChange={e => set('retention_percent', parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                  />
                </Field>
                <Field label="GST %">
                  <input
                    type="number"
                    className="field-input"
                    value={formData.gst_rate}
                    onChange={e => set('gst_percent', parseFloat(e.target.value) || 0)}
                    min={0}
                  />
                </Field>
              </div>
              <Field label="Advance Recovery (₹)">
                <input
                  type="number"
                  className="field-input"
                  value={formData.mobilization_advance_recovery}
                  onChange={e =>
                    set('mobilization_advance_recovery', parseFloat(e.target.value) || 0)
                  }
                  min={0}
                />
              </Field>

              <div className="space-y-3 p-3 bg-amber-50/20 border border-amber-100 rounded-xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-medium text-amber-600 uppercase tracking-widest">Technical Recovery</h4>
                  <button 
                    onClick={handleSyncRecovery}
                    className="text-[9px] font-medium text-blue-500 uppercase hover:underline"
                  >
                    Auto-Sync
                  </button>
                </div>
                
                <Field label="Steel Recovery (₹)">
                  <input
                    type="number"
                    className="field-input border-amber-200"
                    value={formData.material_recovery_steel}
                    onChange={e => set('material_recovery_steel', parseFloat(e.target.value) || 0)}
                    min={0}
                  />
                </Field>

                <Field label="Cement Recovery (₹)">
                  <input
                    type="number"
                    className="field-input border-amber-200"
                    value={formData.material_recovery_cement}
                    onChange={e => set('material_recovery_cement', parseFloat(e.target.value) || 0)}
                    min={0}
                  />
                </Field>
              </div>

              <Field label="Price Escalation (± ₹)">
                <div className="relative">
                  <input
                    type="number"
                    className={clsx(
                      "field-input font-bold",
                      parseFloat(formData.price_escalation) > 0 ? "text-green-600" : "text-red-500"
                    )}
                    value={formData.price_escalation}
                    onChange={e => set('price_escalation', parseFloat(e.target.value) || 0)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-slate-400">EPV / ESCL</span>
                </div>
              </Field>

              <Field label="Other Deductions (₹)">
                <input
                  type="number"
                  className="field-input"
                  value={formData.other_deductions}
                  onChange={e => set('other_deductions', parseFloat(e.target.value) || 0)}
                  min={0}
                />
              </Field>
            </section>
          </div>

          {/* ── Financial summary ── */}
          <div className="flex-shrink-0 border-t border-[#e2e6ec] bg-[#f8fafc] p-4 space-y-2">
            <SummaryRow label="Gross Valuation" value={inr(grossTotal)} />
            <SummaryRow label={`GST (${formData.gst_rate}%)`} value={`+ ${inr(gstAmount)}`} valueClass="text-[#0067ff]" />
            <SummaryRow label={`Retention (${formData.retention_percent}%)`} value={`− ${inr(retentionAmount)}`} valueClass="text-red-500" />
            <SummaryRow label={`TDS (${formData.tds_rate}%)`} value={`− ${inr(tdsAmount)}`} valueClass="text-red-500" />
            
            {parseFloat(formData.mobilization_advance_recovery) > 0 && (
              <SummaryRow label="Adv. Recovery" value={`− ${inr(formData.mobilization_advance_recovery)}`} valueClass="text-red-500" />
            )}
            {parseFloat(formData.material_recovery_steel) > 0 && (
              <SummaryRow label="Steel Recovery" value={`− ${inr(formData.material_recovery_steel)}`} valueClass="text-red-500" />
            )}
            {parseFloat(formData.material_recovery_cement) > 0 && (
              <SummaryRow label="Cement Recovery" value={`− ${inr(formData.material_recovery_cement)}`} valueClass="text-red-500" />
            )}
            {parseFloat(formData.price_escalation) !== 0 && (
              <SummaryRow 
                label="Price Escalation" 
                value={parseFloat(formData.price_escalation) > 0 ? `+ ${inr(formData.price_escalation)}` : `− ${inr(Math.abs(formData.price_escalation))}`} 
                valueClass={parseFloat(formData.price_escalation) > 0 ? "text-green-500" : "text-red-500"} 
              />
            )}
             {parseFloat(formData.other_deductions) > 0 && (
              <SummaryRow label="Other Ded." value={`− ${inr(formData.other_deductions)}`} valueClass="text-red-500" />
            )}
            <div className="border-t border-[#e2e6ec] pt-2 mt-1 flex justify-between items-center">
              <span className="text-xs font-medium text-[#1a1c21]">Net Payable</span>
              <span className="text-base font-medium text-[#0067ff]">{inr(netPayable)}</span>
            </div>
          </div>

          {/* ── Theoretical Material Audit ── */}
          {theoreticList.length > 0 && (
            <div className="flex-shrink-0 border-t border-[#e2e6ec] bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                 <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Theoretical Targets</h3>
                 <span className="text-[9px] font-medium bg-blue-500 text-white px-1.5 py-0.5 rounded">AUTO</span>
              </div>
              <div className="space-y-2">
                {theoreticList.map((theo, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-slate-500">{theo.material}</span>
                    <span className="font-medium text-slate-800">{theo.qty.toFixed(2)} {theo.unit}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-2 bg-amber-50 rounded border border-amber-100 flex gap-2">
                <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[9px] text-amber-700 leading-tight">These targets will be mapped against site issues during reconciliation audit.</p>
              </div>
            </div>
          )}
        </aside>

        {/* ── Measurement sheet ── */}
        <section className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-1 overflow-auto custom-scroll">
            <table className="w-full text-left border-separate border-spacing-0" style={{ minWidth: 780 }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#f8fafc] border-b border-[#e2e6ec]">
                  <th className="px-5 py-3 text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider border-b border-r border-[#e2e6ec]">
                    Description of Work Item
                  </th>
                  <th className="px-4 py-3 text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider text-right w-24 border-b border-r border-[#e2e6ec]">
                    BOQ Cap
                  </th>
                  <th className="px-4 py-3 text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider text-right w-24 border-b border-r border-[#e2e6ec]">
                    Previous
                  </th>
                  <th className="px-4 py-3 text-[10px] font-medium text-[#0067ff] uppercase tracking-wider text-right w-32 border-b border-r border-[#e2e6ec] bg-blue-50/50">
                    Claim Qty
                  </th>
                  <th className="px-5 py-3 text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider text-right w-36 border-b border-[#e2e6ec]">
                    Value (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="w-6 h-6 text-slate-300" />
                        <span className="text-xs text-slate-900 font-medium font-medium">
                          Select a project to load billable items
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {items.map((it, idx) => {
                  const cumQty = (it.prev_certified_qty || 0) + (it.current_qty || 0);
                  const isOver = cumQty > it.boq_qty;
                  return (
                    <tr
                      key={idx}
                      className="group border-b border-[#f0f2f5] hover:bg-[#fbfcfe] transition-colors"
                    >
                      <td className="px-5 py-3 border-r border-[#f0f2f5]">
                        <div
                          className={clsx(
                            'text-[13px] font-medium leading-snug tracking-tight',
                            isOver ? 'text-red-500' : 'text-[#1a1c21]'
                          )}
                        >
                          {it.description}
                          {isOver && (
                            <AlertTriangle
                              size={12}
                              className="inline ml-1 mb-0.5 text-red-400"
                            />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-[#8e94a3]">
                          <span className="border border-[#e2e6ec] px-1.5 py-0.5 rounded text-[9px] uppercase font-medium">
                            {it.unit}
                          </span>
                          <span>Unit Rate: ₹{Number(it.rate).toLocaleString('en-IN')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-900 font-medium border-r border-[#f0f2f5]">
                        {(it.boq_qty || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-900 font-medium border-r border-[#f0f2f5]">
                        {(it.prev_certified_qty || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right border-r border-[#f0f2f5] bg-blue-50/20">
                        <input
                          type="number"
                          className={clsx(
                            'w-full h-8 text-right bg-white border rounded-lg px-2 text-sm font-medium outline-none transition-all',
                            isOver
                              ? 'border-red-300 text-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-[#d8dce1] text-[#0067ff] focus:border-[#0067ff] focus:ring-2 focus:ring-blue-50'
                          )}
                          value={it.current_qty}
                          onChange={e => handleQtyChange(idx, e.target.value)}
                          min={0}
                        />
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-medium text-[#404452] group-hover:text-[#0067ff] transition-colors">
                        {inr(it.amount || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Remarks */}
          <div className="flex-shrink-0 border-t border-[#e2e6ec] bg-[#f8fafc] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider whitespace-nowrap">
                Notes:
              </span>
              <input
                className="flex-1 bg-transparent border-none text-xs text-[#404452] outline-none placeholder:text-[#b0b5c3] placeholder:italic"
                placeholder="Annotate measurement discrepancies or physical progress details…"
                value={formData.remarks}
                onChange={e => set('remarks', e.target.value)}
              />
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .field-input {
          width: 100%;
          height: 32px;
          border: 1px solid #d8dce1;
          border-radius: 6px;
          padding: 0 8px;
          font-size: 12px;
          color: #1a1c21;
          background: #ffffff;
          outline: none;
          transition: border-color 0.15s;
        }
        .field-input:focus { border-color: #0067ff; box-shadow: 0 0 0 3px #e8f0ff; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        .custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #d8dce1; border-radius: 10px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-[#6a6f7d]">{label}</label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, valueClass = 'text-[#1a1c21]' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-[#6a6f7d]">{label}</span>
      <span className={clsx('text-[11px] font-medium font-mono', valueClass)}>{value}</span>
    </div>
  );
}
