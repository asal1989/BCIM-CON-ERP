// src/pages/qs/RABillDetail.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
  Download, CheckCircle2,
  User, Calendar, Banknote, ShieldCheck,
  Printer, FileText, XCircle, Pencil,
  CreditCard, Hash, BadgeIndianRupee, TrendingDown, FileSpreadsheet, X,
} from 'lucide-react';
import { raBillAPI, variationAPI, materialReconAPI, default as apiClient } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import RABillPrintTemplate from './RABillPrintTemplate';
import RABillClientTemplate from './RABillClientTemplate';
import RABillTaxInvoice from './RABillTaxInvoice';
import RABillProformaInvoice from './RABillProformaInvoice';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Theme, PageHeader, SectionTitle, RichTable } from '../../theme';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-900 font-medium border-slate-200', dot: '#94a3b8' },
  submitted: { label: 'Submitted', cls: 'bg-amber-50 text-amber-600 border-amber-200',               dot: '#f59e0b' },
  verified:  { label: 'Verified',  cls: 'bg-blue-50 text-blue-600 border-blue-200',                  dot: '#3b82f6' },
  certified: { label: 'Certified', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200',         dot: '#34d399' },
  rejected:  { label: 'Rejected',  cls: 'bg-red-50 text-red-500 border-red-200',                     dot: '#f87171' },
  paid:      { label: 'Paid',      cls: 'bg-teal-50 text-teal-600 border-teal-200',                  dot: '#2dd4bf' },
};

// Glass-style button for neutral header actions on the navy PageHeader band
const glassBtnStyle = { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' };
const glassBtnHover = e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; };
const glassBtnLeave = e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; };

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
const CAN_EDIT    = ['qs_engineer', 'project_manager', 'admin', 'super_admin'];

export default function RABillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printRef        = useRef();
  const clientBillRef   = useRef();
  const taxInvoiceRef   = useRef();
  const proformaRef     = useRef();
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
  // The proforma template itself renders at 200mm (not the full 210mm A4_W),
  // so its on-screen preview wrapper needs the matching narrower width —
  // otherwise it renders correctly but sits inside a wider box, showing a
  // stray gap that reads as "not aligned" (this doesn't affect the actual
  // print, which uses the component's own width regardless of the preview).
  const PROFORMA_W = 756; // 200mm at 96dpi

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

  const handleClientBillPrint = useReactToPrint({
    contentRef: clientBillRef,
    documentTitle: `Client_RA_Bill_${b?.bill_number || 'export'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm 10mm 14mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `,
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

  // The proforma is 200mm wide (not the full 210mm), so it gets a 5mm @page
  // margin instead of the edge-to-edge one the tax invoice uses — 200 + 5 + 5
  // = exactly A4, with nothing sitting in the printer's non-printable strip.
  const PROFORMA_PAGE_STYLE = `
    @page { size: A4 portrait; margin: 5mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .proforma-page { width: 200mm !important; margin: 0 !important; }
      .proforma-page table { page-break-inside: auto; }
      .proforma-page tr { page-break-inside: avoid; }
    }
  `;

  const handleProformaPrint = useReactToPrint({
    contentRef: proformaRef,
    documentTitle: `Proforma_${proformaNo || b?.bill_number || 'export'}`,
    pageStyle: PROFORMA_PAGE_STYLE,
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

  const revertMut = useMutation({
    mutationFn: () => raBillAPI.revert(id),
    onSuccess: () => { toast.success('Bill sent back to QS for editing'); invalidate(); },
    onError: e => toast.error(e?.response?.data?.error || 'Revert failed'),
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
    <div className="min-h-screen font-sans text-sm" style={{ background: Theme.pageBg }}>

      <PageHeader
        title={b.bill_number}
        subtitle={`${b.contractor_name}${b.project_name ? ` · ${b.project_name}` : ''} · ${dayjs(b.bill_date).format('DD MMM YYYY')}`}
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'RA Bills', href: '/qs/ra-bills' }, { label: b.bill_number }]}
        onBack={() => navigate(-1)}
        pills={[
          { label: 'Status', value: st.label, color: st.dot },
          { label: 'Net Payable', value: inr(b.net_payable) },
        ]}
        actions={
          <>
            {['draft', 'rejected'].includes(b.status) && CAN_EDIT.includes(role) && (
              <button onClick={() => navigate(`/qs/ra-bills/${id}/edit`)}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
                style={glassBtnStyle} onMouseEnter={glassBtnHover} onMouseLeave={glassBtnLeave}
                title="Edit Bill">
                <Pencil size={14} /> Edit
              </button>
            )}
            <button onClick={() => handleClientBillPrint()}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: Theme.emerald.to, color: '#fff' }}
              title="Print Client RA Bill (Professional Format)">
              <FileText size={14} /> Client Bill
            </button>
            <button onClick={() => handlePrint()}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
              style={glassBtnStyle} onMouseEnter={glassBtnHover} onMouseLeave={glassBtnLeave}
              title="Print QS Internal Bill">
              <Printer size={16} />
            </button>
            <button onClick={handleDownloadPDF}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
              style={glassBtnStyle} onMouseEnter={glassBtnHover} onMouseLeave={glassBtnLeave}
              title="Download PDF">
              <Download size={16} />
            </button>
            {/* Proforma Invoice — before certification */}
            {['submitted', 'verified'].includes(b?.status) && (
              <button
                onClick={() => { setProformaNo(''); setProformaDate(dayjs().format('YYYY-MM-DD')); setShowProformaModal(true); }}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
                style={{ background: Theme.blue.to, color: '#fff' }}
                title="Generate Proforma Invoice">
                <FileSpreadsheet size={14} /> Proforma Invoice
              </button>
            )}

            {/* Tax Invoice — after client certification */}
            {['certified', 'paid'].includes(b?.status) && (
              <button
                onClick={() => { setInvoiceNo(''); setInvoiceDate(dayjs().format('YYYY-MM-DD')); setShowTaxModal(true); }}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-[11px] font-medium transition-colors"
                style={{ background: Theme.amber.to, color: '#fff' }}
                title="Generate Tax Invoice">
                <FileSpreadsheet size={14} /> Tax Invoice
              </button>
            )}

            {/* Workflow action buttons — role-gated */}
            {!rejectedOrPaid && (
              <>
                {/* Reject — shown to QS on submitted, PM on verified, admin always */}
                {((b.status === 'submitted' && CAN_VERIFY.includes(role)) ||
                  (b.status === 'verified' && CAN_CERTIFY.includes(role))) && (
                  <button
                    onClick={() => rejectMut.mutate()}
                    disabled={rejectMut.isPending}
                    className="h-9 px-4 rounded-xl text-[11px] font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(248,113,113,0.16)', border: '1px solid rgba(248,113,113,0.35)', color: '#fecaca' }}
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

                {/* Revert to QS — admin/super_admin only, when certified but not paid */}
                {b.status === 'certified' && ['admin', 'super_admin'].includes(role) && (
                  <button
                    onClick={() => {
                      if (!window.confirm('Send this bill back to QS (verified) for editing? The GL journal entry will be reversed.')) return;
                      revertMut.mutate();
                    }}
                    disabled={revertMut.isPending}
                    className="h-9 px-4 rounded-xl text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    style={{ background: 'rgba(251,191,36,0.16)', border: '1px solid rgba(251,191,36,0.35)', color: '#fde68a' }}
                  >
                    <XCircle size={14} />
                    {revertMut.isPending ? 'Reverting…' : 'Revert to QS'}
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
          </>
        }
      />

      <div className="px-6 py-5 space-y-5">

        {/* ── Lifecycle stepper ── */}
        <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
          <SectionTitle>Approval Lifecycle</SectionTitle>
          <div className="flex items-center mt-1">
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
                                'bg-white border-[#d8dce1] text-[#8e94a3]'
                    )}
                    style={active ? { background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})`, borderColor: Theme.navy, color: '#fff', boxShadow: `0 0 0 4px ${Theme.navy}1a` } : undefined}
                    >
                      {passed ? <CheckCircle2 size={16} /> : <SIcon size={15} />}
                    </div>
                    <div className={clsx(
                      'text-[9px] font-medium uppercase tracking-wider mt-2',
                      isRej ? 'text-red-500' : passed ? 'text-emerald-500' : !active ? 'text-[#b0b5c3]' : ''
                    )}
                    style={active ? { color: Theme.navy } : undefined}>
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
            <div>
              <div className="flex items-center gap-2 mb-3">
                <SectionTitle>Line Item Breakdown</SectionTitle>
                <span className="text-[9px] font-medium text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full ml-auto">
                  {(b.items || []).length} items
                </span>
              </div>
              <RichTable>
                <thead>
                  <RichTable.HeaderRow>
                    <RichTable.Th className="w-8">#</RichTable.Th>
                    <RichTable.Th>Specification</RichTable.Th>
                    <RichTable.Th align="right">Rate</RichTable.Th>
                    <RichTable.Th align="right">Previous</RichTable.Th>
                    <RichTable.Th align="right">Current</RichTable.Th>
                    <RichTable.Th align="right">Amount</RichTable.Th>
                  </RichTable.HeaderRow>
                </thead>
                <tbody>
                  {(b.items || []).length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-xs text-slate-400">No items found</td></tr>
                  )}
                  {(b.items || []).map((it, idx) => {
                    const value = it.amount || (it.current_qty * it.rate);
                    return (
                      <RichTable.Row key={idx}>
                        <RichTable.Td bold={false} color={Theme.textFaint} className="font-mono text-[11px]">
                          {String(idx + 1).padStart(2, '0')}
                        </RichTable.Td>
                        <RichTable.Td>
                          <div className="text-[13px] leading-relaxed" style={{ color: Theme.textDark }}>{it.description}</div>
                          <span
                            className="inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                            style={{ color: Theme.navy, background: `${Theme.navy}0f` }}
                          >
                            {it.unit}
                          </span>
                        </RichTable.Td>
                        <RichTable.Td mono align="right" color={Theme.textMuted}>{inr(it.rate)}</RichTable.Td>
                        <RichTable.Td mono align="right" bold={false} color={Theme.textFaint}>
                          {(it.prev_certified_qty || 0).toLocaleString()}
                        </RichTable.Td>
                        <RichTable.Td mono align="right" color={Theme.navy}>
                          {(it.current_qty || 0).toLocaleString()}
                        </RichTable.Td>
                        <RichTable.Td mono align="right" className="text-[13px]">{inr(value)}</RichTable.Td>
                      </RichTable.Row>
                    );
                  })}
                </tbody>
                {(b.items || []).length > 0 && (
                  <tfoot>
                    <tr style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                      <td colSpan={5} className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-right"
                        style={{ color: 'rgba(255,255,255,0.65)' }}>
                        Gross Valuation
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[16px] font-semibold" style={{ color: Theme.gold }}>
                        {inr(b.gross_amount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </RichTable>
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

                <div className="rounded-xl px-4 py-4 mt-3"
                  style={{ background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})` }}>
                  <div className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Total Certified Disbursement
                  </div>
                  <div className="text-[26px] font-medium font-mono leading-none" style={{ color: Theme.gold, textShadow: '0 1px 2px rgba(0,0,0,0.30)' }}>
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

      {/* Print zone — QS Internal Bill */}
      <div className="ra-bill-print-zone">
        <RABillPrintTemplate ref={printRef} data={b} variations={variations} audit={audit} />
      </div>

      {/* Print zone — Client RA Bill (professional format) */}
      <div className="ra-bill-print-zone">
        <RABillClientTemplate ref={clientBillRef} data={b} />
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
            <div style={{ width: PROFORMA_W * previewScale, height: A4_H * previewScale }}>
              <div style={{ width: PROFORMA_W, transform: `scale(${previewScale})`, transformOrigin: 'top left', boxShadow: '0 4px 32px rgba(0,0,0,0.18)', background: '#fff' }}>
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
