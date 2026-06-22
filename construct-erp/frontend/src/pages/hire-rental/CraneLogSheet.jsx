import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ClipboardList, Save, Send, FileDown, Link2, ChevronDown,
  ChevronUp, Plus, AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';
import { RENTAL_CATEGORIES, logSheetNumber } from '../../config/RentalCategoryMaster';
import { scAPI } from '../../api/client';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ['Working', 'Holiday', 'Breakdown', 'Standby', 'Rain Hold'];

const STATUS_BG = {
  Working:    '',
  Holiday:    'bg-amber-50',
  Breakdown:  'bg-red-50',
  Standby:    'bg-slate-100',
  'Rain Hold': 'bg-blue-50',
};

const IDLE_REASONS = [
  { code: 'ID-01', label: 'No work available' },
  { code: 'ID-02', label: 'Rain / weather hold' },
  { code: 'ID-03', label: 'Material not ready' },
  { code: 'ID-04', label: 'Structure not ready' },
  { code: 'ID-05', label: 'Client instruction' },
];

const BREAKDOWN_REASONS = [
  { code: 'BD-01', label: 'Mechanical breakdown' },
  { code: 'BD-02', label: 'Hydraulic failure' },
  { code: 'BD-03', label: 'Electrical fault' },
  { code: 'BD-04', label: 'Operator absent' },
  { code: 'BD-05', label: 'Tyre / track damage' },
];

const IDLE_RULES = ['None', 'Full', '50%', 'Custom%'];
const BREAKDOWN_RULES = ['None', 'Full'];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ──────────────────────────────────────────────────────────────────

const inr = v =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Extract equipment name from WO item description: "Hiring of Hydra Crane (12T) - Min 3hr" → "Hydra Crane (12T)"
const getEquipKey = (desc) =>
  (desc || '').replace(/^hiring of\s+/i, '').replace(/\s*[-–]\s*.+$/, '').trim();

function makeEmptyRow(date, equipment = '') {
  const d = dayjs(date);
  const isSunday = d.day() === 0;
  return {
    id: `${date}-0`,
    date,
    day: DAYS[d.day()],
    status: isSunday ? 'Holiday' : 'Working',
    equipment,
    shift: '1',
    startTime: '',
    endTime: '',
    grossHrs: 0,
    idleHrs: 0,
    idleReason: '',
    breakdownHrs: 0,
    breakdownReason: '',
    netHrs: 0,
    workDescription: '',
    location: '',
    engrInitial: '',
  };
}

function generateRows(from, to) {
  if (!from || !to) return [];
  const rows = [];
  let cur = dayjs(from);
  const end = dayjs(to);
  while (!cur.isAfter(end)) {
    rows.push(makeEmptyRow(cur.format('YYYY-MM-DD')));
    cur = cur.add(1, 'day');
  }
  return rows;
}

function computeGross(row) {
  if (!row.startTime || !row.endTime) return 0;
  const [sh, sm] = row.startTime.split(':').map(Number);
  const [eh, em] = row.endTime.split(':').map(Number);
  const gross = (eh * 60 + em - (sh * 60 + sm)) / 60;
  return Math.max(0, +gross.toFixed(2));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionBox({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-4 print:break-inside-avoid">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors print:pointer-events-none"
      >
        <span>{title}</span>
        <span className="print:hidden">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent';

const STATUS_BADGE = {
  Pending:  'bg-slate-100 text-slate-600',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

// ── Main Component ────────────────────────────────────────────────────────────

const LOG_CATEGORIES = RENTAL_CATEGORIES.filter(c => c.requiresLogSheet);

export default function CraneLogSheet({ category: categoryProp, vendorList: vendorListProp = [], woList: woListProp = [], approverList = [], onCertified }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pickedCode, setPickedCode] = useState(categoryProp?.code || location.state?.category?.code || 'CRANE');
  const category = categoryProp || LOG_CATEGORIES.find(c => c.code === pickedCode) || LOG_CATEGORIES[0];
  const isCrane = category?.code === 'CRANE';

  // Crane/hydra hire work orders are subcontractor work orders (sc_work_orders).
  // Fetch them when not supplied as props; the Vendor list is derived from these
  // WOs so the Vendor → WO filter is always consistent.
  const { data: fetchedWOs = [] } = useQuery({
    queryKey: ['sc-wos-for-log'],
    queryFn: () => scAPI.listWO({ limit: 1000 }).then(r => r.data?.data || r.data || []),
    enabled: woListProp.length === 0,
    staleTime: 5 * 60 * 1000,
  });
  const woList = woListProp.length > 0 ? woListProp : fetchedWOs.map(o => ({
    id: o.id,
    wo_number: o.wo_number || o.order_no || o.id,
    vendor_id: o.sc_id,
    vendor_name: o.sc_name || o.vendor_name || '',
    project_name: o.project_name || '',
  }));
  const vendorList = useMemo(() => {
    if (vendorListProp.length > 0) return vendorListProp;
    const map = new Map();
    for (const w of fetchedWOs) {
      if (w.sc_id && !map.has(w.sc_id)) map.set(w.sc_id, { id: w.sc_id, name: w.sc_name || w.vendor_name || '' });
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [vendorListProp, fetchedWOs]);

  // ── Section 1 — Header state ──
  const [header, setHeader] = useState({
    logNo: logSheetNumber(category?.billPrefix || 'CRN', 1),
    equipmentType: category?.label || '',
    capacity: '',
    regNo: '',
    vendorId: '',
    woId: '',
    projectLocation: '',
    operatorName: '',
    helperName: '',
    periodFrom: '',
    periodTo: '',
    billingUnit: category?.units?.[0] || 'Hours',
  });

  // ── Section 2 — Rows state ──
  const [rows, setRows] = useState([]);

  // ── Section 3 — Summary (derived) ──
  const summary = useMemo(() => {
    const byStatus = { Working: 0, Holiday: 0, Breakdown: 0, Standby: 0, 'Rain Hold': 0 };
    let totalGross = 0, totalIdle = 0, totalBdown = 0;
    const uniqueDates = new Set();
    rows.forEach(r => {
      uniqueDates.add(r.date);
      if (byStatus[r.status] !== undefined) byStatus[r.status]++;
      totalGross += Number(r.grossHrs) || 0;
      totalIdle  += Number(r.idleHrs)  || 0;
      totalBdown += Number(r.breakdownHrs) || 0;
    });
    const totalNet = Math.max(0, totalGross - totalIdle - totalBdown);
    const totalNetDays = +(totalNet / 8).toFixed(2);
    return {
      totalDays: uniqueDates.size,
      workingDays: byStatus.Working,
      holidayDays: byStatus.Holiday,
      breakdownDays: byStatus.Breakdown,
      standbyDays: byStatus.Standby,
      rainDays: byStatus['Rain Hold'],
      totalGross: +totalGross.toFixed(2),
      totalIdle:  +totalIdle.toFixed(2),
      totalBdown: +totalBdown.toFixed(2),
      totalNet:   +totalNet.toFixed(2),
      totalNetDays,
    };
  }, [rows]);

  // ── Section 4 — Deductions state ──
  const [ded, setDed] = useState({
    rate: '',
    idleRule: 'Full',
    customIdlePct: 50,
    breakdownRule: 'Full',
  });

  const dedCalc = useMemo(() => {
    const rate = Number(ded.rate) || 0;
    const grossAmount = +(summary.totalNet * rate).toFixed(2);
    let idleRate = 0;
    if (ded.idleRule === 'Full') idleRate = rate;
    else if (ded.idleRule === '50%') idleRate = rate * 0.5;
    else if (ded.idleRule === 'Custom%') idleRate = rate * ((Number(ded.customIdlePct) || 0) / 100);
    const idleDed = +(summary.totalIdle * idleRate).toFixed(2);
    const bdownRate = ded.breakdownRule === 'Full' ? rate : 0;
    const bdownDed = +(summary.totalBdown * bdownRate).toFixed(2);
    const netCertifiable = +(grossAmount - idleDed - bdownDed).toFixed(2);
    return { grossAmount, idleDed, bdownDed, netCertifiable };
  }, [summary, ded]);

  // ── Section 5 — Signatories state ──
  const initSignatories = [
    { role: 'Operator',        name: '', designation: 'Operator', date: '', status: 'Pending', remarks: '' },
    { role: 'Site Engineer',   name: '', designation: 'Site Engineer', date: '', status: 'Pending', remarks: '' },
    { role: 'Plant In-charge', name: '', designation: 'Plant In-charge', date: '', status: 'Pending', remarks: '' },
    { role: 'Project Manager', name: '', designation: 'Project Manager', date: '', status: 'Pending', remarks: '' },
  ];
  const [signatories, setSignatories] = useState(initSignatories);
  const [submitted, setSubmitted] = useState(false);

  // Fetch WO line items when a WO is selected
  const { data: woDetail } = useQuery({
    queryKey: ['sc-wo-detail', header.woId],
    queryFn: () => scAPI.getWO(header.woId).then(r => r.data?.data || r.data || null),
    enabled: !!header.woId,
    staleTime: 5 * 60 * 1000,
  });
  const woItems = woDetail?.items || [];

  // Group WO items by equipment type (e.g. "Hydra Crane (12 Ton)", "F15-Farana Crane")
  const equipmentGroups = useMemo(() => {
    const map = new Map();
    for (const item of woItems) {
      const key = getEquipKey(item.description) || 'Equipment';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [woItems]);
  const equipmentNames = useMemo(() => Array.from(equipmentGroups.keys()), [equipmentGroups]);

  // When WO items load, set default equipment on rows that have none
  useEffect(() => {
    if (equipmentNames.length > 0) {
      setRows(prev => prev.map(r => r.equipment ? r : { ...r, equipment: equipmentNames[0] }));
    }
  }, [equipmentNames.join(',')]); // eslint-disable-line

  // Auto-populate rate from first WO item when WO detail loads
  useEffect(() => {
    if (woItems.length > 0 && !ded.rate) {
      setDed(d => ({ ...d, rate: String(woItems[0].rate || '') }));
    }
  }, [woItems]); // eslint-disable-line

  // Auto-fill project location from WO
  useEffect(() => {
    if (!header.woId) return;
    const wo = woList.find(w => w.id === header.woId || w.wo_number === header.woId);
    if (wo) setHeader(h => ({ ...h, projectLocation: wo.project_name || wo.location || '' }));
  }, [header.woId, woList]);

  // Regenerate rows when period changes
  useEffect(() => {
    if (header.periodFrom && header.periodTo) {
      setRows(generateRows(header.periodFrom, header.periodTo));
    }
  }, [header.periodFrom, header.periodTo]);

  // ── Row helpers ──
  const updateRow = useCallback((id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Recompute auto fields
      if (field === 'startTime' || field === 'endTime') {
        updated.grossHrs = computeGross(updated);
      }
      updated.netHrs = Math.max(0, +(updated.grossHrs - (Number(updated.idleHrs) || 0) - (Number(updated.breakdownHrs) || 0)).toFixed(2));
      return updated;
    }));
  }, []);

  const addShift = useCallback((date) => {
    const base = makeEmptyRow(date);
    const existingCount = rows.filter(r => r.date === date).length;
    base.id = `${date}-${existingCount}`;
    base.shift = String(existingCount + 1);
    setRows(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].date === date) { idx = i; break; } }
      const next = [...prev];
      next.splice(idx + 1, 0, base);
      return next;
    });
  }, [rows]);

  // ── Signatory helpers ──
  const signAction = (idx, action, remarks) => {
    setSignatories(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      return { ...s, status: action === 'approve' ? 'Approved' : 'Rejected', date: dayjs().format('DD-MM-YYYY'), remarks };
    }));
  };

  const activeSignatoryIdx = useMemo(() => {
    if (!submitted) return -1;
    for (let i = 0; i < signatories.length; i++) {
      if (signatories[i].status === 'Pending') return i;
    }
    return -1;
  }, [submitted, signatories]);

  // ── Actions ──
  const handleSaveDraft = () => {
    toast.success('Log sheet draft saved');
  };

  const handleSubmit = () => {
    if (!header.periodFrom || !header.periodTo) {
      toast.error('Set billing period before submitting');
      return;
    }
    setSubmitted(true);
    toast.success('Submitted for certification');
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleLinkToInvoice = () => {
    if (activeSignatoryIdx !== -1 || signatories.some(s => s.status === 'Pending')) {
      toast.error('Complete all certifications before linking to invoice');
      return;
    }
    const payload = {
      netCertifiable: dedCalc.netCertifiable,
      logRef: header.logNo,
      certifiedHrs: summary.totalNet,
    };
    if (onCertified) {
      onCertified(payload);
    } else {
      navigate('/hire-rental/rental-invoice/new', { state: { linkedLog: payload, category } });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-4 print:p-0 print:bg-white">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <ClipboardList size={20} className="text-amber-500" />
          <h1 className="text-lg font-bold text-slate-800">Crane / Hydra Log Sheet</h1>
          {!categoryProp && (
            <select
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm ml-2"
              value={pickedCode}
              onChange={e => setPickedCode(e.target.value)}
            >
              {LOG_CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <Save size={14} /> Save Draft
          </button>
          {!submitted && (
            <button onClick={handleSubmit} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
              <Send size={14} /> Submit for Certification
            </button>
          )}
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 transition-colors">
            <FileDown size={14} /> Export PDF
          </button>
          <button onClick={handleLinkToInvoice} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
            <Link2 size={14} /> Link to Invoice →
          </button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block text-center mb-4">
        <div className="text-lg font-bold">BCIM Engineering Private Limited</div>
        <div className="text-base font-semibold mt-1">{category?.label?.toUpperCase()} LOG SHEET</div>
        <div className="text-sm text-slate-600">{header.logNo}</div>
      </div>

      {/* ── SECTION 1: LOG HEADER ── */}
      <SectionBox title="Section 1 — Log Header">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Log Sheet No." required>
            <input readOnly className={`${inp} bg-slate-50`} value={header.logNo} />
          </Field>
          <Field label="Equipment Type">
            <input readOnly className={`${inp} bg-slate-50`} value={header.equipmentType} />
          </Field>
          <Field label="Capacity (Tons)" required>
            <input type="number" className={inp} value={header.capacity} onChange={e => setHeader(h => ({ ...h, capacity: e.target.value }))} placeholder="e.g. 50" />
          </Field>
          <Field label="Reg. No." required>
            <input className={inp} value={header.regNo} onChange={e => setHeader(h => ({ ...h, regNo: e.target.value }))} placeholder="Vehicle / Reg. No." />
          </Field>
          <Field label="Vendor" required>
            <select className={inp} value={header.vendorId} onChange={e => setHeader(h => ({ ...h, vendorId: e.target.value, woId: '' }))}>
              <option value="">— Select Vendor —</option>
              {vendorList.map(v => (
                <option key={v.id || v.value} value={v.id || v.value}>{v.name || v.label}</option>
              ))}
            </select>
          </Field>
          <Field label="WO No." required>
            <select className={inp} value={header.woId} onChange={e => {
              const wo = woList.find(w => (w.id || w.wo_number) === e.target.value);
              setHeader(h => ({ ...h, woId: e.target.value, projectLocation: wo?.project_name || h.projectLocation }));
            }}>
              <option value="">— Select WO —</option>
              {woList
                .filter(w => !header.vendorId || String(w.vendor_id) === String(header.vendorId))
                .map(w => (
                  <option key={w.id || w.wo_number} value={w.id || w.wo_number}>{w.wo_number}</option>
                ))}
            </select>
          </Field>
          <Field label="Project / Location">
            <input className={inp} value={header.projectLocation} onChange={e => setHeader(h => ({ ...h, projectLocation: e.target.value }))} placeholder="Auto-filled from WO" />
          </Field>
          <Field label="Operator Name" required>
            <input className={inp} value={header.operatorName} onChange={e => setHeader(h => ({ ...h, operatorName: e.target.value }))} />
          </Field>
          {isCrane && (
            <Field label="Helper Name">
              <input className={inp} value={header.helperName} onChange={e => setHeader(h => ({ ...h, helperName: e.target.value }))} />
            </Field>
          )}
          <Field label="Billing Period From" required>
            <input type="date" className={inp} value={header.periodFrom} onChange={e => setHeader(h => ({ ...h, periodFrom: e.target.value }))} />
          </Field>
          <Field label="Billing Period To" required>
            <input type="date" className={inp} value={header.periodTo} onChange={e => setHeader(h => ({ ...h, periodTo: e.target.value }))} />
          </Field>
          <Field label="Billing Unit">
            <select className={inp} value={header.billingUnit} onChange={e => setHeader(h => ({ ...h, billingUnit: e.target.value }))}>
              {(category?.units || ['Hours', 'Days', 'Shifts']).map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
      </SectionBox>

      {/* ── SECTION 2: DAILY LOG TABLE ── */}
      <SectionBox title="Section 2 — Daily Log">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            Set a billing period in Section 1 to generate daily rows.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 1400 }}>
              <thead>
                <tr className="bg-slate-800 text-white">
                  {['Date', 'Day', 'Status', ...(equipmentNames.length > 1 ? ['Equipment'] : []), 'Shift', 'Start', 'End', 'Gross Hrs', 'Idle Hrs', 'Idle Reason', 'Bdown Hrs', 'Bdown Reason', 'Net Hrs', 'Work Description', 'Floor / Location', 'SE Initial', ''].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const netOk = row.netHrs <= row.grossHrs;
                  return (
                    <tr key={row.id} className={`border-b border-slate-100 ${STATUS_BG[row.status] || ''}`}>
                      <td className="px-2 py-1 whitespace-nowrap font-medium">{dayjs(row.date).format('DD-MM-YYYY')}</td>
                      <td className="px-2 py-1">{row.day}</td>
                      <td className="px-2 py-1">
                        <select className="border border-slate-300 rounded px-1 py-0.5 text-xs w-28" value={row.status} onChange={e => updateRow(row.id, 'status', e.target.value)} disabled={submitted}>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      {equipmentNames.length > 1 && (
                        <td className="px-2 py-1">
                          <select className="border border-indigo-300 rounded px-1 py-0.5 text-xs w-40 bg-indigo-50" value={row.equipment || equipmentNames[0]} onChange={e => updateRow(row.id, 'equipment', e.target.value)} disabled={submitted}>
                            {equipmentNames.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <input className="border border-slate-300 rounded px-1 py-0.5 text-xs w-10 text-center" value={row.shift} onChange={e => updateRow(row.id, 'shift', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="time" className="border border-slate-300 rounded px-1 py-0.5 text-xs" value={row.startTime} onChange={e => updateRow(row.id, 'startTime', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="time" className="border border-slate-300 rounded px-1 py-0.5 text-xs" value={row.endTime} onChange={e => updateRow(row.id, 'endTime', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1 text-center font-medium">{row.grossHrs}</td>
                      <td className="px-2 py-1">
                        <input type="number" min="0" step="0.5" className="border border-slate-300 rounded px-1 py-0.5 text-xs w-16" value={row.idleHrs} onChange={e => updateRow(row.id, 'idleHrs', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <select className="border border-slate-300 rounded px-1 py-0.5 text-xs w-36" value={row.idleReason} onChange={e => updateRow(row.id, 'idleReason', e.target.value)} disabled={submitted}>
                          <option value="">—</option>
                          {IDLE_REASONS.map(r => <option key={r.code} value={r.code}>{r.code} {r.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min="0" step="0.5" className="border border-slate-300 rounded px-1 py-0.5 text-xs w-16" value={row.breakdownHrs} onChange={e => updateRow(row.id, 'breakdownHrs', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <select className="border border-slate-300 rounded px-1 py-0.5 text-xs w-36" value={row.breakdownReason} onChange={e => updateRow(row.id, 'breakdownReason', e.target.value)} disabled={submitted}>
                          <option value="">—</option>
                          {BREAKDOWN_REASONS.map(r => <option key={r.code} value={r.code}>{r.code} {r.label}</option>)}
                        </select>
                      </td>
                      <td className={`px-2 py-1 text-center font-bold ${!netOk ? 'text-red-600' : 'text-green-700'}`}>{row.netHrs}</td>
                      <td className="px-2 py-1">
                        <input className="border border-slate-300 rounded px-1 py-0.5 text-xs w-40" value={row.workDescription} onChange={e => updateRow(row.id, 'workDescription', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <input className="border border-slate-300 rounded px-1 py-0.5 text-xs w-28" value={row.location} onChange={e => updateRow(row.id, 'location', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        <input className="border border-slate-300 rounded px-1 py-0.5 text-xs w-16 text-center" value={row.engrInitial} onChange={e => updateRow(row.id, 'engrInitial', e.target.value)} disabled={submitted} />
                      </td>
                      <td className="px-2 py-1">
                        {!submitted && (
                          <button onClick={() => addShift(row.date)} title="Add shift" className="p-1 text-amber-600 hover:text-amber-800">
                            <Plus size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-xs print:hidden">
          {Object.entries(STATUS_BG).map(([s, cls]) => (
            <span key={s} className={`flex items-center gap-1 px-2 py-1 rounded ${cls || 'bg-white border border-slate-200'}`}>
              <span className="font-medium">{s}</span>
            </span>
          ))}
        </div>
      </SectionBox>

      {/* ── SECTION 3: MONTHLY SUMMARY ── */}
      <SectionBox title="Section 3 — Monthly Summary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Total Days in Period', summary.totalDays],
            ['Working Days', summary.workingDays],
            ['Holiday / Sunday', summary.holidayDays],
            ['Breakdown Days', summary.breakdownDays],
            ['Standby Days', summary.standbyDays],
            ['Total Gross Hours', summary.totalGross],
            ['Total Idle Hours', summary.totalIdle],
            ['Total Breakdown Hours', summary.totalBdown],
          ].map(([lbl, val]) => (
            <div key={lbl} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">{lbl}</div>
              <div className="text-lg font-semibold text-slate-800 mt-0.5">{val}</div>
            </div>
          ))}
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 col-span-2">
            <div className="text-xs text-amber-700 font-medium">Total Net Billable Hours</div>
            <div className="text-2xl font-bold text-amber-700 mt-0.5">{summary.totalNet}</div>
          </div>
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
            <div className="text-xs text-amber-700 font-medium">Net Billable Days (÷8)</div>
            <div className="text-2xl font-bold text-amber-700 mt-0.5">{summary.totalNetDays}</div>
          </div>
        </div>
      </SectionBox>

      {/* ── SECTION 3.5: WO LINE ITEMS & BILL CALCULATION ── */}
      {woItems.length > 0 && (
        <SectionBox title="Section 3.5 — Work Order Line Items & Bill Calculation">
          {Array.from(equipmentGroups.entries()).map(([equipName, items], gi) => {
            // Hours for this equipment group from the daily log
            const eqRows   = rows.filter(r => (r.equipment || equipmentNames[0]) === equipName);
            const eqNet    = +eqRows.reduce((s, r) => s + (Number(r.netHrs)       || 0), 0).toFixed(2);
            const eqIdle   = +eqRows.reduce((s, r) => s + (Number(r.idleHrs)      || 0), 0).toFixed(2);
            const eqBdown  = +eqRows.reduce((s, r) => s + (Number(r.breakdownHrs) || 0), 0).toFixed(2);

            let grandNet = 0;
            return (
              <div key={equipName} className={gi > 0 ? 'mt-6' : ''}>
                {equipmentNames.length > 1 && (
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1">{equipName}</span>
                    <span className="text-xs text-slate-500">Net hrs from log: <strong className="text-blue-700">{eqNet}</strong> | Idle: <strong className="text-red-500">{eqIdle}</strong> | Bdown: <strong className="text-red-500">{eqBdown}</strong></span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-100 text-xs text-slate-600 uppercase">
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center">Unit</th>
                        <th className="px-3 py-2 text-right">Contract Qty</th>
                        <th className="px-3 py-2 text-right">Rate (₹)</th>
                        <th className="px-3 py-2 text-right">Certified Qty (Log)</th>
                        <th className="px-3 py-2 text-right">Gross Amt (₹)</th>
                        <th className="px-3 py-2 text-right">Idle Ded (₹)</th>
                        <th className="px-3 py-2 text-right">Bdown Ded (₹)</th>
                        <th className="px-3 py-2 text-right font-bold text-amber-700">Net Certifiable (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const rate     = Number(item.rate) || 0;
                        const certQty  = eqNet;
                        const grossAmt = +(certQty * rate).toFixed(2);
                        let idleRate   = 0;
                        if (ded.idleRule === 'Full')    idleRate = rate;
                        else if (ded.idleRule === '50%') idleRate = rate * 0.5;
                        else if (ded.idleRule === 'Custom%') idleRate = rate * ((Number(ded.customIdlePct) || 0) / 100);
                        const idleDed  = +(eqIdle  * idleRate).toFixed(2);
                        const bdownDed = +(eqBdown * (ded.breakdownRule === 'Full' ? rate : 0)).toFixed(2);
                        const netCert  = +(grossAmt - idleDed - bdownDed).toFixed(2);
                        grandNet += netCert;
                        return (
                          <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{item.description || '—'}</td>
                            <td className="px-3 py-2 text-center text-slate-600">{item.unit || header.billingUnit}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{item.qty ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{inr(rate)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700">{certQty}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{inr(grossAmt)}</td>
                            <td className="px-3 py-2 text-right text-red-600">({inr(idleDed)})</td>
                            <td className="px-3 py-2 text-right text-red-600">({inr(bdownDed)})</td>
                            <td className="px-3 py-2 text-right font-bold text-amber-700">{inr(netCert)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-300">
                        <td colSpan={9} className="px-3 py-2 text-right font-bold text-slate-800">{equipName} — Net Certifiable</td>
                        <td className="px-3 py-2 text-right font-bold text-lg text-amber-700">{inr(grandNet)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </SectionBox>
      )}

      {/* ── SECTION 4: DEDUCTION CALCULATOR ── */}
      <SectionBox title="Section 4 — Deduction Calculator">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Field label="Rate per Hour (₹)" required>
            <input type="number" className={inp} value={ded.rate} onChange={e => setDed(d => ({ ...d, rate: e.target.value }))} placeholder="0.00" />
          </Field>
          <Field label="Idle Deduction Rule">
            <select className={inp} value={ded.idleRule} onChange={e => setDed(d => ({ ...d, idleRule: e.target.value }))}>
              {IDLE_RULES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          {ded.idleRule === 'Custom%' && (
            <Field label="Custom Idle %">
              <input type="number" className={inp} value={ded.customIdlePct} onChange={e => setDed(d => ({ ...d, customIdlePct: e.target.value }))} />
            </Field>
          )}
          <Field label="Breakdown Deduction Rule">
            <select className={inp} value={ded.breakdownRule} onChange={e => setDed(d => ({ ...d, breakdownRule: e.target.value }))}>
              {BREAKDOWN_RULES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-md">
          {[
            ['Gross Amount (Net Hrs × Rate)', dedCalc.grossAmount, ''],
            ['Less: Idle Deduction', dedCalc.idleDed, 'text-red-600'],
            ['Less: Breakdown Deduction', dedCalc.bdownDed, 'text-red-600'],
          ].map(([lbl, val, cls]) => (
            <div key={lbl} className="flex justify-between items-center py-2 border-b border-slate-200 text-sm">
              <span className="text-slate-600">{lbl}</span>
              <span className={`font-medium ${cls}`}>{inr(val)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3">
            <span className="font-bold text-slate-800">Net Certifiable Amount</span>
            <span className="text-xl font-bold text-amber-600">{inr(dedCalc.netCertifiable)}</span>
          </div>
        </div>
      </SectionBox>

      {/* ── SECTION 5: CERTIFICATION BLOCK ── */}
      <SectionBox title="Section 5 — Certification">
        {!submitted && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0" />
            Submit the log sheet first to activate the certification sequence.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-xs text-slate-600 uppercase">
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Designation</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Remarks</th>
                <th className="px-3 py-2 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {signatories.map((s, idx) => {
                const isActive = submitted && idx === activeSignatoryIdx;
                return (
                  <SignatoryRow
                    key={s.role}
                    signatory={s}
                    isActive={isActive}
                    locked={!submitted || idx > activeSignatoryIdx}
                    onAction={(action, remarks) => signAction(idx, action, remarks)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionBox>

      {/* ── SECTION 6: ACTIONS (print-hidden) ── */}
      <div className="flex gap-3 mt-4 print:hidden">
        <button onClick={handleSaveDraft} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
          <Save size={14} /> Save Draft
        </button>
        {!submitted && (
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
            <Send size={14} /> Submit for Certification
          </button>
        )}
        <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700">
          <FileDown size={14} /> Export PDF A4
        </button>
        <button onClick={handleLinkToInvoice} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
          <Link2 size={14} /> Link to Invoice →
        </button>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

// ── Signatory row with inline approve/reject ──────────────────────────────────

function SignatoryRow({ signatory, isActive, locked, onAction }) {
  const [remarks, setRemarks] = useState('');
  const badgeCls = STATUS_BADGE[signatory.status] || 'bg-slate-100 text-slate-600';

  return (
    <tr className={`border-b border-slate-100 ${isActive ? 'bg-amber-50' : ''}`}>
      <td className="px-3 py-3 font-medium text-slate-700">{signatory.role}</td>
      <td className="px-3 py-3">
        <input
          className="border border-slate-300 rounded px-2 py-1 text-sm w-40"
          value={signatory.name}
          placeholder="Name"
          disabled={!isActive}
          readOnly={signatory.status !== 'Pending'}
        />
      </td>
      <td className="px-3 py-3 text-slate-600">{signatory.designation}</td>
      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{signatory.date || '—'}</td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${badgeCls}`}>
          {signatory.status === 'Approved' && <CheckCircle size={10} />}
          {signatory.status === 'Pending'  && <Clock size={10} />}
          {signatory.status}
        </span>
      </td>
      <td className="px-3 py-3">
        {isActive ? (
          <input
            className="border border-slate-300 rounded px-2 py-1 text-sm w-48"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Remarks (optional)"
          />
        ) : (
          <span className="text-slate-500 text-sm">{signatory.remarks || '—'}</span>
        )}
      </td>
      <td className="px-3 py-3 print:hidden">
        {isActive && (
          <div className="flex gap-2">
            <button
              onClick={() => onAction('approve', remarks)}
              className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 font-medium"
            >
              Approve
            </button>
            <button
              onClick={() => onAction('reject', remarks)}
              className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 font-medium"
            >
              Reject
            </button>
          </div>
        )}
        {locked && signatory.status === 'Pending' && (
          <span className="text-xs text-slate-400">Locked</span>
        )}
      </td>
    </tr>
  );
}
