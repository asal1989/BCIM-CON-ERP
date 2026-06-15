// src/pages/procurement/ComparativeStatementPage.jsx
import React, { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Check, Printer, UserCheck, ChevronRight, ShoppingCart, Plus,
  Award, Building2, FileText, IndianRupee,
} from 'lucide-react';
import { quotationAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import SignaturePadModal from '../../components/common/SignaturePadModal';

const STAGES = [
  { id: 'verify',  label: 'Procurement Verify', status: 'pending_verification' },
  { id: 'check',   label: 'Finance Check',       status: 'pending_finance' },
  { id: 'approve', label: 'MD Approval',         status: 'pending_approval' },
];

const fmt  = d  => d ? dayjs(d).format('DD.MM.YYYY') : '—';
const inr  = v  => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = v  => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function ComparativeStatementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printRef  = useRef();
  const scrollRef = useRef();   // the scrollable wrapper around the comparison table

  const scroll = useCallback((dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 300, behavior: 'smooth' });
    }
  }, []);

  const [selectedVendorId, setSelectedVendorId] = useState(null);
  // negotiatedRates[vendorId][mrs_item_id] = negotiated rate string
  const [negotiatedRates, setNegotiatedRates] = useState({});
  // signatures[key] = { dataUrl, signedAt, name }
  const [signatures, setSignatures] = useState({});
  const [activeSigModal, setActiveSigModal] = useState(null); // { key, name, role }
  const [terms, setTerms] = useState({
    payment: '100% Advance',
    delivery: 'Immediate',
    transport: 'Extra at actuals',
    workPlace: '',
    billReq: 'Bill must carry details of Specific Work order number, site acceptance signature along with seal, Bill number, GST No. & HSN Code / LUT Details etc.',
  });
  const [editTerms, setEditTerms] = useState(false);
  const [signerNames, setSignerNames] = useState({
    checked: '',
    procurement: '',
    approved: '',
  });

  const { data: csData, isLoading } = useQuery({
    queryKey: ['comparative-statement', id],
    queryFn: () => quotationAPI.getCS(id).then(r => r.data?.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  const { indent = {}, items = [], vendors = [], vendorSummary = [], recommendedVendor = null, itemL1 = [], existingPO = null } = csData || {};
  const currentStage = STAGES.find(s => s.status === indent.cs_status);
  const isApproved   = indent.cs_status === 'approved';

  React.useEffect(() => {
    if (!selectedVendorId && recommendedVendor?.vendor_id) {
      setSelectedVendorId(recommendedVendor.vendor_id);
    }
  }, [recommendedVendor?.vendor_id, selectedVendorId]);

  const approveMut = useMutation({
    mutationFn: ({ stage, data }) => {
      if (stage === 'verify')  return quotationAPI.verifyCS(id);
      if (stage === 'check')   return quotationAPI.checkCS(id);
      if (stage === 'approve') return quotationAPI.approveCS(id, data);
    },
    onSuccess: () => {
      toast.success('CS stage authorized successfully');
      qc.invalidateQueries({ queryKey: ['comparative-statement', id] });
      qc.invalidateQueries({ queryKey: ['mrs-for-cs'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Authorization failed'),
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto bg-[#f4f6f9] min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 bg-slate-200 rounded-lg" />
          <div className="h-96 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  // Get negotiated rate for a vendor+item (fallback to quoted rate)
  const getNegRate = (vendorId, itemId) => {
    const nr = negotiatedRates[vendorId]?.[itemId];
    if (nr !== undefined && nr !== '') return parseFloat(nr);
    const vi = vendors.find(v => v.vendor_id === vendorId || v.id === vendorId);
    const it = vi?.items?.find(x => x.mrs_item_id === itemId);
    return parseFloat(it?.rate || 0);
  };

  const setNegRate = (vendorId, itemId, val) => {
    setNegotiatedRates(p => ({
      ...p,
      [vendorId]: { ...(p[vendorId] || {}), [itemId]: val },
    }));
  };

  const getVendorNegTotal = (v) =>
    items.reduce((sum, item) => {
      const rate = getNegRate(v.vendor_id || v.id, item.id);
      return sum + rate * parseFloat(item.quantity || 0);
    }, 0);

  const getVendorQuotedTotal = (v) =>
    (v.items || []).reduce((sum, it) => {
      const itemCfg = items.find(ii => ii.id === it.mrs_item_id);
      const qty = parseFloat(itemCfg?.quantity || 0);
      return sum + qty * parseFloat(it.rate || 0);
    }, 0);

  const getL1VendorId = () => {
    if (!vendors.length) return null;
    let minTotal = Infinity, minId = null;
    for (const v of vendors) {
      const t = getVendorNegTotal(v);
      if (t > 0 && t < minTotal) { minTotal = t; minId = v.vendor_id || v.id; }
    }
    return minId;
  };

  const l1VendorId = getL1VendorId();
  const effectiveL1VendorId = recommendedVendor?.vendor_id || l1VendorId;
  const itemL1Map = new Map(itemL1.map(row => [row.item_id, row]));

  const handleSignOff = () => {
    if (currentStage?.id === 'approve' && !(selectedVendorId || effectiveL1VendorId))
      return toast.error('Select the recommended (L1) vendor first');
    approveMut.mutate({
      stage: currentStage.id,
      data:  currentStage.id === 'approve' ? { selected_vendor_id: selectedVendorId || effectiveL1VendorId } : {},
    });
  };

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>Rate Approval - ${indent.serial_no_formatted || indent.mrs_number || ''}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #000; background: #fff; }
        @page { size: A3 landscape; margin: 10mm; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
        .no-print { display: none !important; }
        img { max-width: 100%; }
      </style>
      </head><body>${printContents}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  // Sort vendors by negotiated total ascending → assign L1, L2, L3…
  const vendorsSorted = [...vendors].sort((a, b) => {
    const ta = getVendorNegTotal(a), tb = getVendorNegTotal(b);
    if (ta === 0) return 1; if (tb === 0) return -1;
    return ta - tb;
  });
  const getLevelLabel = (v) => {
    const idx = vendorsSorted.findIndex(x => (x.vendor_id || x.id) === (v.vendor_id || v.id));
    return idx >= 0 ? `L${idx + 1}` : '—';
  };

  const colCount = 6 + vendors.length * 4; // rough

  return (
    <div className="bg-[#f4f6f9] min-h-screen">
      {/* Scrollbar styling — always visible, indigo theme */}
      <style>{`
        .cs-scroll::-webkit-scrollbar { height: 10px; }
        .cs-scroll::-webkit-scrollbar-track { background: #e2e8f0; border-radius: 9999px; }
        .cs-scroll::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 9999px; }
        .cs-scroll::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
        @media print { .no-print { display: none !important; } }
      `}</style>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/procurement/quotations')}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-300 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-medium text-slate-800">Comparative Rate Approval</h1>
            <p className="text-xs text-slate-400">
              {indent.serial_no_formatted || indent.mrs_number}
              {vendors.length > 0 && <span className="ml-2 text-indigo-500 font-semibold">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''} quoted</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Workflow pills */}
          <div className="flex items-center gap-1">
            {STAGES.map((s, idx) => {
              const stageIdx = STAGES.findIndex(x => x.status === indent.cs_status);
              const done   = isApproved || idx < stageIdx;
              const active = s.status === indent.cs_status;
              return (
                <React.Fragment key={s.id}>
                  <span className={clsx(
                    'px-2.5 py-1 rounded-full text-[11px] font-medium border',
                    done   ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    active ? 'bg-indigo-100 border-indigo-300 text-indigo-700' :
                             'bg-slate-50 border-slate-200 text-slate-400'
                  )}>
                    {done ? '✓ ' : ''}{s.label}
                  </span>
                  {idx < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </React.Fragment>
              );
            })}
            {isApproved && (
              <span className="ml-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-100 border border-emerald-300 text-emerald-700">
                ✓ Approved
              </span>
            )}
          </div>

          {isApproved && (() => {
            // If PO already raised — show a "View PO" badge instead
            if (existingPO) {
              return (
                <button
                  onClick={() => navigate(`/procurement/po?highlight=${existingPO.id}`)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-all shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  PO Raised — {existingPO.serial_no_formatted || existingPO.po_number}
                </button>
              );
            }
            // No PO yet — show Create PO button
            const selVendor = vendors.find(v => v.is_selected || (v.vendor_id || v.id) === indent.selected_vendor_id);
            const l1Items = selVendor ? items.map(item => ({
              material_name: item.material_name,
              quantity: String(item.quantity || ''),
              unit: item.unit || 'Nos',
              rate: String(getNegRate(selVendor.vendor_id || selVendor.id, item.id) || ''),
              gst_rate: String(selVendor.items?.find(x => x.mrs_item_id === item.id)?.gst_rate || '18'),
              hsn_code: selVendor.items?.find(x => x.mrs_item_id === item.id)?.hsn_code || '',
            })) : [];
            return (
              <button
                onClick={() => navigate('/procurement/po', {
                  state: {
                    fromCS: {
                      mrs_id: id,
                      vendor_id: selVendor?.vendor_id || selVendor?.id,
                      vendor_name: selVendor?.vendor_name,
                      project_id: indent.project_id,
                      project_name: indent.project_name,
                      mrs_ref: indent.serial_no_formatted || indent.mrs_number,
                      items: l1Items,
                    }
                  }
                })}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Create PO for L1 Vendor
              </button>
            );
          })()}

          {!isApproved && (
            <button
              onClick={() => navigate(`/procurement/quotations/entry/${id}`)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add Vendor Quote
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>

          {currentStage && !isApproved && (
            <button
              onClick={handleSignOff}
              disabled={approveMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-60"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {approveMut.isPending ? 'Authorizing…' : `Authorize — ${currentStage.label}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Printable Document ──────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-6 pt-5 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <DecisionCard icon={Award} label="Recommended L1 Vendor" value={recommendedVendor?.vendor_name || 'Not available'} sub={recommendedVendor ? `${recommendedVendor.level} · Rs ${inr0(recommendedVendor.grand_total)}` : 'Enter vendor quotes to rank'} tone="emerald" />
          <DecisionCard icon={IndianRupee} label="Lowest Grand Total" value={recommendedVendor ? `Rs ${inr0(recommendedVendor.grand_total)}` : 'Rs 0'} sub={`Basic Rs ${inr0(recommendedVendor?.basic_total || 0)} · GST Rs ${inr0(recommendedVendor?.gst_total || 0)}`} tone="indigo" />
          <DecisionCard icon={Building2} label="Vendors Compared" value={String(vendors.length)} sub={`${vendorSummary.length} quotation${vendorSummary.length === 1 ? '' : 's'} received`} tone="blue" />
          <DecisionCard icon={FileText} label="Item-wise L1" value={`${itemL1.length}/${items.length}`} sub="Lowest item rates identified" tone="amber" />
        </div>
        {vendorSummary.length > 0 && (
          <div className="mt-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-900 uppercase tracking-wide">Vendor Ranking Summary</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-700 uppercase">
                  <tr>{['Rank', 'Vendor', 'Basic', 'Discount', 'GST', 'Grand Total', 'Delivery', 'Payment'].map(h => <th key={h} className="px-4 py-2 text-left whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorSummary.map(v => (
                    <tr key={v.vendor_id} className={v.rank === 1 ? 'bg-emerald-50/60' : 'bg-white'}>
                      <td className="px-4 py-2 font-bold text-slate-900">{v.level}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">{v.vendor_name}</td>
                      <td className="px-4 py-2 font-mono">Rs {inr0(v.basic_total)}</td>
                      <td className="px-4 py-2 font-mono">Rs {inr0(v.discount_total)}</td>
                      <td className="px-4 py-2 font-mono">Rs {inr0(v.gst_total)}</td>
                      <td className="px-4 py-2 font-mono font-bold text-indigo-700">Rs {inr0(v.grand_total)}</td>
                      <td className="px-4 py-2">{v.delivery_days ? `${v.delivery_days} days` : '-'}</td>
                      <td className="px-4 py-2">{v.payment_terms || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 max-w-[1600px] mx-auto">

        {/* Scroll arrow buttons — hidden on print */}
        <div className="no-print flex items-center justify-between mb-2 gap-2">
          <button
            onClick={() => scroll(-1)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs font-medium shadow-sm hover:bg-slate-50 hover:border-indigo-300 transition-all"
          >
            ◀ Scroll Left
          </button>
          <span className="text-xs text-slate-400">← Swipe or use arrows to see all vendors →</span>
          <button
            onClick={() => scroll(1)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs font-medium shadow-sm hover:bg-slate-50 hover:border-indigo-300 transition-all"
          >
            Scroll Right ▶
          </button>
        </div>

        <div ref={printRef} className="bg-white shadow-lg rounded-xl">

          {/* ═══ DOCUMENT HEADER ═══════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr>
                {/* Logo + company */}
                <td style={{ border: '1.5px solid #000', padding: '6px 10px', width: '18%', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src="/bcim-logo.png" alt="BCIM" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#c0392b' }}>BCIM</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', lineHeight: '1.3' }}>
                        BCIM ENGINEERING<br />PRIVATE LIMITED
                      </div>
                    </div>
                  </div>
                </td>

                {/* Title */}
                <td colSpan={3} style={{ border: '1.5px solid #000', padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
                    COMPANY: BCIM ENGINEERING PRIVATE LIMITED
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    <strong>PROJECT:</strong> {indent.project_name || '—'} &nbsp;|&nbsp;
                    <strong>SUBJECT: COMMERCIAL RATE APPROVAL</strong>
                  </div>
                  <div style={{ fontSize: '10px', marginTop: '2px' }}>
                    <strong>RATE APPROVAL NO.:</strong> {indent.serial_no_formatted || indent.mrs_number || '—'}
                    &nbsp;&nbsp;|&nbsp;&nbsp;
                    <strong>BUDGET CODE:</strong> &nbsp;&nbsp;
                  </div>
                </td>

                {/* Meta */}
                <td style={{ border: '1.5px solid #000', padding: '6px 10px', width: '20%', fontSize: '10px', verticalAlign: 'top' }}>
                  <div><strong>DATE:</strong> {fmt(indent.created_at)}</div>
                  <div style={{ marginTop: '3px' }}><strong>Indent No./Dt:</strong> {indent.serial_no_formatted || indent.mrs_number}</div>
                  <div style={{ marginTop: '3px' }}><strong>LOCATION:</strong> {indent.head_office_project_name || indent.project_name || '—'}</div>
                  <div style={{ marginTop: '3px' }}><strong>Department:</strong> {indent.department || '—'}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ═══ VENDOR CONTACT CARDS ══════════════════════════════ */}
          <div
            ref={scrollRef}
            className="cs-scroll"
            style={{
              overflowX: 'auto',
              overflowY: 'visible',
              scrollbarWidth: 'auto',          /* Firefox: always show */
              scrollbarColor: '#6366f1 #e2e8f0',
              paddingBottom: '4px',
            }}
          >
          <table style={{ width: '100%', minWidth: `${390 + vendors.length * 340 + 90}px`, borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '160px' }} />{/* Description */}
              <col style={{ width: '50px' }} />{/* Units */}
              <col style={{ width: '40px' }} />{/* Qty */}
              <col style={{ width: '60px' }} />{/* Prev Rate */}
              <col style={{ width: '60px' }} />{/* Prev Amt */}
              {vendors.map(v => (
                <React.Fragment key={v.id}>
                  <col style={{ width: '55px' }} />{/* Specs */}
                  <col style={{ width: '68px' }} />{/* Quoted Rate */}
                  <col style={{ width: '68px' }} />{/* Quoted Total */}
                  <col style={{ width: '68px' }} />{/* Neg Rate */}
                  <col style={{ width: '68px' }} />{/* Neg Total */}
                </React.Fragment>
              ))}
              <col style={{ width: '80px' }} />{/* Recommended */}
            </colgroup>
            <tbody>
              <tr>
                {/* Left label */}
                <td style={{ border: '1.5px solid #000', padding: '5px 8px', fontWeight: 'bold', verticalAlign: 'top', background: '#f0f0f0' }}>
                  Description
                </td>
                <td style={{ border: '1.5px solid #000', padding: '5px 8px', fontWeight: 'bold', background: '#f0f0f0', verticalAlign: 'top' }}>Units</td>
                <td style={{ border: '1.5px solid #000', padding: '5px 8px', fontWeight: 'bold', background: '#f0f0f0', textAlign: 'center', verticalAlign: 'top' }}>Qty</td>
                <td colSpan={2} style={{ border: '1.5px solid #000', padding: '5px 8px', background: '#f0f0f0', textAlign: 'center', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold' }}>Previous Reference</div>
                  <div style={{ fontSize: '9px', color: '#555' }}>(if any)</div>
                </td>

                {/* One cell per vendor — colSpan=5 to match 5 sub-columns */}
                {vendors.map((v, vi) => (
                  <td key={v.id} colSpan={5} style={{ border: '1.5px solid #000', padding: '5px 8px', textAlign: 'center', verticalAlign: 'top', background: vi % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11px' }}>M/s. {v.vendor_name}</div>
                    {v.notes && <div style={{ fontSize: '9px', marginTop: '2px', color: '#333' }}>{v.notes}</div>}
                    <div style={{ marginTop: '3px', fontSize: '9px' }}>
                      <div><strong>Quote Ref:</strong> {v.quotation_number}</div>
                      <div><strong>GST No:</strong> &nbsp;</div>
                    </div>
                  </td>
                ))}

                <td style={{ border: '1.5px solid #000', padding: '5px 8px', fontWeight: 'bold', background: '#e8e8e8', textAlign: 'center', verticalAlign: 'top', width: '8%' }}>
                  Recommended<br />Grand Total (Rs/-)
                </td>
              </tr>

              {/* Sub-header row — 5 cols per vendor: Specs | Quoted Rate | Quoted Total | Neg Rate | Neg Total */}
              <tr style={{ background: '#e0e0e0', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>Prev Rate</td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>Prev Amt</td>
                {vendors.map(v => (
                  <React.Fragment key={v.id}>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', wordBreak: 'break-word' }}>Specs</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', wordBreak: 'break-word' }}>Quoted Rate</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', wordBreak: 'break-word' }}>Total Value</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', background: '#fffde7', wordBreak: 'break-word' }}>Neg. Rate</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', background: '#fffde7', wordBreak: 'break-word' }}>Neg. Total</td>
                  </React.Fragment>
                ))}
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>Total</td>
              </tr>

              {/* ── Item rows ── */}
              {items.map((item, idx) => {
                // Find recommended grand total = L1 vendor negotiated value for this item
                const l1Neg = getNegRate(effectiveL1VendorId, item.id) * parseFloat(item.quantity || 0);

                return (
                  <tr key={item.id} style={{ fontSize: '10px' }}>
                    {/* Description */}
                    <td style={{ border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 'bold' }}>{idx + 1}. {item.material_name}</div>
                      {item.purpose && <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>{item.purpose}</div>}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle' }}>{item.unit}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle' }}>{item.quantity}</td>
                    {/* Previous */}
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', verticalAlign: 'middle', color: '#888' }}>—</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', verticalAlign: 'middle', color: '#888' }}>—</td>

                    {/* Per-vendor cells */}
                    {vendors.map(v => {
                      const vId  = v.vendor_id || v.id;
                      const qi   = v.items?.find(x => x.mrs_item_id === item.id);
                      const qRate = parseFloat(qi?.rate || 0);
                      const qTotal = qRate * parseFloat(item.quantity || 0);
                      const negKey = `${vId}_${item.id}`;
                      const negVal = negotiatedRates[vId]?.[item.id] ?? '';
                      const negRate = negVal !== '' ? parseFloat(negVal) : qRate;
                      const negTotal = negRate * parseFloat(item.quantity || 0);
                      const isL1 = vId === effectiveL1VendorId && negTotal > 0;

                      return (
                        <React.Fragment key={v.id}>
                          <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: '9px', verticalAlign: 'top' }}>
                            {qi?.remarks || '—'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', verticalAlign: 'middle' }}>
                            {qRate > 0 ? inr(qRate) : '—'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold' }}>
                            {qTotal > 0 ? inr0(qTotal) : '—'}
                          </td>
                          {/* Editable negotiated rate */}
                          <td style={{ border: '1px solid #000', padding: '2px', background: '#fffde7', verticalAlign: 'middle' }}>
                            <input
                              type="number"
                              value={negVal}
                              placeholder={qRate > 0 ? inr(qRate) : '0'}
                              onChange={e => setNegRate(vId, item.id, e.target.value)}
                              style={{
                                width: '100%', border: 'none', background: 'transparent',
                                textAlign: 'right', fontSize: '10px', outline: 'none',
                                fontWeight: isL1 ? 'bold' : 'normal',
                                color: isL1 ? '#1a7a1a' : '#000',
                              }}
                            />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', background: isL1 ? '#e8f5e9' : 'transparent' }}>
                            {negTotal > 0 ? inr0(negTotal) : '—'}
                            {isL1 && <div style={{ fontSize: '8px', color: '#1a7a1a', fontWeight: 'bold' }}>★ L1</div>}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Recommended (L1 value) */}
                    <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', fontWeight: 'bold', background: '#e8f5e9', verticalAlign: 'middle' }}>
                      {l1Neg > 0 ? inr0(l1Neg) : '—'}
                    </td>
                  </tr>
                );
              })}

              {/* Transportation row */}
              <tr style={{ fontSize: '10px', background: '#fafafa' }}>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Transportation Charges</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>LS</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>1</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', color: '#888' }}>—</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', color: '#888' }}>—</td>
                {vendors.map(v => (
                  <React.Fragment key={v.id}>
                    <td style={{ border: '1px solid #000' }} />
                    <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', color: '#888' }}>Extra</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', color: '#888' }}>Extra</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', color: '#888', background: '#fffde7' }}>Extra at actuals</td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', color: '#888', background: '#fffde7' }}>—</td>
                  </React.Fragment>
                ))}
                <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', color: '#888' }}>Extra at actuals</td>
              </tr>

              {/* ── Summary rows ── */}
              {[
                { label: 'Total (Revision 0)', key: 'quoted',     bg: '#f5f5f5' },
                { label: 'Discount %',          key: 'discount',   bg: '#fff' },
                { label: 'Total (Revision 1)',   key: 'negotiated', bg: '#f5f5f5' },
                { label: 'GST',                  key: 'gst',        bg: '#fff' },
                { label: 'Recommended Grand Total in Rs/-', key: 'grand', bg: '#d0d0d0' },
              ].map(row => (
                <tr key={row.label} style={{ fontSize: '10px', background: row.bg, fontWeight: row.key === 'grand' ? 'bold' : 'normal' }}>
                  <td colSpan={3} style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', fontSize: '9px' }}>
                    {row.label}
                  </td>
                  <td colSpan={2} style={{ border: '1px solid #000' }} />
                  {vendors.map(v => {
                    const qTotal  = getVendorQuotedTotal(v);
                    const negTotal = getVendorNegTotal(v);
                    const vi = v.items?.[0];
                    const gstPct = vi?.gst_rate || 18;
                    const isInclusive = true; // or detect from items

                    let cellQ = '', cellN = '';
                    if (row.key === 'quoted')     { cellQ = qTotal > 0 ? inr0(qTotal) : '—'; cellN = negTotal > 0 ? inr0(negTotal) : '—'; }
                    if (row.key === 'discount')   { cellQ = '0%'; cellN = '0%'; }
                    if (row.key === 'negotiated') { cellQ = qTotal > 0 ? inr0(qTotal) : '—'; cellN = negTotal > 0 ? inr0(negTotal) : '—'; }
                    if (row.key === 'gst')        { cellQ = 'Inclusive'; cellN = 'Inclusive'; }
                    if (row.key === 'grand')      { cellQ = qTotal > 0 ? inr0(qTotal) : '—'; cellN = negTotal > 0 ? inr0(negTotal) : '—'; }

                    const vId   = v.vendor_id || v.id;
                    const isL1v = vId === effectiveL1VendorId;
                    return (
                      <React.Fragment key={v.id}>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}></td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>{cellQ}</td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>{cellQ}</td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', background: '#fffde7' }}></td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', background: row.key === 'grand' && isL1v ? '#c8e6c9' : '#fffde7', fontWeight: isL1v ? 'bold' : 'normal', color: isL1v ? '#1a7a1a' : '#000' }}>
                          {cellN}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Recommended column */}
                  <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', background: row.key === 'grand' ? '#b8dbb8' : '#e8f5e9', fontWeight: 'bold' }}>
                    {row.key === 'gst' ? 'Inclusive' :
                     row.key === 'discount' ? '0%' :
                     effectiveL1VendorId ? inr0(getVendorNegTotal(vendors.find(v => (v.vendor_id || v.id) === effectiveL1VendorId) || {})) : '—'}
                  </td>
                </tr>
              ))}

              {/* LEVEL row */}
              <tr style={{ fontSize: '10px', fontWeight: 'bold', background: '#e0e0e0' }}>
                <td colSpan={5} style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}>LEVEL</td>
                {vendors.map((v, vi) => {
                  const label = getLevelLabel(v);
                  const isL1v = label === 'L1';
                  return (
                    <React.Fragment key={v.id}>
                      <td colSpan={3} style={{ border: '1px solid #000' }} />
                      <td colSpan={2} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: isL1v ? '#c8e6c9' : '#fff' }}>
                        {/* Approval selector */}
                        {indent.cs_status === 'pending_approval' && !isApproved && (
                          <button
                            onClick={() => setSelectedVendorId(v.vendor_id || v.id)}
                            className="no-print"
                            style={{
                              marginRight: '6px', width: '18px', height: '18px',
                              borderRadius: '50%', border: selectedVendorId === (v.vendor_id || v.id) ? '2px solid #1565c0' : '2px solid #aaa',
                              background: selectedVendorId === (v.vendor_id || v.id) ? '#1565c0' : '#fff',
                              color: '#fff', fontSize: '10px', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {selectedVendorId === (v.vendor_id || v.id) ? '✓' : ''}
                          </button>
                        )}
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: isL1v ? '#1a7a1a' : '#555' }}>{label}</span>
                        {v.is_selected && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#1a7a1a' }}>✓ Selected</span>}
                      </td>
                    </React.Fragment>
                  );
                })}
                <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', background: '#b8dbb8' }}>
                  {effectiveL1VendorId ? 'L1' : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          </div>{/* end overflowX wrapper */}

          {/* ═══ TERMS & CONDITIONS ════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '-1px' }}>
            <tbody>
              <tr>
                <td colSpan={4} style={{ border: '1.5px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#e0e0e0' }}>
                  Terms &amp; Conditions
                  <button
                    onClick={() => setEditTerms(!editTerms)}
                    className="no-print"
                    style={{ marginLeft: '10px', fontSize: '9px', color: '#1565c0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'normal' }}
                  >
                    {editTerms ? '✓ Done' : '✎ Edit'}
                  </button>
                </td>
              </tr>

              {[
                { n: 1, label: 'Payment Terms', key: 'payment' },
                { n: 2, label: 'Delivery',       key: 'delivery' },
                { n: 3, label: 'Transportation', key: 'transport' },
                { n: 4, label: 'Work Place',     key: 'workPlace' },
                { n: 7, label: 'Bill Requirement', key: 'billReq' },
              ].map(t => (
                <tr key={t.n}>
                  <td style={{ border: '1px solid #000', padding: '3px 6px', width: '3%', textAlign: 'center' }}>{t.n}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 6px', width: '15%', fontWeight: 'bold' }}>{t.label}</td>
                  <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 6px' }}>
                    {editTerms ? (
                      <input
                        value={terms[t.key]}
                        onChange={e => setTerms(p => ({ ...p, [t.key]: e.target.value }))}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '10px' }}
                      />
                    ) : terms[t.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ═══ SIGNATURE BLOCK ═══════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '-1px' }}>
            <tbody>
              <tr>
                <td colSpan={3} style={{ border: '1.5px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#e0e0e0', textAlign: 'center' }}>
                  RATE APPROVAL COMMITTEE
                </td>
              </tr>
              <tr>
                {[
                  { key: 'checked',     role: 'Checked by',             },
                  { key: 'procurement', role: 'Procurement Department',  },
                  { key: 'approved',    role: 'Approved by',             },
                ].map(sig => {
                  const saved = signatures[sig.key];
                  return (
                    <td key={sig.key} style={{ border: '1px solid #000', padding: '8px 10px', width: '33.33%', textAlign: 'center', height: '90px', verticalAlign: 'bottom' }}>

                      {/* Signature image or placeholder */}
                      <div style={{ minHeight: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                        {saved ? (
                          <div style={{ position: 'relative' }}>
                            <img
                              src={saved.dataUrl}
                              alt={`${sig.name} signature`}
                              style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }}
                            />
                            {/* Clear button — screen only */}
                            <button
                              className="no-print"
                              onClick={() => setSignatures(p => { const n = {...p}; delete n[sig.key]; return n; })}
                              style={{
                                position: 'absolute', top: '-6px', right: '-6px',
                                background: '#ef4444', border: 'none', borderRadius: '50%',
                                width: '16px', height: '16px', cursor: 'pointer',
                                color: '#fff', fontSize: '10px', lineHeight: '16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >×</button>
                          </div>
                        ) : (
                          <button
                            className="no-print"
                            onClick={() => setActiveSigModal(sig)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '5px',
                              padding: '6px 14px', borderRadius: '8px',
                              border: '1.5px dashed #6366f1', background: '#eef2ff',
                              color: '#4f46e5', fontSize: '11px', fontWeight: '600',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ fontSize: '14px' }}>✍</span> Sign Here
                          </button>
                        )}
                      </div>

                      {/* Underline + name + role */}
                      <div style={{ borderTop: '1px solid #000', marginBottom: '3px', width: '75%', marginLeft: 'auto', marginRight: 'auto' }} />
                      <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                        {signerNames[sig.key] || <span style={{ color: '#aaa', fontStyle: 'italic' }}>—</span>}
                      </div>
                      <input
                        className="no-print"
                        value={signerNames[sig.key]}
                        onChange={e => setSignerNames(p => ({ ...p, [sig.key]: e.target.value }))}
                        placeholder="Enter name…"
                        style={{ display: 'block', width: '90%', margin: '2px auto 0', fontSize: '10px', border: '1px dashed #ccc', borderRadius: '4px', padding: '2px 6px', textAlign: 'center', outline: 'none' }}
                      />
                      <div style={{ fontSize: '9px', color: '#555' }}>{sig.role}</div>
                      {saved && (
                        <div style={{ fontSize: '8px', color: '#888', marginTop: '2px' }}>
                          Signed: {saved.signedAt}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>

        </div>{/* end printable doc */}
      </div>

      {/* ── Signature Pad Modal ─────────────────────────────────── */}
      {activeSigModal && (
        <SignaturePadModal
          title={activeSigModal.name}
          subtitle={activeSigModal.role}
          onSave={(dataUrl) => {
            setSignatures(p => ({
              ...p,
              [activeSigModal.key]: {
                dataUrl,
                signedAt: dayjs().format('DD MMM YYYY HH:mm'),
                name: activeSigModal.name,
              },
            }));
            toast.success(`Signature captured for ${activeSigModal.role}`);
          }}
          onClose={() => setActiveSigModal(null)}
        />
      )}
    </div>
  );
}

function DecisionCard({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-lg font-extrabold text-slate-950 truncate">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{sub}</p>
        </div>
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', tones[tone] || tones.indigo)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
