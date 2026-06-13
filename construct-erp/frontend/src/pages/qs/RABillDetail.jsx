// src/pages/qs/RABillDetail.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, CheckCircle2, Building2,
  User, Calendar, Banknote, ShieldCheck,
  Printer, Layers, FileText, XCircle, Clock,
  Receipt, ChevronRight, CreditCard, Hash, BadgeIndianRupee, TrendingDown, FileSpreadsheet, X,
} from 'lucide-react';
import { raBillAPI, variationAPI, materialReconAPI, default as apiClient } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import RABillPrintTemplate from './RABillPrintTemplate';
import RABillTaxInvoice from './RABillTaxInvoice';
import RABillProformaInvoice from './RABillProformaInvoice';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-900 font-medium border-slate-200' },
  submitted: { label: 'Submitted', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  verified:  { label: 'Verified',  cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  certified: { label: 'Certified', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  rejected:  { label: 'Rejected',  cls: 'bg-red-50 text-red-500 border-red-200' },
  paid:      { label: 'Paid',      cls: 'bg-teal-50 text-teal-600 border-teal-200' },
};

const STEPS = [
  { key: 'submitted', label: 'Submitted',  Icon: FileText },
  { key: 'verified',  label: 'Verified',   Icon: ShieldCheck },
  { key: 'certified', label: 'Certified',  Icon: CheckCircle2 },
  { key: 'paid',      label: 'Paid',       Icon: Banknote },
];

// Role-based action permissions
const CAN_VERIFY  = ['qs_engineer', 'admin', 'super_admin'];
const CAN_CERTIFY = ['project_manager', 'admin', 'super_admin'];
const CAN_REJECT  = ['qs_engineer', 'project_manager', 'admin', 'super_admin'];
const CAN_PAY     = ['accountant', 'admin', 'super_admin'];

export default function RABillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printRef       = useRef();
  const taxInvoiceRef  = useRef();
  const proformaRef    = useRef();
  const { user } = useAuthStore();
  const role = user?.role || '';
  const [showTaxModal,      setShowTaxModal]      = useState(false);
  const [invoiceNo,         setInvoiceNo]         = useState('');
  const [invoiceDate,       setInvoiceDate]       = useState(dayjs().format('YYYY-MM-DD'));
  const [taxLetterhead,     setTaxLetterhead]     = useState(false);
  const [showProformaModal, setShowProformaModal] = useState(false);
  const [proformaNo,        setProformaNo]        = useState('');
  const [proformaDate,      setProformaDate]      = useState(dayjs().format('YYYY-MM-DD'));

  // Scale the A4 (210mm ≈ 794px) preview to fit the screen width so nothing is cut off
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const calc = () => setPreviewScale(Math.min(1, (window.innerWidth - 48) / 794));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const A4_W = 794, A4_H = 1123; // px at 96dpi

  // Backend now wraps detail in { data: {...} }
  const { data: b, isLoading } = useQuery({
    queryKey: ['ra-bill', id],
    queryFn: () => apiClient.get(`/ra-bills/${id}`).then(r => r.data?.data || r.data),
  });

  const { data: variations } = useQuery({
    queryKey: ['variations', b?.project_id],
    queryFn: () => variationAPI.list({ project_id: b.project_id, status: 'approved' }).then(r => r.data?.data || []),
    enabled: !!b?.project_id,
  });

  const { data: audit } = useQuery({
    queryKey: ['material-audit', b?.project_id],
    queryFn: () => materialReconAPI.audit(b.project_id).then(r => r.data?.data),
    enabled: !!b?.project_id,
  });

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `RA_Bill_${b?.bill_number || 'export'}`,
  });

  // A4 edge-to-edge: the invoice templates are 210mm wide with their own internal
  // margins, so kill the browser's default print margins or the content gets
  // scaled down / clipped on the right when actually printing or saving as PDF.
  const A4_PAGE_STYLE = `
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  const handleTaxInvoicePrint = useReactToPrint({
    contentRef: taxInvoiceRef,
    documentTitle: `Tax_Invoice_${invoiceNo || b?.bill_number || 'export'}`,
    pageStyle: A4_PAGE_STYLE,
  });

  const handleProformaPrint = useReactToPrint({
    contentRef: proformaRef,
    documentTitle: `Proforma_${proformaNo || b?.bill_number || 'export'}`,
    pageStyle: A4_PAGE_STYLE,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ra-bill', id] });
    qc.invalidateQueries({ queryKey: ['ra-bills'] });
  };

  const verifyMut = useMutation({
    mutationFn: () => raBillAPI.verify(id),
    onSuccess: () => { toast.success('Bill verified'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Verification failed'),
  });

  const certifyMut = useMutation({
    mutationFn: () => raBillAPI.approve(id, { action: 'approve' }),
    onSuccess: () => { toast.success('Bill certified'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Certification failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => raBillAPI.reject(id),
    onSuccess: () => { toast.success('Bill rejected'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Rejection failed'),
  });

  const handleDownloadPDF = () => {
    if (!b) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`RA Bill — ${b.bill_number}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Project: ${b.project_name} | Date: ${dayjs(b.bill_date).format('DD MMM YYYY')}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      head: [['Description', 'Unit', 'Rate', 'Prev Qty', 'Curr Qty', 'Amount']],
      body: (b.items || []).map(it => [
        it.description,
        it.unit,
        inr(it.rate),
        (it.prev_certified_qty || 0).toLocaleString(),
        (it.current_qty || 0).toLocaleString(),
        inr(it.amount || it.current_qty * it.rate),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 103, 255] },
    });
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Gross: ${inr(b.gross_amount)}   Net Payable: ${inr(b.net_payable)}`, 14, finalY);
    doc.save(`RA_Bill_${b.bill_number}.pdf`);
  };

  if (isLoading || !b) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-xs text-[#8e94a3]">Loading bill…</div>
      </div>
    );
  }

  const st = STATUS_MAP[b.status] || STATUS_MAP.submitted;
  const currentIdx = STEPS.findIndex(s => s.key === b.status);
  const rejectedOrPaid = ['rejected', 'paid'].includes(b.status);

  const deductions = [
    { label: `Retention (${b.retention_pct || b.retention_percent || 0}%)`, value: b.retention_amount },
    { label: 'Mobilization Advance Recovery',       value: b.mobilization_advance_recovery },
    { label: 'Adhoc (Advance Recovery)',            value: b.adhoc_advance_recovery },
    { label: 'Steel Recovery',                      value: b.material_recovery_steel },
    { label: 'Cement Recovery',                     value: b.material_recovery_cement },
    { label: `TDS (${b.tds_rate || 2}%)`,           value: b.tds_amount },
    { label: 'Other Deductions',                    value: b.other_deductions },
  ].filter(d => parseFloat(d.value) > 0);

  const escalation = parseFloat(b.price_escalation || 0);

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans text-sm">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e2e6ec] shadow-sm px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#e2e6ec] hover:bg-[#f4f6f9] text-[#6a6f7d] transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-5 w-px bg-[#e2e6ec]" />
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-medium text-[#1a1c21] font-mono uppercase tracking-tight">{b.bill_number}</h1>
              <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium border', st.cls)}>
                {st.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#8e94a3]">
              <Building2 size={11} /> {b.contractor_name}
              <ChevronRight size={10} />
              <Calendar size={11} /> {dayjs(b.bill_date).format('DD MMM YYYY')}
              {b.project_name && <><ChevronRight size={10} />{b.project_name}</>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => handlePrint()}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:text-indigo-600 hover:border-indigo-200 transition-colors"
            title="Print RA Bill">
            <Printer size={16} />
          </button>
          <button onClick={handleDownloadPDF}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#e2e6ec] bg-white text-[#6a6f7d] hover:text-indigo-600 hover:border-indigo-200 transition-colors"
            title="Download PDF">
            <Download size={16} />
          </button>
          {/* Proforma Invoice — before certification */}
          {['submitted', 'verified'].includes(b?.status) && (
            <button
              onClick={() => { setProformaNo(''); setProformaDate(dayjs().format('YYYY-MM-DD')); setShowProformaModal(true); }}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-[11px] font-medium"
              title="Generate Proforma Invoice">
              <FileSpreadsheet size={14} /> Proforma Invoice
            </button>
          )}

          {/* Tax Invoice — after client certification */}
          {['certified', 'paid'].includes(b?.status) && (
            <button
              onClick={() => { setInvoiceNo(''); setInvoiceDate(dayjs().format('YYYY-MM-DD')); setShowTaxModal(true); }}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-[11px] font-medium"
              title="Generate Tax Invoice">
              <FileSpreadsheet size={14} /> Tax Invoice
            </button>
          )}

          {/* Workflow action buttons — role-gated */}
          {!rejectedOrPaid && (
            <>
              {/* Reject — shown to QS on submitted, PM on verified, admin always */}
              {b.status === 'submitted' && CAN_VERIFY.includes(role) && (
                <button
                  onClick={() => rejectMut.mutate()}
                  disabled={rejectMut.isPending}
                  className="h-9 px-4 rounded-xl text-[11px] font-medium border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              )}
              {b.status === 'verified' && CAN_CERTIFY.includes(role) && (
                <button
                  onClick={() => rejectMut.mutate()}
                  disabled={rejectMut.isPending}
                  className="h-9 px-4 rounded-xl text-[11px] font-medium border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              )}

              {/* Verify — QS Engineer only */}
              {b.status === 'submitted' && CAN_VERIFY.includes(role) && (
                <button
                  onClick={() => verifyMut.mutate()}
                  disabled={verifyMut.isPending}
                  className="h-9 px-5 rounded-xl text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
                >
                  <ShieldCheck size={14} />
                  {verifyMut.isPending ? 'Verifying…' : 'Verify Bill'}
                </button>
              )}

              {/* Certify — Project Manager only */}
              {b.status === 'verified' && CAN_CERTIFY.includes(role) && (
                <button
                  onClick={() => certifyMut.mutate()}
                  disabled={certifyMut.isPending}
                  className="h-9 px-5 rounded-xl text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  {certifyMut.isPending ? 'Certifying…' : 'Certify Bill'}
                </button>
              )}

              {/* Mark Paid — Accountant only */}
              {b.status === 'certified' && CAN_PAY.includes(role) && (
                <button
                  onClick={() => toast('Use the payments module to record payment')}
                  className="h-9 px-5 rounded-xl text-[11px] font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <Banknote size={14} /> Mark Paid
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── Lifecycle stepper ── */}
        <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
          <div className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-widest mb-4">Approval Lifecycle</div>
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const SIcon = s.Icon;
              const passed = !['rejected'].includes(b.status) && i < currentIdx;
              const active = i === currentIdx && !['rejected'].includes(b.status);
              const isRej  = b.status === 'rejected' && i === currentIdx;
              return (
                <React.Fragment key={s.key}>
                  <div className="flex flex-col items-center flex-1">
                    <div className={clsx(
                      'w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all',
                      isRej   ? 'bg-red-500 border-red-500 text-white' :
                      passed  ? 'bg-emerald-500 border-emerald-500 text-white' :
                      active  ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-50' :
                                'bg-white border-[#d8dce1] text-[#8e94a3]'
                    )}>
                      {passed ? <CheckCircle2 size={16} /> : <SIcon size={15} />}
                    </div>
                    <div className={clsx(
                      'text-[9px] font-medium uppercase tracking-wider mt-2',
                      isRej ? 'text-red-500' : active ? 'text-indigo-600' : passed ? 'text-emerald-500' : 'text-[#b0b5c3]'
                    )}>
                      {s.label}
                    </div>
                    {passed && i === 1 && b.verified_by_name && (
                      <div className="text-[8px] text-[#8e94a3] mt-0.5">{b.verified_by_name}</div>
                    )}
                    {passed && i === 2 && b.certified_by_name && (
                      <div className="text-[8px] text-[#8e94a3] mt-0.5">{b.certified_by_name}</div>
                    )}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={clsx('flex-[2] h-0.5 -mt-6', passed ? 'bg-emerald-400' : 'bg-[#e2e6ec]')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: Items ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Bill period strip */}
            {(b.bill_period_from || b.work_description) && (
              <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-4 flex flex-wrap gap-4">
                {b.bill_period_from && (
                  <div>
                    <div className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-widest">Bill Period</div>
                    <div className="text-[12px] font-medium text-[#1a1c21] mt-0.5">
                      {dayjs(b.bill_period_from).format('DD MMM YYYY')} – {dayjs(b.bill_period_to).format('DD MMM YYYY')}
                    </div>
                  </div>
                )}
                {b.work_description && (
                  <div className="flex-1">
                    <div className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-widest">Work Description</div>
                    <div className="text-[12px] text-[#404452] mt-0.5">{b.work_description}</div>
                  </div>
                )}
              </div>
            )}

            {/* Line items table */}
            <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e2e6ec] flex items-center gap-2">
                <Layers size={15} className="text-indigo-600" />
                <h2 className="text-[11px] font-medium text-[#1a1c21] uppercase tracking-wide">Line Item Breakdown</h2>
                <span className="ml-auto text-[9px] font-medium text-[#8e94a3] bg-[#f4f6f9] px-2 py-0.5 rounded-full">
                  {(b.items || []).length} items
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e6ec]">
                      <th className="px-5 py-2.5 text-left text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider">Specification</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider w-28">Previous</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-indigo-500 uppercase tracking-wider w-28 bg-blue-50/50">Current</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-medium text-[#8e94a3] uppercase tracking-wider w-36">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f2f5]">
                    {(b.items || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-xs text-[#8e94a3]">No items found</td>
                      </tr>
                    )}
                    {(b.items || []).map((it, idx) => (
                      <tr key={idx} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-[12px] font-medium text-[#1a1c21] leading-snug">{it.description}</div>
                          <div className="text-[10px] text-[#8e94a3] mt-0.5 flex items-center gap-2">
                            <span className="border border-[#e2e6ec] px-1.5 py-0.5 rounded text-[9px] uppercase font-medium">{it.unit}</span>
                            Rate: {inr(it.rate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-[#8e94a3]">
                          {(it.prev_certified_qty || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[12px] font-medium text-indigo-600 bg-blue-50/20">
                          {(it.current_qty || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-[13px] font-medium text-[#1a1c21]">
                          {inr(it.amount || (it.current_qty * it.rate))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {(b.items || []).length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-[#e2e6ec]">
                        <td colSpan={3} className="px-5 py-3 text-[10px] font-medium text-[#8e94a3] uppercase tracking-widest">
                          Gross Valuation
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-[14px] font-medium text-[#1a1c21]">
                          {inr(b.gross_amount)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* ── Right: Financial summary ── */}
          <div className="space-y-4">

            {/* Payment ledger */}
            <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[11px] font-medium text-[#1a1c21] uppercase tracking-wide">Payment Ledger</h3>
              </div>
              <div className="space-y-2.5">
                <LedgerRow label="Gross Valuation" value={inr(b.gross_amount)} />
                <LedgerRow label={`GST @${b.gst_rate || 18}%`} value={`+ ${inr(b.gst_amount)}`} valueClass="text-indigo-600" />

                {deductions.length > 0 && (
                  <div className="border-t border-[#f0f2f5] pt-2.5 space-y-2">
                    {deductions.map((d, i) => (
                      <LedgerRow key={i} label={d.label} value={`− ${inr(d.value)}`} valueClass="text-red-500" />
                    ))}
                  </div>
                )}

                {escalation !== 0 && (
                  <LedgerRow
                    label="Price Escalation"
                    value={escalation > 0 ? `+ ${inr(escalation)}` : `− ${inr(Math.abs(escalation))}`}
                    valueClass={escalation > 0 ? 'text-emerald-600' : 'text-red-500'}
                  />
                )}

                <div className="border-t-2 border-[#1a1c21] pt-3 mt-2">
                  <div className="text-[9px] font-medium text-[#8e94a3] uppercase tracking-widest mb-1">
                    Total Certified Disbursement
                  </div>
                  <div className="text-[28px] font-medium text-emerald-600 font-mono leading-none">
                    {inr(b.net_payable)}
                  </div>
                </div>
              </div>
            </div>

            {/* Meta card */}
            <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-4 space-y-3">
              <MetaRow icon={User}     label="Submitted by"  value={b.submitted_by_name || 'Admin'} />
              <MetaRow icon={Calendar} label="Bill date"     value={dayjs(b.bill_date).format('DD MMM YYYY')} />
              {b.verified_by_name && (
                <MetaRow icon={ShieldCheck}  label="Verified by"  value={b.verified_by_name} />
              )}
              {b.certified_by_name && (
                <MetaRow icon={CheckCircle2} label="Certified by" value={b.certified_by_name} />
              )}
              {b.remarks && (
                <div className="mt-1 bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-700 italic leading-relaxed">
                  "{b.remarks}"
                </div>
              )}
            </div>

            {/* Receipt card — shown only when paid */}
            {b.status === 'paid' && (
              <div className="bg-teal-50 rounded-2xl border border-teal-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-xl bg-teal-600 flex items-center justify-center">
                    <BadgeIndianRupee className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="text-[11px] font-medium text-teal-800 uppercase tracking-wide">Payment Received</h3>
                  <span className="ml-auto text-[9px] font-medium text-teal-600 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full">SETTLED</span>
                </div>

                <div className="space-y-2.5">
                  {b.payment_date && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <Calendar size={13} className="text-teal-500 flex-shrink-0" />
                      <span className="text-teal-700">Received on</span>
                      <span className="font-medium text-teal-900 ml-auto">{dayjs(b.payment_date).format('DD MMM YYYY')}</span>
                    </div>
                  )}
                  {b.payment_mode && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <CreditCard size={13} className="text-teal-500 flex-shrink-0" />
                      <span className="text-teal-700">Mode</span>
                      <span className="font-medium text-teal-900 ml-auto">{b.payment_mode}</span>
                    </div>
                  )}
                  {b.payment_ref && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <Hash size={13} className="text-teal-500 flex-shrink-0" />
                      <span className="text-teal-700">UTR / Ref</span>
                      <span className="font-medium text-teal-900 ml-auto font-mono">{b.payment_ref}</span>
                    </div>
                  )}

                  <div className="border-t border-teal-200 pt-2.5 mt-1 space-y-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <Banknote size={13} className="text-teal-500 flex-shrink-0" />
                      <span className="text-teal-700">Net Payable (Bill)</span>
                      <span className="font-medium text-teal-900 ml-auto font-mono">{inr(b.net_payable)}</span>
                    </div>
                    {parseFloat(b.client_tds_amount || 0) > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <TrendingDown size={13} className="text-amber-500 flex-shrink-0" />
                        <span className="text-amber-700">Client TDS (u/s 194C, 2%)</span>
                        <span className="font-medium text-amber-700 ml-auto font-mono">− {inr(b.client_tds_amount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-teal-600 rounded-xl px-4 py-3 mt-1">
                    <div className="text-[9px] font-medium text-teal-200 uppercase tracking-widest">Amount Actually Received</div>
                    <div className="text-[24px] font-medium text-white font-mono leading-none mt-0.5">
                      {inr(b.amount_received || b.net_payable)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print zone — RA Bill */}
      <div className="ra-bill-print-zone">
        <RABillPrintTemplate ref={printRef} data={b} variations={variations} audit={audit} />
      </div>

      <style>{`@media screen { .ra-bill-print-zone { display: none !important; } }`}</style>

      {/* ── Proforma Invoice Full-Screen Preview ── */}
      {showProformaModal && (
        <div className="fixed inset-0 z-50 bg-[#e8eaf0] flex flex-col">
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-[#e2e6ec] shadow-sm flex-shrink-0">
            <button
              onClick={() => setShowProformaModal(false)}
              className="flex items-center gap-1.5 text-[12px] text-[#6a6f7d] hover:text-[#1a1c21] transition-colors"
            >
              <X size={15} /> Close
            </button>
            <div className="h-5 w-px bg-[#e2e6ec]" />
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-[#6a6f7d] whitespace-nowrap">Proforma No *</label>
              <input
                type="text"
                value={proformaNo}
                onChange={e => setProformaNo(e.target.value)}
                placeholder="BCIM/PI/2526/01"
                className="border border-[#d8dce6] rounded-lg px-2.5 py-1.5 text-[12px] w-36 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-[#6a6f7d]">Date</label>
              <input
                type="date"
                value={proformaDate}
                onChange={e => setProformaDate(e.target.value)}
                className="border border-[#d8dce6] rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="ml-auto">
              <button
                onClick={() => { if (!proformaNo.trim()) { toast.error('Please enter a proforma number'); return; } handleProformaPrint(); }}
                className="h-9 px-4 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                <Printer size={14} /> Print / Save PDF
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex justify-center py-6 px-4">
            <div style={{ width: A4_W * previewScale, height: A4_H * previewScale }}>
              <div style={{ width: A4_W, transform: `scale(${previewScale})`, transformOrigin: 'top left', boxShadow: '0 4px 32px rgba(0,0,0,0.18)', background: '#fff' }}>
                <RABillProformaInvoice ref={proformaRef} data={b} proformaNo={proformaNo} proformaDate={proformaDate} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tax Invoice Full-Screen Preview ── */}
      {showTaxModal && (
        <div className="fixed inset-0 z-50 bg-[#e8eaf0] flex flex-col">
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-[#e2e6ec] shadow-sm flex-shrink-0">
            <button
              onClick={() => setShowTaxModal(false)}
              className="flex items-center gap-1.5 text-[12px] text-[#6a6f7d] hover:text-[#1a1c21] transition-colors"
            >
              <X size={15} /> Close
            </button>
            <div className="h-5 w-px bg-[#e2e6ec]" />
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-[#6a6f7d] whitespace-nowrap">Invoice No *</label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="BCIM/2526/01"
                className="border border-[#d8dce6] rounded-lg px-2.5 py-1.5 text-[12px] w-36 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-[#6a6f7d]">Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="border border-[#d8dce6] rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#6a6f7d] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={taxLetterhead}
                onChange={e => setTaxLetterhead(e.target.checked)}
                className="accent-amber-500"
              />
              On Letterhead (blank top)
            </label>
            <div className="ml-auto">
              <button
                onClick={() => { if (!invoiceNo.trim()) { toast.error('Please enter an invoice number'); return; } handleTaxInvoicePrint(); }}
                className="h-9 px-4 rounded-xl bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-400 transition-colors flex items-center gap-2"
              >
                <Printer size={14} /> Print / Save PDF
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex justify-center py-6 px-4">
            <div style={{ width: A4_W * previewScale, height: A4_H * previewScale }}>
              <div style={{ width: A4_W, transform: `scale(${previewScale})`, transformOrigin: 'top left', boxShadow: '0 4px 32px rgba(0,0,0,0.18)', background: '#fff' }}>
                <RABillTaxInvoice ref={taxInvoiceRef} data={b} invoiceNo={invoiceNo} invoiceDate={invoiceDate} letterhead={taxLetterhead} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerRow({ label, value, valueClass = 'text-[#1a1c21]' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#6a6f7d]">{label}</span>
      <span className={clsx('text-[11px] font-medium font-mono', valueClass)}>{value}</span>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Icon size={13} className="text-[#8e94a3] flex-shrink-0" />
      <span className="text-[#6a6f7d]">{label}</span>
      <span className="font-medium text-[#1a1c21] ml-auto text-right">{value}</span>
    </div>
  );
}
