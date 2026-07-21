import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import * as XLSX from 'xlsx';
import { procurementAdvanceAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, Theme } from '../../theme';
import toast from 'react-hot-toast';
import {
  IndianRupee, Plus, Search, FileText, CheckCircle2, Clock,
  Wallet, X, ChevronRight, Trash2, Upload, AlertTriangle,
  TrendingDown, RotateCcw, Filter, RefreshCw, Download,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
}

const STATUS_CFG = {
  pending:   { label: 'Pending',          bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'  },
  issued:    { label: 'Issued',           bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500'},
  partial:   { label: 'Partial Recovery', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'   },
  recovered: { label: 'Recovered',        bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400'  },
};

const APPROVAL_CFG = {
  pending:               { label: 'Awaiting Procurement', bg: 'bg-amber-50',   text: 'text-amber-700'   },
  procurement_approved:  { label: 'Awaiting MD',          bg: 'bg-indigo-50',  text: 'text-indigo-700'  },
  approved:              { label: 'Approved',             bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected:              { label: 'Rejected',             bg: 'bg-red-50',     text: 'text-red-600'     },
};

function ApprovalBadge({ status }) {
  const cfg = APPROVAL_CFG[status || 'pending'] || APPROVAL_CFG.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border border-current/10 ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── KPI Card (3D tilt) ────────────────────────────────────────────────────────
const KPI_THEMES = [
  { accent: '#6366F1', iconBg: '#EEF2FF', iconColor: '#6366F1', glow: 'rgba(99,102,241,0.18)' },
  { accent: '#0891B2', iconBg: '#ECFEFF', iconColor: '#0891B2', glow: 'rgba(8,145,178,0.18)'  },
  { accent: '#D97706', iconBg: '#FFFBEB', iconColor: '#D97706', glow: 'rgba(217,119,6,0.18)'  },
  { accent: '#059669', iconBg: '#ECFDF5', iconColor: '#059669', glow: 'rgba(5,150,105,0.18)'  },
  { accent: '#DC2626', iconBg: '#FEF2F2', iconColor: '#DC2626', glow: 'rgba(220,38,38,0.18)'  },
];

function KpiCard({ label, value, sub, icon: Icon, themeIdx = 0, active, onClick }) {
  const t = KPI_THEMES[themeIdx % KPI_THEMES.length];
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const sRotX = useSpring(rotX, { stiffness: 300, damping: 25 });
  const sRotY = useSpring(rotY, { stiffness: 300, damping: 25 });
  const cardTransform = useTransform([sRotX, sRotY], ([rx, ry]) =>
    `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg)`
  );
  const gloss = useTransform([sRotX, sRotY], ([rx, ry]) =>
    `radial-gradient(circle at ${50 - ry * 4}% ${50 + rx * 4}%, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0) 60%)`
  );

  const onMouse = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    rotY.set(((e.clientX - r.left) / r.width  - 0.5) * 14);
    rotX.set(((e.clientY - r.top)  / r.height - 0.5) * -10);
  };
  const onLeave = () => { rotX.set(0); rotY.set(0); };

  return (
    <motion.button
      onClick={onClick}
      onMouseMove={onMouse}
      onMouseLeave={onLeave}
      style={{
        transform: cardTransform,
        background: active ? t.iconBg : '#fff',
        borderRadius: 10,
        padding: '14px 16px',
        border: `1px solid ${active ? t.accent + '55' : '#E2E8F0'}`,
        borderTop: `3px solid ${t.accent}`,
        boxShadow: active
          ? `0 6px 20px ${t.glow}, 0 1px 4px rgba(0,0,0,0.06)`
          : `0 1px 4px rgba(0,0,0,0.06)`,
        display: 'flex', flexDirection: 'column', gap: 8,
        textAlign: 'left', width: '100%',
        cursor: onClick ? 'pointer' : 'default',
        willChange: 'transform', position: 'relative', overflow: 'hidden',
      }}
      whileHover={{ scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
    >
      {/* glossy sheen overlay */}
      <motion.div style={{
        position: 'absolute', inset: 0, borderRadius: 10,
        background: gloss, pointerEvents: 'none',
      }} />
      {/* bottom accent bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: t.accent, opacity: active ? 1 : 0.35, borderRadius: '0 0 10px 10px',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{sub}</p>}
        </div>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={t.iconColor} />
        </div>
      </div>
    </motion.button>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────
const F = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white';
function Lbl({ children, req }) {
  return <label className="block text-[13px] font-medium text-slate-900 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</label>;
}

// ── New Advance Voucher Modal ─────────────────────────────────────────────────
const EMPTY = {
  project_id: '', vendor_id: '', vendor_name: '', work_desc: '',
  wo_number: '', po_number: '', po_date: '',
  voucher_number: '', voucher_date: '',
  proforma_invoice_date: '', proforma_invoice_number: '',
  ra_bill_no: 'Advance',
  order_value: '', variation_value: '',
  order_basic_value: '', order_tax_value: '', order_value_basis: 'basic', // basic | with_tax
  advance_value: '', advance_pct: '',
  gross_certified_till_date: '',
  mobilisation_advance_deduction: '',
  retention_deduction: '',
  other_deductions: '',
  previous_certificates: '',
  balance_to_finish: '',
  current_net_payment_due: '',
  amount_in_words: '',
  prepared_by_name: '',
  director_name: 'Mr. S.Srinivas Raju',
  md_name: 'Mr. Stephen A',
  qs_handover_date: '', accts_received_date: '',
  remarks: '', note: '',
  terms_conditions: 'Payment shall be released against certified RA bills, subject to applicable statutory deductions.\nThis advance shall be recovered proportionately from future running account bills.\nAll bills must reference this Payment Certification / Work Order number.\nRetention, if applicable, shall be released only after successful completion / DLP.',
};

function NewAdvanceModal({ onClose, projects, defaultProjectId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY, project_id: defaultProjectId || '' });
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendors, setShowVendors] = useState(false);
  const [woSearch, setWoSearch] = useState('');
  const [showWOs, setShowWOs] = useState(false);
  const [poSearch, setPoSearch] = useState('');
  const [showPOs, setShowPOs] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['advance-vendors', vendorSearch],
    queryFn: () => procurementAdvanceAPI.lookupVendors({ search: vendorSearch }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: wos = [] } = useQuery({
    queryKey: ['advance-wos', form.project_id, form.vendor_id],
    queryFn: () => procurementAdvanceAPI.lookupWOs({ project_id: form.project_id || undefined, vendor_id: form.vendor_id || undefined }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: pos = [] } = useQuery({
    queryKey: ['advance-pos', form.project_id, form.vendor_id],
    queryFn: () => procurementAdvanceAPI.lookupPOs({ project_id: form.project_id || undefined, vendor_id: form.vendor_id || undefined }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (data) => procurementAdvanceAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success('Advance voucher created');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create'),
  });

  // Recompute advance/net figures after order_value, advance_value or advance_pct
  // changes. `driver` is the field the user just edited so we know which way to
  // calculate: editing % drives the amount, editing the amount drives the %.
  const recalc = (nf, driver) => {
    const ord = parseFloat(nf.order_value) || 0;
    if (driver === 'advance_pct') {
      const pct = parseFloat(nf.advance_pct) || 0;
      nf.advance_value = ord > 0 && pct ? (ord * pct / 100).toFixed(2) : nf.advance_value;
    } else if (driver === 'advance_value') {
      const adv = parseFloat(nf.advance_value) || 0;
      nf.advance_pct = ord > 0 ? ((adv / ord) * 100).toFixed(2) : '';
    } else if (driver === 'order_value') {
      // Order base changed (e.g. Basic ↔ Basic+Tax): keep the % and re-derive the
      // amount when a % is set; otherwise recompute the % from the existing amount.
      const pct = parseFloat(nf.advance_pct) || 0;
      if (pct > 0) nf.advance_value = ord > 0 ? (ord * pct / 100).toFixed(2) : '';
      else {
        const adv = parseFloat(nf.advance_value) || 0;
        nf.advance_pct = ord > 0 && adv ? ((adv / ord) * 100).toFixed(2) : nf.advance_pct;
      }
    }
    const adv = parseFloat(nf.advance_value) || 0;
    if (!nf.gross_certified_till_date || driver === 'advance_value' || driver === 'advance_pct') {
      nf.gross_certified_till_date = adv ? String(adv) : '';
    }
    const prev = parseFloat(nf.previous_certificates || 0) || 0;
    const mob = parseFloat(nf.mobilisation_advance_deduction || 0) || 0;
    const ret = parseFloat(nf.retention_deduction || 0) || 0;
    const oth = parseFloat(nf.other_deductions || 0) || 0;
    if (!nf.current_net_payment_due || driver === 'advance_value' || driver === 'advance_pct') {
      nf.current_net_payment_due = Math.max(adv - prev - mob - ret - oth, 0).toFixed(2);
    }
    return nf;
  };

  const set = (k, v) => setForm(f => {
    const nf = { ...f, [k]: v };
    if (k === 'advance_value' || k === 'order_value' || k === 'advance_pct') return recalc(nf, k);
    return nf;
  });

  // Apply the Basic / Basic+Tax order values captured from a selected WO/PO and
  // set order_value to the currently chosen basis.
  const applyOrderValues = (basic, withTax) => setForm(f => {
    const nf = { ...f, order_basic_value: basic || 0, order_tax_value: withTax || 0 };
    const base = nf.order_value_basis === 'with_tax' ? (withTax || 0) : (basic || 0);
    nf.order_value = base ? String(base) : '';
    return recalc(nf, 'order_value');
  });

  // Switch the advance base between Basic and Basic+Tax.
  const setBasis = (basis) => setForm(f => {
    const base = basis === 'with_tax' ? (parseFloat(f.order_tax_value) || 0) : (parseFloat(f.order_basic_value) || 0);
    const nf = { ...f, order_value_basis: basis, order_value: base ? String(base) : f.order_value };
    return recalc(nf, 'order_value');
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name) return toast.error('Vendor is required');
    if (!form.advance_value || parseFloat(form.advance_value) <= 0) return toast.error('Advance value must be > 0');
    mutation.mutate(form);
  };

  const filteredWOs = wos.filter(w =>
    !woSearch || w.wo_number?.toLowerCase().includes(woSearch.toLowerCase()) || w.vendor_name?.toLowerCase().includes(woSearch.toLowerCase())
  );
  const filteredPOs = pos.filter(p =>
    !poSearch || p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) || p.vendor_name?.toLowerCase().includes(poSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1600px] h-[96vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-600 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-medium text-white">New Advance Voucher</h2>
              <p className="text-[13px] text-blue-200">Vendor & Contractor Advance</p>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Section 1: Project & Vendor ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Project & Vendor</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <Lbl>Project</Lbl>
                <select className={F} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— No project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="relative">
                <Lbl req>Vendor / Contractor</Lbl>
                <input className={F} placeholder="Search vendor..."
                  value={vendorSearch || form.vendor_name}
                  onChange={e => { setVendorSearch(e.target.value); set('vendor_name', e.target.value); set('vendor_id', ''); setShowVendors(true); }}
                  onFocus={() => setShowVendors(true)}
                  onBlur={() => setTimeout(() => setShowVendors(false), 150)}
                />
                {showVendors && vendors.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-64 overflow-y-auto">
                    {vendors.map(v => (
                      <button key={v.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-blue-50"
                        onMouseDown={() => {
                          set('vendor_id', v.id); set('vendor_name', v.name); setVendorSearch(''); setShowVendors(false);
                          set('wo_number', ''); set('po_number', '');
                          setWoSearch(''); setPoSearch(''); setShowWOs(true); setShowPOs(true);
                        }}>
                        {v.name} {v.vendor_code && <span className="text-slate-900 font-medium text-[13px] ml-1">({v.vendor_code})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                <Lbl>Package / Work Description</Lbl>
                <input className={F} value={form.work_desc} onChange={e => set('work_desc', e.target.value)}
                  placeholder="e.g. Supply of Lift Machine for Block A" />
              </div>
            </div>
          </div>

          {/* ── Section 2: Purchase / Work Order ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Purchase / Work Order</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="relative">
                <Lbl>WO / Work Order No.</Lbl>
                <input className={F} placeholder="Search or type WO no..."
                  value={woSearch || form.wo_number}
                  onChange={e => { setWoSearch(e.target.value); set('wo_number', e.target.value); setShowWOs(true); }}
                  onFocus={() => setShowWOs(true)}
                  onBlur={() => setTimeout(() => setShowWOs(false), 150)}
                />
                {showWOs && filteredWOs.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-y-auto">
                    {filteredWOs.map(w => (
                      <button key={w.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-blue-50"
                        onMouseDown={() => {
                          set('wo_number', w.wo_number);
                          if (w.vendor_name) { set('vendor_name', w.vendor_name); set('vendor_id', w.vendor_id); }
                          applyOrderValues(Number(w.basic_value ?? w.total_value ?? 0), Number(w.total_with_tax ?? w.total_value ?? 0));
                          if (w.wo_date) set('po_date', w.wo_date.slice(0, 10));
                          setWoSearch(''); setShowWOs(false);
                        }}>
                        <span className="font-medium">{w.wo_number}</span>
                        {w.vendor_name && <span className="text-slate-900 font-medium text-[13px] ml-2">— {w.vendor_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {showWOs && filteredWOs.length === 0 && form.vendor_id && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 px-3 py-2 text-xs text-slate-400">
                    No work order found for {form.vendor_name} — type the WO number manually.
                  </div>
                )}
              </div>
              <div className="relative">
                <Lbl>PO Number</Lbl>
                <input className={F} placeholder="Search or type PO no..."
                  value={poSearch || form.po_number}
                  onChange={e => { setPoSearch(e.target.value); set('po_number', e.target.value); setShowPOs(true); }}
                  onFocus={() => setShowPOs(true)}
                  onBlur={() => setTimeout(() => setShowPOs(false), 150)}
                />
                {showPOs && filteredPOs.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-y-auto">
                    {filteredPOs.map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-blue-50"
                        onMouseDown={() => {
                          set('po_number', p.po_number);
                          if (p.vendor_name) { set('vendor_name', p.vendor_name); set('vendor_id', p.vendor_id); }
                          applyOrderValues(Number(p.basic_value ?? p.total_value ?? 0), Number(p.total_with_tax ?? p.total_value ?? 0));
                          if (p.po_date) set('po_date', p.po_date.slice(0, 10));
                          setPoSearch(''); setShowPOs(false);
                        }}>
                        <span className="font-medium">{p.po_number}</span>
                        {p.vendor_name && <span className="text-slate-900 font-medium text-[13px] ml-2">— {p.vendor_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {showPOs && filteredPOs.length === 0 && form.vendor_id && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 px-3 py-2 text-xs text-slate-400">
                    No purchase order found for {form.vendor_name} — type the PO number manually.
                  </div>
                )}
              </div>
              <div>
                <Lbl>PO / WO Date</Lbl>
                <input type="date" className={F} value={form.po_date} onChange={e => set('po_date', e.target.value)} />
              </div>
              <div className="lg:col-span-2 xl:col-span-2">
                <Lbl>Purchase / Work Order Value (₹)</Lbl>
                <div className="flex items-center gap-2">
                  <input type="number" className={F} value={form.order_value} onChange={e => set('order_value', e.target.value)} placeholder="0" />
                  {(parseFloat(form.order_basic_value) > 0 || parseFloat(form.order_tax_value) > 0) && (
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[12px] shrink-0">
                      <button type="button" onClick={() => setBasis('basic')}
                        className={`px-2.5 py-2 ${form.order_value_basis === 'basic' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Basic</button>
                      <button type="button" onClick={() => setBasis('with_tax')}
                        className={`px-2.5 py-2 border-l border-slate-200 ${form.order_value_basis === 'with_tax' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Basic + Tax</button>
                    </div>
                  )}
                </div>
                {(parseFloat(form.order_basic_value) > 0 || parseFloat(form.order_tax_value) > 0) && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Basic: ₹{Number(form.order_basic_value || 0).toLocaleString('en-IN')} &nbsp;·&nbsp; Basic + Tax: ₹{Number(form.order_tax_value || 0).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 3: Payment Certification ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Payment Certification</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <Lbl>Payment Certification No.</Lbl>
                <input className={F} value={form.voucher_number} onChange={e => set('voucher_number', e.target.value)} placeholder="e.g. APC497/2026-27" />
              </div>
              <div>
                <Lbl>Certification Date</Lbl>
                <input type="date" className={F} value={form.voucher_date} onChange={e => set('voucher_date', e.target.value)} />
              </div>
              <div>
                <Lbl req>Advance Value (₹)</Lbl>
                <input type="number" className={F} value={form.advance_value} onChange={e => set('advance_value', e.target.value)} placeholder="0" />
              </div>
              <div>
                <Lbl>Advance %</Lbl>
                <input type="number" className={F} value={form.advance_pct} onChange={e => set('advance_pct', e.target.value)} placeholder="e.g. 10" />
                <p className="text-[11px] text-slate-400 mt-1">Enter % to auto-fill the advance amount, or type the amount above.</p>
              </div>
              <div>
                <Lbl>RA Bill No.</Lbl>
                <input className={F} value={form.ra_bill_no} onChange={e => set('ra_bill_no', e.target.value)} placeholder="e.g. Advance 3" />
              </div>
            </div>
          </div>

          {/* ── Section 3A: Claim Summary ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Claim Summary</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div><Lbl>Net Change by Variation Orders</Lbl><input type="number" className={F} value={form.variation_value} onChange={e => set('variation_value', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Gross Certified Till Date</Lbl><input type="number" className={F} value={form.gross_certified_till_date} onChange={e => set('gross_certified_till_date', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Deduction of Mobilisation Advance</Lbl><input type="number" className={F} value={form.mobilisation_advance_deduction} onChange={e => set('mobilisation_advance_deduction', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Deduction of Retention Amount</Lbl><input type="number" className={F} value={form.retention_deduction} onChange={e => set('retention_deduction', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Any Other Deductions</Lbl><input type="number" className={F} value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Less Previous Certificates for Payments</Lbl><input type="number" className={F} value={form.previous_certificates} onChange={e => set('previous_certificates', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Balance to Finish</Lbl><input type="number" className={F} value={form.balance_to_finish} onChange={e => set('balance_to_finish', e.target.value)} placeholder="0" /></div>
              <div><Lbl>Current Net Payment Due</Lbl><input type="number" className={F} value={form.current_net_payment_due} onChange={e => set('current_net_payment_due', e.target.value)} placeholder="0" /></div>
              <div className="md:col-span-2 lg:col-span-3 xl:col-span-4"><Lbl>Amount Certified in Words</Lbl><input className={F} value={form.amount_in_words} onChange={e => set('amount_in_words', e.target.value)} placeholder="Leave blank to auto-generate" /></div>
            </div>
          </div>

          {/* ── Section 4: Proforma Invoice ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Proforma Invoice</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <Lbl>Date of Proforma Invoice</Lbl>
                <input type="date" className={F} value={form.proforma_invoice_date} onChange={e => set('proforma_invoice_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Proforma Invoice Number</Lbl>
                <input className={F} value={form.proforma_invoice_number} onChange={e => set('proforma_invoice_number', e.target.value)} placeholder="Invoice no." />
              </div>
            </div>
          </div>

          {/* ── Section 5: Workflow Dates ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Workflow Dates</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <Lbl>QS Handover Date</Lbl>
                <input type="date" className={F} value={form.qs_handover_date} onChange={e => set('qs_handover_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Accounts Received Date</Lbl>
                <input type="date" className={F} value={form.accts_received_date} onChange={e => set('accts_received_date', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Section 6: Comments & Note ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Comments & Notes</p>
            <div className="space-y-3">
              <div>
                <Lbl>Specific Comments to Accounts Department</Lbl>
                <textarea className={F} rows={2} value={form.remarks}
                  onChange={e => set('remarks', e.target.value)}
                  placeholder="Any instructions for accounts team..." />
              </div>
              <div>
                <Lbl>Note (printed on certification)</Lbl>
                <input className={F} value={form.note}
                  onChange={e => set('note', e.target.value)}
                  placeholder="e.g. Payment 50% advance, balance after receiving the material" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Lbl>Prepared By</Lbl><input className={F} value={form.prepared_by_name} onChange={e => set('prepared_by_name', e.target.value)} placeholder="Name" /></div>
                <div><Lbl>Director</Lbl><input className={F} value={form.director_name} onChange={e => set('director_name', e.target.value)} /></div>
                <div><Lbl>Managing Director</Lbl><input className={F} value={form.md_name} onChange={e => set('md_name', e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* ── Section 7: Terms & Conditions ── */}
          <div>
            <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Terms &amp; Conditions</p>
            <Lbl>Printed on the voucher — one condition per line</Lbl>
            <textarea className={F} rows={5} value={form.terms_conditions}
              onChange={e => set('terms_conditions', e.target.value)}
              placeholder="One term per line..." />
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-100">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all">
            <Plus size={15} />{mutation.isPending ? 'Saving...' : 'Create Voucher'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import Excel Modal ────────────────────────────────────────────────────────
function ImportExcelModal({ onClose, projects, defaultProjectId }) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return toast.error('Please select an Excel file');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (projectId) fd.append('project_id', projectId);
      const res = await procurementAdvanceAPI.importExcel(fd);
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success(`Imported ${res.data.summary.created} voucher(s)`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-medium text-white">Import Advance Tracker Excel</h2>
              <p className="text-[13px] text-blue-200">Reads the "DQS - Advance Tracker" sheet</p>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <Lbl>Project (optional)</Lbl>
            <select className={F} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— No project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Lbl req>Excel File (.xlsx)</Lbl>
            <input type="file" accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files[0])}
              className="w-full text-sm text-slate-900 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-[13px] file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg p-1.5" />
            <p className="text-[13px] text-slate-900 font-medium mt-1.5">Duplicates (same vendor + voucher number) are skipped automatically.</p>
          </div>

          {result && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-[13px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Import Result</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center bg-white rounded-lg p-3 border border-slate-200">
                  <p className="text-2xl font-medium text-emerald-600">{result.summary.created}</p>
                  <p className="text-[13px] text-slate-900 font-medium mt-1">Created</p>
                </div>
                <div className="text-center bg-white rounded-lg p-3 border border-slate-200">
                  <p className="text-2xl font-medium text-amber-500">{result.summary.skipped}</p>
                  <p className="text-[13px] text-slate-900 font-medium mt-1">Skipped</p>
                </div>
                <div className="text-center bg-white rounded-lg p-3 border border-slate-200">
                  <p className="text-2xl font-medium text-red-500">{result.summary.errors}</p>
                  <p className="text-[13px] text-slate-900 font-medium mt-1">Errors</p>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => <p key={i} className="text-[13px] text-red-500">Row {e.row}: {e.reason}</p>)}
                </div>
              )}
              {result.skipped?.length > 0 && (
                <div className="max-h-20 overflow-y-auto space-y-1 mt-1">
                  {result.skipped.map((s, i) => <p key={i} className="text-[13px] text-amber-600">Row {s.row}: {s.reason}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-100">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleUpload} disabled={loading || !file}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all">
              <Upload size={14} />{loading ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProcurementAdvanceTrackerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const advanceBasePath = location.pathname.startsWith('/qs/') ? '/qs/advances' : '/procurement/advances';
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const { selectedProjectId, user } = useAuthStore();
  const canProcureApprove = ['super_admin', 'admin', 'procurement_manager', 'project_manager'].includes(user?.role);
  const canMDApprove      = ['super_admin', 'admin', 'managing_director', 'md', 'ceo', 'director'].includes(user?.role);
  const projectId    = searchParams.get('project') || selectedProjectId || '';
  const statusFilter = searchParams.get('status')  || 'all';
  const search       = searchParams.get('q')       || '';

  const [searchInput, setSearchInput] = useState(search);
  const [showModal,   setShowModal]   = useState(false);
  const [showImport,  setShowImport]  = useState(false);

  // Debounce: update URL param (and trigger query) 350ms after user stops typing.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams);
      if (searchInput) p.set('q', searchInput); else p.delete('q');
      setSearchParams(p, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60000,
  });

  const { data: summary = {} } = useQuery({
    queryKey: ['procurement-advances-summary', projectId],
    queryFn: () => procurementAdvanceAPI.summary({ project_id: projectId || undefined }).then(r => r.data?.data ?? {}),
    staleTime: 5 * 60 * 1000,
  });

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['procurement-advances', projectId, statusFilter, search],
    queryFn: () => procurementAdvanceAPI.list({
      project_id: projectId || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: search || undefined,
    }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => procurementAdvanceAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success('Voucher deleted');
    },
  });

  const approvalMut = useMutation({
    mutationFn: ({ id, action, reason }) =>
      action === 'procurement' ? procurementAdvanceAPI.approveProcurement(id)
      : action === 'md'        ? procurementAdvanceAPI.approveMD(id)
      :                          procurementAdvanceAPI.reject(id, { reason }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success(res?.data?.message || 'Updated');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  });

  const doApprove = (id, action) => approvalMut.mutate({ id, action });
  const doReject = (id) => {
    const reason = window.prompt('Reason for rejecting this advance voucher:');
    if (reason && reason.trim()) approvalMut.mutate({ id, action: 'reject', reason: reason.trim() });
  };

  const resyncMut = useMutation({
    mutationFn: () => procurementAdvanceAPI.resyncFromBills(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      const d = res.data;
      toast.success(d?.message || 'Advance tracker resynced from bills');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Resync failed'),
  });

  const handleResync = () => {
    if (!window.confirm(
      'Resync advance tracker from bill recoveries?\n\n' +
      'This will recalculate all voucher recovered_amount values from scratch using actual bill data. ' +
      'Run this if you notice advance balances are out of sync with bills.\n\nContinue?'
    )) return;
    resyncMut.mutate();
  };

  const setParam = (key, val) => {
    const p = new URLSearchParams(searchParams);
    if (val && val !== 'all') p.set(key, val); else p.delete(key);
    setSearchParams(p);
  };

  const selectedProject = projects.find(p => String(p.id) === String(projectId));

  // Export vouchers to Excel
  const handleExport = () => {
    if (!vouchers.length) return toast.error('No data to export');
    const today = new Date();
    const rows = vouchers.map((v, i) => {
      const payBase = v.pay_date || v.voucher_date || v.created_at;
      const daysOut = (v.status === 'issued' || v.status === 'partial') && payBase
        ? Math.floor((today - new Date(payBase)) / 86400000)
        : '';
      return {
        '#':                 i + 1,
        'WO / PO No':        v.wo_number || v.po_number || '',
        'Vendor Name':       v.vendor_name,
        'Voucher No':        v.voucher_number || v.sl_number || '',
        'Voucher Date':      fmt(v.voucher_date),
        'Project':           v.project_name || '',
        'Order Value (₹)':   Number(v.order_value  || 0),
        'Advance Value (₹)': Number(v.advance_value || 0),
        'Status':            v.status,
        'Paid Amount (₹)':   Number(v.paid_amount   || 0),
        'Pay Date':          fmt(v.pay_date),
        'Days Outstanding':  daysOut,
        'Recovered (₹)':     Number(v.recovered_amount || 0),
        'QS Handover':       fmt(v.qs_handover_date),
        'Acct Received':     fmt(v.accts_received_date),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      {wch:4},{wch:14},{wch:28},{wch:18},{wch:13},{wch:20},
      {wch:16},{wch:16},{wch:12},{wch:16},{wch:13},{wch:14},{wch:14},{wch:13},{wch:13},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Advance Tracker');
    XLSX.writeFile(wb, `Advance_Tracker_${today.toISOString().slice(0,10)}.xlsx`);
    toast.success('Exported to Excel');
  };

  // Per-status counts come from the summary (unfiltered) so all tabs always show real numbers
  const TABS = [
    { key: 'all',       label: 'All',              count: summary.total_vouchers   },
    { key: 'pending',   label: 'Pending',           count: summary.count_pending    },
    { key: 'issued',    label: 'Issued',            count: summary.count_issued     },
    { key: 'partial',   label: 'Partial Recovery',  count: summary.count_partial    },
    { key: 'recovered', label: 'Recovered',         count: summary.count_recovered  },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Advance Tracker"
        subtitle="Vendor / Subcontractor advance vouchers · disbursements · recoveries"
        breadcrumbs={[{ label: 'Procurement' }, { label: 'Advances' }]}
        pills={selectedProject ? [{ label: 'Total Advance', value: `₹${inr(summary.total_advance_value)}`, color: '#fde047' }] : []}
        actions={
          <>
            <select
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium outline-none"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
              value={projectId}
              onChange={e => setParam('project', e.target.value)}
            >
              <option value="" style={{ color: '#0f172a' }}>All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id} style={{ color: '#0f172a' }}>{p.name}</option>)}
            </select>
            <button
              onClick={handleResync}
              disabled={resyncMut.isPending}
              title="Recalculate recovered amounts from bill data"
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff', opacity: resyncMut.isPending ? 0.6 : 1 }}
            >
              <RefreshCw size={14} className={resyncMut.isPending ? 'animate-spin' : ''} />
              {resyncMut.isPending ? 'Syncing…' : 'Resync'}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={handleExport}
              title="Export current view to Excel"
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}
            >
              <Plus size={14} /> New Advance Voucher
            </button>
          </>
        }
      />

      <div className="px-6 py-5 space-y-4">

        {/* ── KPI Cards (3D tilt) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Vouchers"      value={summary.total_vouchers || '0'}
            sub="advance vouchers"              icon={FileText}     themeIdx={0} />
          <KpiCard label="Total Advance Value" value={`₹${inr(summary.total_advance_value)}`}
            sub="sanctioned advances"           icon={Wallet}       themeIdx={1} />
          <KpiCard label="Total Paid"          value={`₹${inr(summary.disbursed)}`}
            sub="total disbursed"               icon={IndianRupee}  themeIdx={2} />
          <KpiCard label="Total Recovered"     value={`₹${inr(summary.total_recovered)}`}
            sub="recovered so far"              icon={CheckCircle2} themeIdx={3} />
          <KpiCard label="Balance to Recover"
            value={`₹${inr(Math.max(0, (parseFloat(summary.disbursed || 0) - parseFloat(summary.total_recovered || 0))))}`}
            sub="paid but not yet recovered"    icon={TrendingDown} themeIdx={4} />
        </div>

        {/* ── Status Tabs + Search ── */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center overflow-x-auto scrollbar-none border-b border-gray-200 px-2">
            {TABS.map(t => {
              const active = statusFilter === t.key || (t.key === 'all' && statusFilter === 'all');
              return (
                <button key={t.key}
                  onClick={() => setParam('status', t.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                    active ? 'border-blue-600 text-blue-700 bg-blue-50/60' : 'border-transparent text-slate-900 font-medium hover:text-slate-900 font-medium hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`text-[13px] px-1.5 py-0.5 rounded-full font-medium ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
              <Search size={14} className="text-slate-900 font-medium flex-shrink-0" />
              <input
                className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400 text-gray-800"
                placeholder="Search vendor, WO no., voucher no..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button onClick={() => setSearchInput('')} className="text-slate-900 font-medium hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <span className="text-[13px] text-slate-900 font-medium whitespace-nowrap flex-shrink-0">
              {vouchers.length} record{vouchers.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* ── Table ── */}
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading advance vouchers...</div>
          ) : vouchers.length === 0 ? (
            <div className="py-16 text-center">
              <Wallet size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">No advance vouchers found</p>
              <p className="text-[13px] text-slate-900 font-medium mt-1">Click "New Advance Voucher" or import from Excel</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                  <tr>
                    {['#', 'WO / PO No.', 'Vendor Name', 'Voucher No.', 'Voucher Date', 'Order Value (₹)', 'Advance Value (₹)', 'QS Handover', 'Acct. Received', 'Approval', 'Status', 'Paid (₹)', 'Pay Date', 'Age (days)', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[11px] font-medium text-white uppercase tracking-[0.10em] text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v, i) => (
                    <tr key={v.id}
                      onClick={() => navigate(`${advanceBasePath}/${v.id}`)}
                      className="bg-white cursor-pointer hover:bg-blue-50/40 transition-colors border-b border-gray-100 last:border-0"
                    >
                      <td className="px-3 py-2.5 text-[13px] text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[13px] font-medium border ${
                          v.wo_number ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {v.wo_number || v.po_number || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 font-medium max-w-[180px] truncate">{v.vendor_name}</td>
                      <td className="px-3 py-2.5 text-gray-600">{v.voucher_number || v.sl_number || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{fmt(v.voucher_date)}</td>
                      <td className="px-3 py-2.5 text-slate-900 font-medium">₹{inr(v.order_value)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">₹{inr(v.advance_value)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{fmt(v.qs_handover_date)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{fmt(v.accts_received_date)}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ApprovalBadge status={v.approval_status} />
                          {canProcureApprove && ['pending', 'rejected'].includes(v.approval_status || 'pending') && (
                            <button onClick={() => doApprove(v.id, 'procurement')} disabled={approvalMut.isPending}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                              Approve
                            </button>
                          )}
                          {canMDApprove && v.approval_status === 'procurement_approved' && (
                            <button onClick={() => doApprove(v.id, 'md')} disabled={approvalMut.isPending}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                              MD Approve
                            </button>
                          )}
                          {(canProcureApprove || canMDApprove) && !['approved', 'rejected'].includes(v.approval_status || 'pending') && (
                            <button onClick={() => doReject(v.id)} disabled={approvalMut.isPending}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                              Reject
                            </button>
                          )}
                        </div>
                        {v.approval_status === 'approved' && v.md_approved_by_name && (
                          <p className="text-[9px] text-slate-400 mt-0.5">by {v.md_approved_by_name}</p>
                        )}
                        {v.approval_status === 'rejected' && v.rejection_reason && (
                          <p className="text-[9px] text-red-400 mt-0.5 max-w-[160px] truncate" title={v.rejection_reason}>{v.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={v.status} /></td>
                      <td className="px-3 py-2.5 font-medium text-emerald-700">
                        {v.paid_amount > 0 ? `₹${inr(v.paid_amount)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{fmt(v.pay_date)}</td>
                      <td className="px-3 py-2.5">
                        {(v.status === 'issued' || v.status === 'partial') && (v.pay_date || v.voucher_date) ? (() => {
                          const days = Math.floor((new Date() - new Date(v.pay_date || v.voucher_date)) / 86400000);
                          const color = days > 90 ? 'text-red-600 bg-red-50' : days > 45 ? 'text-amber-600 bg-amber-50' : 'text-emerald-700 bg-emerald-50';
                          return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${color}`}>{days}d</span>;
                        })() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { if (window.confirm('Delete this voucher?')) deleteMutation.mutate(v.id); }}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={14} className="text-gray-300" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal  && <NewAdvanceModal  onClose={() => setShowModal(false)}  projects={projects} defaultProjectId={projectId} />}
      {showImport && <ImportExcelModal onClose={() => setShowImport(false)} projects={projects} defaultProjectId={projectId} />}
    </div>
  );
}
