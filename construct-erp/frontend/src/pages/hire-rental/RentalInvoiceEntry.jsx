import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Check, ChevronRight, ChevronLeft, FileText, Layers, CreditCard,
  BookOpen, BarChart3, AlertTriangle, Upload, X, CheckCircle,
  Clock, XCircle, Info, Plus, Trash2,
} from 'lucide-react';
import { RENTAL_CATEGORIES, getCategoryByCode, billNumber, qsCertNumber } from '../../config/RentalCategoryMaster';

// ── Formatters ────────────────────────────────────────────────────────────────

const inr = v =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const n = v => (v === '' || v == null ? 0 : Number(v) || 0);

// ── Mock data (used when no live API data is available) ───────────────────────

const MOCK_VENDORS = [
  { id: 'v1', name: 'Sai Crane Services', gstin: '33AABCS1234F1Z5' },
  { id: 'v2', name: 'Lakshmi Equipment Hire', gstin: '33BBBCL4567G2Z3' },
  { id: 'v3', name: 'Raju Transport & Logistics', gstin: '33CCCR7890H3Z1' },
];

const MOCK_WO_LIST = [
  { id: 'wo1', wo_number: 'WO/2526/001', description: 'Crane hire – Block A foundation', project_name: 'Residential Block A', wo_value: 500000, retention_pct: 5, agreed_rate: 2500, agreed_unit: 'Hours', period_from: '2025-04-01', period_to: '2026-03-31' },
  { id: 'wo2', wo_number: 'WO/2526/002', description: 'Hydra hire – Steel erection', project_name: 'Industrial Shed', wo_value: 300000, retention_pct: 5, agreed_rate: 2000, agreed_unit: 'Hours', period_from: '2025-06-01', period_to: '2026-05-31' },
  { id: 'wo3', wo_number: 'WO/2526/003', description: 'DG Set 100 KVA hire', project_name: 'Site Office Complex', wo_value: 180000, retention_pct: 0, agreed_rate: 15000, agreed_unit: 'Monthly', period_from: '2025-07-01', period_to: '2026-06-30' },
];

const MOCK_APPROVERS = [
  { id: 'a1', name: 'K. Suresh', designation: 'Site Engineer' },
  { id: 'a2', name: 'R. Mohan', designation: 'Plant In-charge' },
  { id: 'a3', name: 'M. Krishnan', designation: 'Project Manager' },
  { id: 'a4', name: 'S. Venkat', designation: 'Quantity Surveyor' },
  { id: 'a5', name: 'T. Raman', designation: 'Finance Head' },
];

const MOCK_QS_USERS = [
  { id: 'qs1', name: 'S. Venkat', designation: 'Quantity Surveyor' },
  { id: 'qs2', name: 'P. Anand', designation: 'Sr. QS' },
  { id: 'qs3', name: 'D. Kumar', designation: 'Contracts Manager' },
];

const MOCK_EXISTING_INVOICES = [
  { vendor_id: 'v1', wo_id: 'wo1', period_from: '2025-04-01', period_to: '2025-04-30', bill_no: 'BCIM/CRN/2025-26/001' },
];

const PREV_RA_MAP = { wo1: 120000, wo2: 0, wo3: 45000 };

// ── Steps config ─────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Header',      icon: FileText },
  { label: 'Usage',       icon: Layers },
  { label: 'Deductions',  icon: CreditCard },
  { label: 'Approval',    icon: BookOpen },
  { label: 'Accounting',  icon: BarChart3 },
];

// ── Dynamic field labels ──────────────────────────────────────────────────────

const DYNAMIC_FIELD_LABELS = {
  capacity_tons:        'Capacity (Tons)',
  operator_name:        'Operator Name',
  helper_count:         'No. of Helpers',
  reg_no:              'Vehicle / Reg. No.',
  pump_type:           'Pump Type',
  capacity_lps:        'Capacity (LPS)',
  hours_meter_reading: 'Hours Meter Reading',
  kva_rating:          'KVA Rating',
  fuel_included:       'Fuel Included',
  kwh_reading:         'KWH Reading',
  hours_reading:       'Hours Reading',
  vehicle_no:          'Vehicle No.',
  driver_name:         'Driver Name',
  trip_count:          'Trip Count',
  km_reading:          'KM Reading',
  area_sqft:           'Area (Sqft)',
  floors:              'No. of Floors',
  scaffold_type:       'Scaffold Type',
  slab_thickness:      'Slab Thickness (mm)',
  formwork_type:       'Formwork Type',
  make_model:          'Make / Model',
  serial_no:           'Serial No.',
  meter_reading:       'Meter Reading',
  print_count:         'Print Count',
  capacity_cfm:        'Capacity (CFM)',
  pressure_bar:        'Pressure (Bar)',
  asset_tag:           'Asset Tag',
  department_assigned: 'Department Assigned',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent';
const inpRO = `${inp} bg-slate-50 cursor-default`;

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-slate-400 font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3 mt-5 first:mt-0">
      {children}
    </div>
  );
}

function Alert({ variant = 'warning', children }) {
  const cls = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error:   'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-700',
    info:    'bg-blue-50 border-blue-200 text-blue-800',
  }[variant];
  const Icon = { warning: AlertTriangle, error: AlertTriangle, success: CheckCircle, info: Info }[variant];
  return (
    <div className={`flex items-start gap-2 border rounded-lg p-3 text-sm ${cls}`}>
      <Icon size={15} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const STATUS_STYLE = {
  Pending:  { icon: Clock,        cls: 'text-slate-500 bg-slate-100' },
  Approved: { icon: CheckCircle,  cls: 'text-green-700 bg-green-100' },
  Rejected: { icon: XCircle,      cls: 'text-red-700 bg-red-100' },
  Certified: { icon: CheckCircle, cls: 'text-blue-700 bg-blue-100' },
};

// ── Live Summary Panel ────────────────────────────────────────────────────────

function LiveSummary({ calc }) {
  const rows = [
    { label: 'Gross Amount',    value: calc.grossAmount,      cls: '' },
    { label: '(−) Deductions',  value: calc.totalDeductions,  cls: 'text-red-600' },
    { label: 'Taxable Value',   value: calc.taxableValue,     cls: 'font-semibold' },
    { label: '(+) GST',         value: calc.totalGst,         cls: 'text-green-700' },
    { label: '(−) TDS',         value: calc.tdsAmount,        cls: 'text-red-600' },
    { label: '(−) Retention',   value: calc.retentionAmt,     cls: 'text-red-600' },
  ];
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sticky top-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Live Summary</div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-center text-sm">
            <span className="text-slate-600">{r.label}</span>
            <span className={`font-medium ${r.cls}`}>{inr(r.value)}</span>
          </div>
        ))}
        <div className="border-t border-slate-200 mt-2 pt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-slate-800">Net Payable</span>
            <span className="text-xl font-bold text-amber-600">{inr(calc.netPayable)}</span>
          </div>
        </div>
      </div>
      {calc.woBalance != null && (
        <div className={`mt-3 p-2 rounded-lg text-xs ${calc.taxableValue > calc.woBalance ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          WO Balance: {inr(calc.woBalance)}
          {calc.taxableValue > calc.woBalance && <div className="font-semibold mt-0.5">⚠ Exceeds WO balance!</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RentalInvoiceEntry({
  categoryMaster = RENTAL_CATEGORIES,
  vendorList     = MOCK_VENDORS,
  woList         = MOCK_WO_LIST,
  approverList   = MOCK_APPROVERS,
  linkedLog      = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const stateLinkedLog = location.state?.linkedLog || linkedLog;
  const stateCategory  = location.state?.category  || null;

  const [step, setStep] = useState(0);

  // ── Step 1 — Invoice Header state ──
  const [hdr, setHdr] = useState({
    categoryCode:   stateCategory?.code || '',
    subType:        '',
    invoiceNo:      '',
    invoiceDate:    dayjs().format('YYYY-MM-DD'),
    receiptDate:    dayjs().format('YYYY-MM-DD'),
    vendorId:       '',
    woId:           '',
    siteLocation:   '',
    billNo:         '',
  });

  const category = useMemo(() => getCategoryByCode(hdr.categoryCode) || null, [hdr.categoryCode]);

  const selectedVendor = useMemo(() => vendorList.find(v => v.id === hdr.vendorId) || null, [vendorList, hdr.vendorId]);
  const selectedWO     = useMemo(() => woList.find(w => w.id === hdr.woId) || null, [woList, hdr.woId]);
  const previousRa     = selectedWO ? (PREV_RA_MAP[selectedWO.id] || 0) : 0;
  const woBalance      = selectedWO ? selectedWO.wo_value - previousRa : 0;

  // Auto-generate bill number when category changes
  useEffect(() => {
    if (category) {
      setHdr(h => ({ ...h, billNo: billNumber(category.billPrefix, 1) }));
    }
  }, [category]);

  // ── Step 2 — Usage Details state ──
  const [usage, setUsage] = useState({
    assetDescription: '',
    assetId:          stateLinkedLog?.logRef || '',
    operatorName:     '',
    periodFrom:       '',
    periodTo:         '',
    unit:             '',
    quantity:         '',
    rate:             '',
    dynamicValues:    {},
    uploadedDocs:     {},
  });

  const grossAmount = +(n(usage.quantity) * n(usage.rate)).toFixed(2);

  // Auto-fill unit and rate from WO
  useEffect(() => {
    if (selectedWO && category) {
      setUsage(u => ({
        ...u,
        unit: selectedWO.agreed_unit || category.units[0] || '',
        rate: selectedWO.agreed_rate || '',
      }));
    }
  }, [selectedWO, category]);

  // Mismatch check for CRANE/HYDRA
  const certifiedHrs = stateLinkedLog?.certifiedHrs ?? null;
  const hasMismatch  = certifiedHrs != null && n(usage.quantity) !== certifiedHrs && n(usage.quantity) !== 0;
  const mismatchDiff = certifiedHrs != null ? Math.abs(n(usage.quantity) - certifiedHrs) : 0;

  // ── Step 3 — Deductions & Tax state ──
  const [dedRows, setDedRows] = useState([
    { id: 1, label: 'Advance recovery', qty: '', rate: '', amount: '', reason: 'Mobilization / security' },
  ]);
  const [taxState, setTaxState] = useState({
    gstMode:     'intra',
    sac:         '',
    gstRate:     18,
    tdsSection:  '',
    vendorType:  'company',
    tdsRate:     '',
    retentionPct: '',
  });

  // Sync SAC + TDS from category
  useEffect(() => {
    if (category) {
      setTaxState(t => ({
        ...t,
        sac:        category.sac,
        tdsSection: category.tdsSection,
        tdsRate:    category.tdsRate.company,
        retentionPct: selectedWO?.retention_pct ?? t.retentionPct,
      }));
    }
  }, [category, selectedWO]);

  useEffect(() => {
    if (category && taxState.vendorType) {
      setTaxState(t => ({
        ...t,
        tdsRate: category.tdsRate[t.vendorType] ?? t.tdsRate,
      }));
    }
  }, [taxState.vendorType, category]);

  // Auto-fill deductions from linkedLog
  useEffect(() => {
    if (stateLinkedLog) {
      setDedRows(prev => {
        const next = [...prev];
        const hasIdle = next.some(r => r.label === 'Idle deduction');
        if (!hasIdle) next.push({ id: Date.now(), label: 'Idle deduction', qty: '', rate: '', amount: stateLinkedLog.idleDed || '', reason: 'Per log sheet' });
        const hasBdown = next.some(r => r.label === 'Breakdown deduction');
        if (!hasBdown) next.push({ id: Date.now() + 1, label: 'Breakdown deduction', qty: '', rate: '', amount: stateLinkedLog.bdownDed || '', reason: 'Per log sheet' });
        return next;
      });
    }
  }, [stateLinkedLog]);

  const totalDeductions = +(dedRows.reduce((s, r) => s + n(r.amount), 0)).toFixed(2);
  const taxableValue    = +(grossAmount - totalDeductions).toFixed(2);
  const gstRate         = n(taxState.gstRate);
  const totalGst        = +(taxableValue * gstRate / 100).toFixed(2);
  const tdsAmount       = +(taxableValue * n(taxState.tdsRate) / 100).toFixed(2);
  const retentionAmt    = +(grossAmount * n(taxState.retentionPct) / 100).toFixed(2);
  const netPayable      = +(taxableValue + totalGst - tdsAmount - retentionAmt).toFixed(2);

  const calc = { grossAmount, totalDeductions, taxableValue, totalGst, tdsAmount, retentionAmt, netPayable, woBalance };

  // ── Step 4 — Approvals state ──
  const approvalChain = category?.approvalChain || [];
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    if (approvalChain.length) {
      setApprovals(approvalChain.map(role => ({
        role,
        name: '',
        designation: role,
        date: '',
        status: 'Pending',
        remarks: '',
      })));
    }
  }, [hdr.categoryCode]);

  const activeApprovalIdx = useMemo(() => {
    for (let i = 0; i < approvals.length; i++) {
      if (approvals[i].status === 'Pending') return i;
    }
    return -1;
  }, [approvals]);

  const qsIdx = useMemo(() => approvals.findIndex(a => a.role === 'QS'), [approvals]);

  const [qsChecklist, setQsChecklist] = useState({
    rateMatch: false, qtyMatch: false, periodValid: false, balanceSufficient: false,
    deductionsCorrect: false, taxCorrect: false, docsVerified: false, noDisputes: false,
  });
  const allQsTicked = Object.values(qsChecklist).every(Boolean);

  const [qsCertState, setQsCertState] = useState({
    qsName: '', designation: 'Quantity Surveyor', qsRefNo: qsCertNumber(1),
    certRemarks: '', certStatus: '', recommendedAmount: '',
  });

  const approveApproval = (idx, remarks) => {
    setApprovals(prev => prev.map((a, i) =>
      i === idx ? { ...a, status: 'Approved', date: dayjs().format('DD-MM-YYYY'), remarks } : a
    ));
  };
  const rejectApproval = (idx, remarks) => {
    setApprovals(prev => prev.map((a, i) =>
      i === idx ? { ...a, status: 'Rejected', date: dayjs().format('DD-MM-YYYY'), remarks } : a
    ));
  };

  const allApproved = approvals.length > 0 && approvals.every(a => a.status === 'Approved');

  // ── Step nav ──
  const canAdvance = useMemo(() => {
    if (step === 0) return !!hdr.categoryCode && !!hdr.vendorId && !!hdr.woId;
    if (step === 1) return n(usage.quantity) > 0 && n(usage.rate) > 0 && !hasMismatch;
    if (step === 2) return taxableValue <= woBalance;
    if (step === 3) return allApproved;
    return true;
  }, [step, hdr, usage, hasMismatch, taxableValue, woBalance, allApproved]);

  const handleNext = () => {
    if (!canAdvance) { toast.error('Please resolve all errors before continuing'); return; }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const handleBack = () => setStep(s => Math.max(s - 1, 0));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Step indicator */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-lg font-bold text-slate-800 mb-3">New Rental Invoice — {category?.label || 'Select Category'}</h1>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              const Icon = s.icon;
              return (
                <React.Fragment key={s.label}>
                  <button
                    onClick={() => i < step && setStep(i)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active  ? 'bg-amber-500 text-white' :
                      done    ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer' :
                                'bg-slate-100 text-slate-400 cursor-default'
                    }`}
                  >
                    {done ? <Check size={12} /> : <Icon size={12} />}
                    <span>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — 2 of 3 cols */}
        <div className="lg:col-span-2">

          {/* ── STEP 1: INVOICE HEADER ── */}
          {step === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <SectionTitle>Invoice Header</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Rental Category" required>
                  <select className={inp} value={hdr.categoryCode} onChange={e => setHdr(h => ({ ...h, categoryCode: e.target.value }))}>
                    <option value="">— Select Category —</option>
                    {categoryMaster.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sub-type / Description">
                  <input className={inp} value={hdr.subType} onChange={e => setHdr(h => ({ ...h, subType: e.target.value }))} placeholder="e.g. 50T Crawler Crane" />
                </Field>
                <Field label="Vendor Invoice No." required>
                  <input className={inp} value={hdr.invoiceNo} onChange={e => setHdr(h => ({ ...h, invoiceNo: e.target.value }))} placeholder="Vendor's invoice number" />
                </Field>
                <Field label="Invoice Date" required>
                  <input type="date" className={inp} value={hdr.invoiceDate} onChange={e => setHdr(h => ({ ...h, invoiceDate: e.target.value }))} />
                </Field>
                <Field label="Receipt Date" required>
                  <input type="date" className={inp} value={hdr.receiptDate} onChange={e => setHdr(h => ({ ...h, receiptDate: e.target.value }))} />
                </Field>
                <Field label="Vendor" required>
                  <select className={inp} value={hdr.vendorId} onChange={e => setHdr(h => ({ ...h, vendorId: e.target.value }))}>
                    <option value="">— Select Vendor —</option>
                    {vendorList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </Field>
                <Field label="Vendor GSTIN" hint="auto-filled">
                  <input readOnly className={inpRO} value={selectedVendor?.gstin || ''} />
                </Field>
                <Field label="WO / PO No." required>
                  <select className={inp} value={hdr.woId} onChange={e => setHdr(h => ({ ...h, woId: e.target.value }))}>
                    <option value="">— Select WO —</option>
                    {woList.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
                  </select>
                </Field>
                <Field label="WO Description" hint="auto-filled">
                  <input readOnly className={inpRO} value={selectedWO?.description || ''} />
                </Field>
                <Field label="WO Value" hint="auto-filled">
                  <input readOnly className={inpRO} value={selectedWO ? inr(selectedWO.wo_value) : ''} />
                </Field>
                <Field label="Previous RA Amount" hint="auto-filled">
                  <input readOnly className={inpRO} value={selectedWO ? inr(previousRa) : ''} />
                </Field>
                <Field label="WO Balance" hint="auto-calc">
                  <input readOnly className={`${inpRO} ${woBalance < 0 ? 'text-red-600' : 'text-green-700'}`} value={selectedWO ? inr(woBalance) : ''} />
                </Field>
                <Field label="Project Name" hint="auto-filled">
                  <input readOnly className={inpRO} value={selectedWO?.project_name || ''} />
                </Field>
                <Field label="Site / Office Location">
                  <input className={inp} value={hdr.siteLocation} onChange={e => setHdr(h => ({ ...h, siteLocation: e.target.value }))} />
                </Field>
                <Field label="Bill No." hint="auto-generated">
                  <input readOnly className={`${inpRO} font-mono font-semibold`} value={hdr.billNo} />
                </Field>
              </div>

              {/* Duplicate check warning */}
              {hdr.vendorId && hdr.woId && (() => {
                const dup = MOCK_EXISTING_INVOICES.find(i => i.vendor_id === hdr.vendorId && i.wo_id === hdr.woId);
                return dup ? (
                  <Alert variant="warning">
                    A previous invoice exists for this vendor + WO: <strong>{dup.bill_no}</strong>. Verify this is not a duplicate.
                  </Alert>
                ) : null;
              })()}
            </div>
          )}

          {/* ── STEP 2: USAGE DETAILS ── */}
          {step === 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <SectionTitle>Common Usage Details</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Asset Description" required>
                  <input className={inp} value={usage.assetDescription} onChange={e => setUsage(u => ({ ...u, assetDescription: e.target.value }))} />
                </Field>
                <Field label="Asset ID / Reg. No.">
                  <input className={inp} value={usage.assetId} onChange={e => setUsage(u => ({ ...u, assetId: e.target.value }))} />
                </Field>
                {!['PRINTER', 'IT_EQUIP'].includes(hdr.categoryCode) && (
                  <Field label="Operator / In-charge">
                    <input className={inp} value={usage.operatorName} onChange={e => setUsage(u => ({ ...u, operatorName: e.target.value }))} />
                  </Field>
                )}
                <Field label="Deployment Period From" required>
                  <input type="date" className={inp} value={usage.periodFrom} onChange={e => setUsage(u => ({ ...u, periodFrom: e.target.value }))} />
                </Field>
                <Field label="Deployment Period To" required>
                  <input type="date" className={inp} value={usage.periodTo} onChange={e => setUsage(u => ({ ...u, periodTo: e.target.value }))} />
                </Field>
                <Field label="Unit of Measurement" required>
                  <select className={inp} value={usage.unit} onChange={e => setUsage(u => ({ ...u, unit: e.target.value }))}>
                    <option value="">— Select —</option>
                    {(category?.units || []).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Quantity" required>
                  <input type="number" className={inp} value={usage.quantity} onChange={e => setUsage(u => ({ ...u, quantity: e.target.value }))} />
                </Field>
                <Field label={`Rate per ${usage.unit || 'Unit'} (₹)`} required>
                  <input type="number" className={inp} value={usage.rate} onChange={e => setUsage(u => ({ ...u, rate: e.target.value }))} />
                </Field>
                <Field label="Gross Amount" hint="auto-calc">
                  <input readOnly className={`${inpRO} font-semibold`} value={inr(grossAmount)} />
                </Field>
              </div>

              {/* Mismatch alert for CRANE/HYDRA */}
              {certifiedHrs != null && (
                <div className={`border rounded-lg p-3 text-sm ${hasMismatch ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-700'}`}>
                  <div className="flex items-center gap-2 font-medium mb-1">
                    {hasMismatch ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                    Certified Log Sheet Comparison
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs mt-2">
                    <div><div className="text-slate-500">Log Ref</div><div className="font-mono">{stateLinkedLog?.logRef}</div></div>
                    <div><div className="text-slate-500">Certified Hrs</div><div className="font-bold">{certifiedHrs}</div></div>
                    <div><div className="text-slate-500">Invoice Qty</div><div className={`font-bold ${hasMismatch ? 'text-red-700' : ''}`}>{usage.quantity || '—'}</div></div>
                  </div>
                  {hasMismatch && (
                    <div className="mt-2 font-semibold">
                      Difference: {mismatchDiff} hrs ({inr(mismatchDiff * n(usage.rate))}) — submission blocked. Finance role can override.
                    </div>
                  )}
                </div>
              )}

              {/* Category-specific dynamic fields */}
              {category?.dynamicFields?.length > 0 && (
                <>
                  <SectionTitle>Category Fields — {category.label}</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {category.dynamicFields.map(field => {
                      if (field === 'fuel_included') {
                        return (
                          <Field key={field} label={DYNAMIC_FIELD_LABELS[field] || field}>
                            <div className="flex gap-4 pt-2">
                              {['Yes', 'No'].map(opt => (
                                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input type="radio" name="fuel_included" value={opt} checked={usage.dynamicValues.fuel_included === opt} onChange={() => setUsage(u => ({ ...u, dynamicValues: { ...u.dynamicValues, fuel_included: opt } }))} />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          </Field>
                        );
                      }
                      return (
                        <Field key={field} label={DYNAMIC_FIELD_LABELS[field] || field}>
                          <input
                            className={inp}
                            value={usage.dynamicValues[field] || ''}
                            onChange={e => setUsage(u => ({ ...u, dynamicValues: { ...u.dynamicValues, [field]: e.target.value } }))}
                          />
                        </Field>
                      );
                    })}
                  </div>
                </>
              )}

              {/* OTHER — custom fields */}
              {hdr.categoryCode === 'OTHER' && (
                <>
                  <SectionTitle>Custom Fields</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Field Label"><input className={inp} value={usage.dynamicValues.custom_label || ''} onChange={e => setUsage(u => ({ ...u, dynamicValues: { ...u.dynamicValues, custom_label: e.target.value } }))} /></Field>
                    <Field label="Field Value"><input className={inp} value={usage.dynamicValues.custom_value || ''} onChange={e => setUsage(u => ({ ...u, dynamicValues: { ...u.dynamicValues, custom_value: e.target.value } }))} /></Field>
                  </div>
                </>
              )}

              {/* Document uploads */}
              {category?.documents?.length > 0 && (
                <>
                  <SectionTitle>Document Uploads</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {category.documents.map(doc => {
                      const uploaded = usage.uploadedDocs[doc];
                      return (
                        <div key={doc} className={`flex items-center justify-between border rounded-lg p-3 ${uploaded ? 'border-green-300 bg-green-50' : 'border-slate-300 bg-white'}`}>
                          <div className="text-sm">
                            <div className="font-medium text-slate-700">{doc} <span className="text-red-500">*</span></div>
                            {uploaded && <div className="text-xs text-green-700 mt-0.5">{uploaded}</div>}
                          </div>
                          <label className="cursor-pointer">
                            <input type="file" className="hidden" onChange={e => {
                              if (e.target.files[0]) {
                                setUsage(u => ({ ...u, uploadedDocs: { ...u.uploadedDocs, [doc]: e.target.files[0].name } }));
                                toast.success(`${doc} uploaded`);
                              }
                            }} />
                            {uploaded
                              ? <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle size={14} /> Uploaded</span>
                              : <span className="flex items-center gap-1 text-xs text-slate-600 border border-slate-300 rounded-lg px-2 py-1 hover:bg-slate-50"><Upload size={12} /> Upload</span>
                            }
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  {category.documents.some(d => !usage.uploadedDocs[d]) && (
                    <Alert variant="warning">Upload all mandatory documents before submitting.</Alert>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: DEDUCTIONS & TAX ── */}
          {step === 2 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              {/* Deductions table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>Deductions</SectionTitle>
                  <button
                    onClick={() => setDedRows(r => [...r, { id: Date.now(), label: '', qty: '', rate: '', amount: '', reason: '' }])}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <th className="px-3 py-2 text-left">Label</th>
                        <th className="px-3 py-2 text-left">Qty</th>
                        <th className="px-3 py-2 text-left">Rate</th>
                        <th className="px-3 py-2 text-right">Amount (₹)</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dedRows.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-2 py-2"><input className="border border-slate-300 rounded px-2 py-1 text-xs w-44" value={row.label} onChange={e => setDedRows(d => d.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))} /></td>
                          <td className="px-2 py-2"><input type="number" className="border border-slate-300 rounded px-2 py-1 text-xs w-20" value={row.qty} onChange={e => setDedRows(d => d.map(r => r.id === row.id ? { ...r, qty: e.target.value, amount: (n(e.target.value) * n(r.rate)).toFixed(2) } : r))} /></td>
                          <td className="px-2 py-2"><input type="number" className="border border-slate-300 rounded px-2 py-1 text-xs w-24" value={row.rate} onChange={e => setDedRows(d => d.map(r => r.id === row.id ? { ...r, rate: e.target.value, amount: (n(r.qty) * n(e.target.value)).toFixed(2) } : r))} /></td>
                          <td className="px-2 py-2 text-right"><input type="number" className="border border-slate-300 rounded px-2 py-1 text-xs w-28 text-right" value={row.amount} onChange={e => setDedRows(d => d.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))} /></td>
                          <td className="px-2 py-2"><input className="border border-slate-300 rounded px-2 py-1 text-xs w-40" value={row.reason} onChange={e => setDedRows(d => d.map(r => r.id === row.id ? { ...r, reason: e.target.value } : r))} /></td>
                          <td className="px-2 py-2"><button onClick={() => setDedRows(d => d.filter(r => r.id !== row.id))} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300">
                        <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-right text-slate-700">Total Deductions</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{inr(totalDeductions)}</td>
                        <td colSpan={2} />
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-sm font-bold text-right text-slate-800">Taxable Value</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-800 text-base">{inr(taxableValue)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* GST */}
              <div>
                <SectionTitle>GST</SectionTitle>
                <div className="flex gap-4 mb-4">
                  {['intra', 'inter'].map(mode => (
                    <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="gstMode" value={mode} checked={taxState.gstMode === mode} onChange={() => setTaxState(t => ({ ...t, gstMode: mode }))} />
                      {mode === 'intra' ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="SAC Code">
                    <input className={inp} value={taxState.sac} onChange={e => setTaxState(t => ({ ...t, sac: e.target.value }))} />
                  </Field>
                  <Field label="GST Rate (%)">
                    <input type="number" className={inp} value={taxState.gstRate} onChange={e => setTaxState(t => ({ ...t, gstRate: e.target.value }))} />
                  </Field>
                  {taxState.gstMode === 'intra' ? (
                    <>
                      <Field label="CGST" hint="auto"><input readOnly className={inpRO} value={inr(totalGst / 2)} /></Field>
                      <Field label="SGST" hint="auto"><input readOnly className={inpRO} value={inr(totalGst / 2)} /></Field>
                    </>
                  ) : (
                    <Field label="IGST" hint="auto"><input readOnly className={inpRO} value={inr(totalGst)} /></Field>
                  )}
                </div>
              </div>

              {/* TDS */}
              <div>
                <SectionTitle>TDS</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="TDS Section">
                    <input className={inp} value={taxState.tdsSection} onChange={e => setTaxState(t => ({ ...t, tdsSection: e.target.value }))} />
                  </Field>
                  <Field label="Vendor Type">
                    <select className={inp} value={taxState.vendorType} onChange={e => setTaxState(t => ({ ...t, vendorType: e.target.value }))}>
                      <option value="company">Company</option>
                      <option value="individual">Individual / HUF</option>
                    </select>
                  </Field>
                  <Field label="TDS Rate (%)">
                    <input type="number" className={inp} value={taxState.tdsRate} onChange={e => setTaxState(t => ({ ...t, tdsRate: e.target.value }))} />
                  </Field>
                  <Field label="TDS Amount" hint="auto"><input readOnly className={inpRO} value={inr(tdsAmount)} /></Field>
                </div>
              </div>

              {/* Retention */}
              <div>
                <SectionTitle>Retention</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Retention % (from WO)">
                    <input type="number" className={inp} value={taxState.retentionPct} onChange={e => setTaxState(t => ({ ...t, retentionPct: e.target.value }))} />
                  </Field>
                  <Field label="Retention Amount" hint="auto"><input readOnly className={inpRO} value={inr(retentionAmt)} /></Field>
                </div>
              </div>

              {taxableValue > woBalance && (
                <Alert variant="error">Taxable value {inr(taxableValue)} exceeds WO balance {inr(woBalance)}. Cannot proceed.</Alert>
              )}
            </div>
          )}

          {/* ── STEP 4: APPROVAL WORKFLOW ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <SectionTitle>Approval Chain — {category?.label}</SectionTitle>
                {approvals.length === 0 && (
                  <Alert variant="info">Select a category in Step 1 to load the approval chain.</Alert>
                )}
                <div className="space-y-3">
                  {approvals.map((a, idx) => {
                    const isActive = idx === activeApprovalIdx;
                    return (
                      <ApprovalRow
                        key={a.role}
                        approval={a}
                        isActive={isActive}
                        locked={idx > activeApprovalIdx && activeApprovalIdx !== -1}
                        onApprove={r => approveApproval(idx, r)}
                        onReject={r => rejectApproval(idx, r)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* QS Expanded Certification Panel */}
              {qsIdx !== -1 && (activeApprovalIdx === qsIdx || approvals[qsIdx]?.status === 'Approved' || approvals[qsIdx]?.status === 'Certified') && (
                <QSCertificationPanel
                  selectedWO={selectedWO}
                  calc={calc}
                  usage={usage}
                  taxState={taxState}
                  stateLinkedLog={stateLinkedLog}
                  qsChecklist={qsChecklist}
                  setQsChecklist={setQsChecklist}
                  allQsTicked={allQsTicked}
                  qsCertState={qsCertState}
                  setQsCertState={setQsCertState}
                  qsUsers={MOCK_QS_USERS}
                  onCertify={() => {
                    approveApproval(qsIdx, qsCertState.certRemarks);
                    toast.success('QS Certified & forwarded to Finance');
                  }}
                  onReject={() => {
                    rejectApproval(qsIdx, qsCertState.certRemarks);
                    toast.error('Invoice returned for revision');
                  }}
                />
              )}
            </div>
          )}

          {/* ── STEP 5: ACCOUNTING & POSTING ── */}
          {step === 4 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <SectionTitle>Journal Entry Preview</SectionTitle>
              <div className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                <div className="flex gap-4">
                  <span className="w-8 text-slate-400">Dr</span>
                  <span className="flex-1">{category?.costHead || '[Cost Head]'}</span>
                  <span className="text-slate-700">{inr(taxableValue)}</span>
                </div>
                {taxState.gstMode === 'intra' ? (
                  <>
                    <div className="flex gap-4">
                      <span className="w-8 text-slate-400">Dr</span>
                      <span className="flex-1">GST Input CGST</span>
                      <span className="text-slate-700">{inr(totalGst / 2)}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="w-8 text-slate-400">Dr</span>
                      <span className="flex-1">GST Input SGST</span>
                      <span className="text-slate-700">{inr(totalGst / 2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-4">
                    <span className="w-8 text-slate-400">Dr</span>
                    <span className="flex-1">GST Input IGST</span>
                    <span className="text-slate-700">{inr(totalGst)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1 mt-1" />
                <div className="flex gap-4">
                  <span className="w-8 text-slate-400 ml-6">Cr</span>
                  <span className="flex-1">{selectedVendor?.name || '[Vendor]'} Payable A/c</span>
                  <span className="text-slate-700">{inr(netPayable)}</span>
                </div>
                <div className="flex gap-4">
                  <span className="w-8 text-slate-400 ml-6">Cr</span>
                  <span className="flex-1">TDS Payable A/c ({taxState.tdsSection})</span>
                  <span className="text-slate-700">{inr(tdsAmount)}</span>
                </div>
                {retentionAmt > 0 && (
                  <div className="flex gap-4">
                    <span className="w-8 text-slate-400 ml-6">Cr</span>
                    <span className="flex-1">Retention Payable A/c</span>
                    <span className="text-slate-700">{inr(retentionAmt)}</span>
                  </div>
                )}
              </div>

              <div>
                <SectionTitle>Cost Centre</SectionTitle>
                <div className="max-w-xs">
                  <Field label="Project / Cost Centre" required>
                    <select className={inp}>
                      <option value="">— Select Project —</option>
                      {woList.map(w => <option key={w.id} value={w.id}>{w.project_name}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              {!allApproved && (
                <Alert variant="warning">All approvals including QS certification must be completed before posting.</Alert>
              )}

              <button
                disabled={!allApproved}
                onClick={() => toast.success('Posted to accounts — Journal entry created')}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle size={16} />
                Post to Accounts
              </button>
            </div>
          )}

          {/* Step navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => toast.success('Draft saved')}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Save Draft
              </button>
              {step < STEPS.length - 1 && (
                <button
                  onClick={handleNext}
                  disabled={!canAdvance}
                  className="flex items-center gap-1 px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — live summary (always visible) */}
        <div className="lg:col-span-1">
          <LiveSummary calc={calc} />
          {/* Category info card */}
          {category && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4 text-xs space-y-2">
              <div className="font-bold text-slate-700 text-sm">{category.label}</div>
              <div className="flex justify-between"><span className="text-slate-500">SAC</span><span>{category.sac}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TDS Section</span><span>{category.tdsSection}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TDS (Company)</span><span>{category.tdsRate.company}%</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Cost Head</span><span className="text-right ml-2 text-slate-700">{category.costHead}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Log Sheet</span><span>{category.requiresLogSheet ? 'Required' : 'Not required'}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Approval Row ──────────────────────────────────────────────────────────────

function ApprovalRow({ approval, isActive, locked, onApprove, onReject }) {
  const [remarks, setRemarks] = useState('');
  const st = STATUS_STYLE[approval.status] || STATUS_STYLE.Pending;
  const StatusIcon = st.icon;
  return (
    <div className={`flex items-center gap-3 p-3 border rounded-xl text-sm transition-colors ${
      isActive ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
    } ${locked && approval.status === 'Pending' ? 'opacity-50' : ''}`}>
      <div className="w-32 font-medium text-slate-700 shrink-0">{approval.role}</div>
      <div className="flex-1">
        {isActive ? (
          <input className="border border-slate-300 rounded px-2 py-1 text-sm w-full max-w-xs" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" />
        ) : (
          <span className="text-slate-500">{approval.remarks || '—'}</span>
        )}
      </div>
      <div className="text-xs text-slate-400 whitespace-nowrap">{approval.date || '—'}</div>
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${st.cls}`}>
        <StatusIcon size={10} />
        {approval.status}
      </span>
      {isActive && (
        <div className="flex gap-2 shrink-0">
          <button onClick={() => onApprove(remarks)} className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 font-medium">Approve</button>
          <button onClick={() => onReject(remarks)} className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium">Reject</button>
        </div>
      )}
    </div>
  );
}

// ── QS Certification Panel (Sections A–G) ─────────────────────────────────────

function QSCertificationPanel({ selectedWO, calc, usage, taxState, stateLinkedLog, qsChecklist, setQsChecklist, allQsTicked, qsCertState, setQsCertState, qsUsers, onCertify, onReject }) {
  const [showOverride, setShowOverride] = useState(false);
  const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n = v => Number(v) || 0;

  const rateMatch = selectedWO && n(usage.rate) === n(selectedWO.agreed_rate);
  const periodOk  = selectedWO && usage.periodFrom >= selectedWO.period_from && usage.periodTo <= selectedWO.period_to;
  const balanceOk = calc.taxableValue <= calc.woBalance;
  const qtyMatch  = stateLinkedLog ? n(usage.quantity) === stateLinkedLog.certifiedHrs : true;

  const checkRow = (key) => (
    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={qsChecklist[key]} onChange={e => setQsChecklist(q => ({ ...q, [key]: e.target.checked }))} className="w-4 h-4 accent-amber-500" />
      <span>{qsChecklistLabels[key]}</span>
    </label>
  );

  return (
    <div className="bg-white border-2 border-amber-300 rounded-xl overflow-hidden">
      <div className="bg-amber-500 text-white px-5 py-3 font-bold text-sm flex items-center gap-2">
        <BookOpen size={16} />
        QS Certification Panel
      </div>
      <div className="p-5 space-y-6">

        {/* Section A — WO Compliance */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3">A — WO Compliance Check</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <InfoRow label="WO No." value={selectedWO?.wo_number || '—'} />
            <InfoRow label="WO Agreed Rate" value={selectedWO ? inr(selectedWO.agreed_rate) : '—'} />
            <InfoRow label="Invoice Rate Claimed" value={inr(usage.rate)} />
            <InfoRow label="Rate Match" value={rateMatch ? '✓ Match' : '✗ Mismatch'} cls={rateMatch ? 'text-green-700' : 'text-red-600 font-bold'} />
            <InfoRow label="WO Validity" value={selectedWO ? `${selectedWO.period_from} to ${selectedWO.period_to}` : '—'} />
            <InfoRow label="Period Within WO" value={periodOk ? '✓ Yes' : '✗ No'} cls={periodOk ? 'text-green-700' : 'text-red-600 font-bold'} />
            <InfoRow label="WO Balance Before" value={inr(calc.woBalance + calc.taxableValue)} />
            <InfoRow label="This Invoice Value" value={inr(calc.taxableValue)} />
            <InfoRow label="WO Balance After" value={inr(calc.woBalance)} cls={calc.woBalance / (selectedWO?.wo_value || 1) < 0.1 ? 'text-amber-600 font-semibold' : 'text-green-700'} />
          </div>
        </div>

        {/* Section B — Qty Verification */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3">B — Quantity Verification</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <InfoRow label="Invoice Qty" value={`${usage.quantity} ${usage.unit}`} />
            {stateLinkedLog && (
              <>
                <InfoRow label="Log Sheet Ref" value={stateLinkedLog.logRef} />
                <InfoRow label="Certified Hrs" value={stateLinkedLog.certifiedHrs} />
              </>
            )}
            <InfoRow label="Qty Match" value={qtyMatch ? '✓ Match' : '✗ Mismatch'} cls={qtyMatch ? 'text-green-700' : 'text-red-600 font-bold'} />
          </div>
        </div>

        {/* Section C — Deduction Adequacy */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3">C — Deduction Adequacy</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <InfoRow label="Retention % per WO" value={`${selectedWO?.retention_pct ?? '—'}%`} />
            <InfoRow label="Retention Applied" value={inr(calc.retentionAmt)} />
            <InfoRow label="Total Deductions" value={inr(calc.totalDeductions)} />
          </div>
        </div>

        {/* Section D — GST & TDS Check */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3">D — GST & TDS Check</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <InfoRow label="SAC Code" value={taxState.sac || '—'} />
            <InfoRow label="GST Rate" value={`${taxState.gstRate}%`} cls={n(taxState.gstRate) === 18 ? 'text-green-700' : 'text-amber-600'} />
            <InfoRow label="TDS Section" value={taxState.tdsSection || '—'} />
            <InfoRow label="TDS Rate" value={`${taxState.tdsRate}%`} />
          </div>
        </div>

        {/* Section E — Checklist */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 mb-3">E — QS Checklist</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.keys(qsChecklist).map(checkRow)}
          </div>
          {!allQsTicked && <div className="text-xs text-red-600 mt-2">All items must be ticked before certifying.</div>}
        </div>

        {/* Section F — Certification Block */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-700 border-b border-amber-200 pb-1 mb-3">F — QS Certification</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Certified Amount (Net Payable)</label>
              <div className="text-2xl font-bold text-amber-700">{inr(calc.netPayable)}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">QS Ref No.</label>
              <input readOnly className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm font-mono" value={qsCertState.qsRefNo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">QS Name <span className="text-red-500">*</span></label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={qsCertState.qsName} onChange={e => setQsCertState(s => ({ ...s, qsName: e.target.value }))}>
                <option value="">— Select QS —</option>
                {qsUsers.map(q => <option key={q.id} value={q.name}>{q.name} — {q.designation}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={qsCertState.designation} onChange={e => setQsCertState(s => ({ ...s, designation: e.target.value }))}>
                <option>Quantity Surveyor</option>
                <option>Sr. QS</option>
                <option>Contracts Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date of Certification</label>
              <input readOnly className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm" value={dayjs().format('DD-MM-YYYY')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Certification Status</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={qsCertState.certStatus} onChange={e => setQsCertState(s => ({ ...s, certStatus: e.target.value }))}>
                <option value="">— Select —</option>
                <option>Certified</option>
                <option>Certified with Remarks</option>
                <option>Rejected</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Certification Remarks {!allQsTicked && <span className="text-red-500">*</span>}</label>
              <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none" value={qsCertState.certRemarks} onChange={e => setQsCertState(s => ({ ...s, certRemarks: e.target.value }))} placeholder="Mandatory if any flag was raised" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCertify} disabled={!allQsTicked || !qsCertState.qsName} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle size={14} /> Certify & Forward to Finance
            </button>
            <button onClick={onReject} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
              <XCircle size={14} /> Reject & Return
            </button>
            <button onClick={() => { setShowOverride(o => !o); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
              Certify with Remarks
            </button>
          </div>
        </div>

        {/* Section G — Override (shown when mismatch) */}
        {(showOverride || !qtyMatch || !rateMatch) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-red-700 border-b border-red-200 pb-1 mb-3">G — QS Override</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">QS Recommended Amount (₹)</label>
                <input type="number" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={qsCertState.recommendedAmount} onChange={e => setQsCertState(s => ({ ...s, recommendedAmount: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Revised Net Payable</label>
                <input readOnly className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm font-semibold text-amber-700" value={qsCertState.recommendedAmount ? `₹${Number(qsCertState.recommendedAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : inr(calc.netPayable)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Variance <span className="text-red-500">*</span></label>
                <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none" placeholder="Mandatory — explain the variance" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Variance Approved By</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Project Manager sign-off required" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, cls = 'text-slate-800' }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${cls}`}>{value}</div>
    </div>
  );
}

const qsChecklistLabels = {
  rateMatch:          'Rate matches WO agreed rate',
  qtyMatch:           'Quantity matches certified log / usage record',
  periodValid:        'Invoice period is within WO validity',
  balanceSufficient:  'WO balance is sufficient for this invoice',
  deductionsCorrect:  'All deductions correctly applied per WO terms',
  taxCorrect:         'GST and TDS computed correctly',
  docsVerified:       'Supporting documents verified',
  noDisputes:         'No pending disputes or NCR against this vendor / equipment',
};
