// src/pages/hr-admin/PerformancePage.jsx
// Staff Performance Evaluation Form — KRA/KPI scoring with self + manager assessment
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, X, ChevronRight, Star, TrendingUp,
  Users, CheckCircle, Clock, Eye, Trash2, Award, FileText, Printer,
} from 'lucide-react';
import { hrEvaluationsAPI, hrEmployeesAPI } from '../../api/client';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

// ── helpers ──────────────────────────────────────────────────────────────────
const RATING_CFG = {
  'Outstanding':           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500',  pct: 100 },
  'Exceeds Expectations':  { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',     pct: 80  },
  'Meets Expectations':    { bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500',   pct: 60  },
  'Below Expectations':    { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',    pct: 40  },
  'Unsatisfactory':        { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',      pct: 20  },
};
const STATUS_CFG = {
  draft:            { label: 'Draft',            bg: 'bg-gray-100',    text: 'text-gray-600'    },
  self_submitted:   { label: 'Self Submitted',   bg: 'bg-blue-50',     text: 'text-blue-700'    },
  manager_reviewed: { label: 'Manager Reviewed', bg: 'bg-purple-50',   text: 'text-purple-700'  },
  approved:         { label: 'Approved',         bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  acknowledged:     { label: 'Acknowledged',     bg: 'bg-teal-50',     text: 'text-teal-700'    },
};
const SCORE_LABELS = { 1: 'Poor', 2: 'Below Avg', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const inp  = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100';
const lbl  = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1';
const NAVY = '#0A1F5C';

const PERF_PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body {
    margin:0 !important; padding:0 !important; background:#fff !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  nav, header, footer, aside,
  .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"],
  [class*="topbar"], [class*="Topbar"],
  [class*="navbar"], [class*="Navbar"] {
    display:none !important; width:0 !important; height:0 !important; overflow:hidden !important;
  }
  #perf-print-root {
    position:static !important; inset:auto !important; z-index:auto !important;
    background:#fff !important; display:block !important;
    padding:0 !important; overflow:visible !important; height:auto !important;
  }
  #perf-print-card {
    box-shadow:none !important; max-width:100% !important; width:100% !important;
    border-radius:0 !important;
  }
  .print-only { display:block !important; }
  .perf-sig-section { page-break-inside:avoid !important; margin-top:32px !important; }
}
@media screen {
  .print-only { display:none !important; }
}
`;

const calcWeightedScore = (kras) => {
  if (!kras?.length) return 0;
  let total = 0, wTotal = 0;
  kras.forEach(k => {
    const s = parseFloat(k.manager_score || k.self_score || 0);
    total  += s * (k.weight / 100) * 20; // 1-5 scale → 0-100
    wTotal += k.weight;
  });
  return wTotal > 0 ? Math.round((total / wTotal) * wTotal) : 0;
};

const ScoreDot = ({ score }) => (
  <div className="flex gap-1 items-center">
    {[1,2,3,4,5].map(n => (
      <div key={n} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
        ${n <= score ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{n}</div>
    ))}
  </div>
);

// ── KRA Evaluation Table inside the form ─────────────────────────────────────
function KRATable({ kras, onChange }) {
  const handleScore = (idx, field, val) => {
    const updated = kras.map((k, i) => i === idx ? { ...k, [field]: Number(val) } : k);
    onChange(updated);
  };
  const handleRemarks = (idx, val) => {
    const updated = kras.map((k, i) => i === idx ? { ...k, remarks: val } : k);
    onChange(updated);
  };

  const selfTotal    = useMemo(() => {
    if (!kras.length) return 0;
    return kras.reduce((s, k) => s + (parseFloat(k.self_score || 0) * k.weight / 100) * 20, 0).toFixed(1);
  }, [kras]);
  const managerTotal = useMemo(() => {
    if (!kras.length) return 0;
    return kras.reduce((s, k) => s + (parseFloat(k.manager_score || 0) * k.weight / 100) * 20, 0).toFixed(1);
  }, [kras]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: NAVY }}>
            <th className="text-left px-4 py-3 text-white text-xs font-semibold w-[32%]">KRA / KPI</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-[8%]">Weight</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-[20%]">Self Score (1–5)</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-[20%]">Manager Score (1–5)</th>
            <th className="text-left px-3 py-3 text-white text-xs font-semibold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {kras.map((k, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-3 font-medium text-gray-800">{k.kra}</td>
              <td className="px-3 py-3 text-center text-gray-600 font-semibold">{k.weight}%</td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1 items-center">
                  <select value={k.self_score || ''} onChange={e => handleScore(i, 'self_score', e.target.value)}
                    className="w-24 text-center px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400">
                    <option value="">—</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} – {SCORE_LABELS[n]}</option>)}
                  </select>
                  {k.self_score ? <span className="text-[10px] text-blue-600 font-medium">{SCORE_LABELS[k.self_score]}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1 items-center">
                  <select value={k.manager_score || ''} onChange={e => handleScore(i, 'manager_score', e.target.value)}
                    className="w-24 text-center px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400">
                    <option value="">—</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} – {SCORE_LABELS[n]}</option>)}
                  </select>
                  {k.manager_score ? <span className="text-[10px] text-purple-600 font-medium">{SCORE_LABELS[k.manager_score]}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <input value={k.remarks || ''} onChange={e => handleRemarks(i, e.target.value)}
                  placeholder="Optional remarks…" className={inp} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-50">
            <td className="px-4 py-3 font-bold text-gray-800">Weighted Total Score</td>
            <td className="px-3 py-3 text-center font-bold text-gray-600">100%</td>
            <td className="px-3 py-3 text-center">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-bold text-sm">
                {selfTotal} / 100
              </span>
            </td>
            <td className="px-3 py-3 text-center">
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-bold text-sm">
                {managerTotal} / 100
              </span>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Detail / Print View ───────────────────────────────────────────────────────
function DetailView({ ev, onClose }) {
  const rc = RATING_CFG[ev.overall_rating] || RATING_CFG['Meets Expectations'];
  const sc = STATUS_CFG[ev.status] || STATUS_CFG.draft;
  const kras = ev.kra_scores || [];

  const handlePrint = () => window.print();

  return (
    <div id="perf-print-root" className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <style>{PERF_PRINT_CSS}</style>
      <div id="perf-print-card" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">
        {/* Header (screen only) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Performance Evaluation Report</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors">
              <Printer size={14}/> Print
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18}/></button>
          </div>
        </div>

        {/* Letterhead (print only) */}
        <div className="print-only" style={{ borderBottom: '3px solid #0A1F5C', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/bcim-logo.png" alt="BCIM Logo" style={{ height: 54, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
              BCIM ENGINEERING PVT LTD
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0A1F5C', letterSpacing: 0.5, margin: '2px 0' }}>
              PERFORMANCE EVALUATION REPORT
            </div>
            <div style={{ fontSize: 9, color: '#444' }}>
              Eval Period: <strong>{ev.eval_period || '—'}</strong>&emsp;|&emsp;
              Eval Date: <strong>{ev.eval_date ? dayjs(ev.eval_date).format('DD MMM YYYY') : '—'}</strong>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Employee Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl">
            <div><p className="text-xs text-gray-500 mb-0.5">Employee</p><p className="font-semibold text-gray-800">{ev.employee_name}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Emp Code</p><p className="font-semibold text-gray-800">{ev.employee_code || '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Department</p><p className="font-semibold text-gray-800">{ev.dept_name || ev.department || '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Designation</p><p className="font-semibold text-gray-800">{ev.emp_designation || ev.designation || '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Eval Period</p><p className="font-semibold text-gray-800">{ev.eval_period || '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Eval Date</p><p className="font-semibold text-gray-800">{ev.eval_date ? dayjs(ev.eval_date).format('DD MMM YYYY') : '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Evaluator</p><p className="font-semibold text-gray-800">{ev.evaluator_name || '—'}</p></div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Status</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>{sc.label}</span>
            </div>
          </div>

          {/* Overall Score */}
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: `${NAVY}10` }}>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overall Rating</p>
              <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${rc.bg} ${rc.text}`}>{ev.overall_rating || '—'}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Self Score</p>
              <p className="text-2xl font-bold text-blue-600">{parseFloat(ev.self_total || 0).toFixed(1)}<span className="text-sm text-gray-400">/100</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Manager Score</p>
              <p className="text-2xl font-bold text-purple-600">{parseFloat(ev.manager_total || 0).toFixed(1)}<span className="text-sm text-gray-400">/100</span></p>
            </div>
            {ev.increment_recommended > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Increment Recommended</p>
                <p className="text-2xl font-bold text-emerald-600">{ev.increment_recommended}%</p>
              </div>
            )}
          </div>

          {/* KRA Table */}
          {kras.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">KRA / KPI Scores</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">KRA</th>
                      <th className="text-center px-3 py-2.5 text-gray-600 font-semibold text-xs">Weight</th>
                      <th className="text-center px-3 py-2.5 text-blue-600 font-semibold text-xs">Self</th>
                      <th className="text-center px-3 py-2.5 text-purple-600 font-semibold text-xs">Manager</th>
                      <th className="text-left px-3 py-2.5 text-gray-600 font-semibold text-xs">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kras.map((k, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{k.kra}</td>
                        <td className="px-3 py-2.5 text-center text-gray-500">{k.weight}%</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-blue-600">{k.self_score || '—'}</span>
                          {k.self_score ? <span className="text-gray-400 text-xs"> ({SCORE_LABELS[k.self_score]})</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-purple-600">{k.manager_score || '—'}</span>
                          {k.manager_score ? <span className="text-gray-400 text-xs"> ({SCORE_LABELS[k.manager_score]})</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{k.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Qualitative fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Key Strengths',             val: ev.strengths },
              { label: 'Areas of Improvement',      val: ev.areas_of_improvement },
              { label: 'Goals for Next Period',      val: ev.goals_next_period },
            ].map(({ label, val }) => val ? (
              <div key={label} className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{val}</p>
              </div>
            ) : null)}
          </div>

          {/* Signature section (print only) */}
          <div className="print-only perf-sig-section" style={{ marginTop: 32, borderTop: '1px solid #ccc', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
              {[
                { role: 'Employee Signature', name: ev.employee_name || '' },
                { role: 'Evaluator / Reporting Manager', name: ev.evaluator_name || '' },
                { role: 'HR Head / Approving Authority', name: '' },
              ].map(sig => (
                <div key={sig.role} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderBottom: '1.5px solid #333', marginBottom: 6, height: 40 }} />
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#0A1F5C' }}>{sig.role}</div>
                  <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>{sig.name}</div>
                  <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Date: ____________</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 8, color: '#888' }}>
              This is a system-generated report - BCIM Engineering Pvt Ltd | Printed on: {new Date().toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit Form Modal ──────────────────────────────────────────────────
function EvalFormModal({ editing, onClose }) {
  const qc = useQueryClient();

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-list'],
    queryFn:  () => hrEmployeesAPI.list().then(r => r.data),
  });
  const employees = empData?.data || [];

  const { data: tplData } = useQuery({
    queryKey: ['kra-template'],
    queryFn:  () => hrEvaluationsAPI.kraTemplate().then(r => r.data),
  });

  const defaultKras = useMemo(() => {
    const tpl = tplData?.data || [];
    if (editing?.kra_scores?.length) {
      return editing.kra_scores.map(k => ({ ...k }));
    }
    return tpl.map(k => ({ ...k, self_score: '', manager_score: '', remarks: '' }));
  }, [tplData, editing]);

  const [form, setForm] = useState(() => ({
    employee_id:           editing?.employee_id           || '',
    eval_period:           editing?.eval_period           || '',
    eval_date:             editing?.eval_date ? dayjs(editing.eval_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    strengths:             editing?.strengths             || '',
    areas_of_improvement:  editing?.areas_of_improvement  || '',
    goals_next_period:     editing?.goals_next_period     || '',
    increment_recommended: editing?.increment_recommended || '',
    kra_scores:            [],
  }));

  const [kras, setKras] = useState(defaultKras);

  // Update kras when template loads (for new form)
  React.useEffect(() => {
    if (!editing && tplData?.data?.length && kras.length === 0) {
      setKras(tplData.data.map(k => ({ ...k, self_score: '', manager_score: '', remarks: '' })));
    }
  }, [tplData]);

  const selfTotal = useMemo(() =>
    kras.reduce((s, k) => s + (parseFloat(k.self_score || 0) * k.weight / 100) * 20, 0).toFixed(1), [kras]);
  const managerTotal = useMemo(() =>
    kras.reduce((s, k) => s + (parseFloat(k.manager_score || 0) * k.weight / 100) * 20, 0).toFixed(1), [kras]);

  const saveMut = useMutation({
    mutationFn: (payload) => editing
      ? hrEvaluationsAPI.update(editing.id, payload)
      : hrEvaluationsAPI.create(payload),
    onSuccess: () => {
      toast.success(editing ? 'Evaluation updated' : 'Evaluation created');
      qc.invalidateQueries(['hr-evaluations']);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.employee_id) return toast.error('Select an employee');
    if (!form.eval_period) return toast.error('Enter evaluation period');
    saveMut.mutate({
      ...form,
      kra_scores:    kras,
      self_total:    parseFloat(selfTotal),
      manager_total: parseFloat(managerTotal),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <ClipboardList size={20} style={{ color: NAVY }}/> {editing ? 'Edit Evaluation' : 'New Performance Evaluation'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={lbl}>Employee *</label>
              <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inp} required>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} {e.employee_code ? `(${e.employee_code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Eval Period *</label>
              <input value={form.eval_period} onChange={e => setForm(f => ({ ...f, eval_period: e.target.value }))}
                placeholder="e.g. FY 2025-26 / Q1 2026" className={inp} required />
            </div>
            <div>
              <label className={lbl}>Eval Date</label>
              <input type="date" value={form.eval_date} onChange={e => setForm(f => ({ ...f, eval_date: e.target.value }))} className={inp} />
            </div>
          </div>

          {/* KRA Table */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Star size={16} className="text-amber-500"/> KRA / KPI Scoring
              <span className="text-xs text-gray-400 font-normal ml-1">(Score 1 = Poor … 5 = Excellent)</span>
            </h3>
            <KRATable kras={kras} onChange={setKras} />

            {/* Live score summary */}
            <div className="mt-3 flex gap-4 justify-end text-sm">
              <span className="px-3 py-1 bg-blue-50 rounded-lg text-blue-700 font-semibold">
                Self Total: <strong>{selfTotal}</strong>/100
              </span>
              <span className="px-3 py-1 bg-purple-50 rounded-lg text-purple-700 font-semibold">
                Manager Total: <strong>{managerTotal}</strong>/100
              </span>
            </div>
          </div>

          {/* Qualitative */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Key Strengths</label>
              <textarea rows={3} value={form.strengths} onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
                className={inp} placeholder="List key strengths…" />
            </div>
            <div>
              <label className={lbl}>Areas of Improvement</label>
              <textarea rows={3} value={form.areas_of_improvement} onChange={e => setForm(f => ({ ...f, areas_of_improvement: e.target.value }))}
                className={inp} placeholder="Development areas…" />
            </div>
            <div>
              <label className={lbl}>Goals for Next Period</label>
              <textarea rows={3} value={form.goals_next_period} onChange={e => setForm(f => ({ ...f, goals_next_period: e.target.value }))}
                className={inp} placeholder="Targets / KPIs for next period…" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-48">
              <label className={lbl}>Increment Recommended (%)</label>
              <input type="number" min="0" max="100" step="0.5"
                value={form.increment_recommended} onChange={e => setForm(f => ({ ...f, increment_recommended: e.target.value }))}
                className={inp} placeholder="0" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saveMut.isPending}
              className="px-6 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: NAVY }}>
              {saveMut.isPending ? 'Saving…' : editing ? 'Update Evaluation' : 'Save Evaluation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editing,  setEditing]    = useState(null);
  const [viewing,  setViewing]    = useState(null);
  const [filterStatus, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-evaluations'],
    queryFn:  () => hrEvaluationsAPI.list().then(r => r.data),
  });
  const rows = data?.data || [];

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => hrEvaluationsAPI.updateStatus(id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries(['hr-evaluations']); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => hrEvaluationsAPI.remove(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries(['hr-evaluations']); },
    onError: (e) => toast.error(e.response?.data?.error || 'Cannot delete'),
  });

  const filtered = filterStatus ? rows.filter(r => r.status === filterStatus) : rows;

  // KPI stats
  const totalEvals  = rows.length;
  const pendingMgr  = rows.filter(r => r.status === 'self_submitted').length;
  const approved    = rows.filter(r => r.status === 'approved').length;
  const avgScore    = rows.length
    ? (rows.reduce((s, r) => s + parseFloat(r.manager_total || r.self_total || 0), 0) / rows.length).toFixed(1)
    : '—';

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl" style={{ background: `linear-gradient(135deg, ${NAVY}, #1e3a8a)` }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }}/>
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                <ClipboardList size={16} className="text-white"/>
              </div>
              <span className="text-white/70 text-sm font-medium">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Performance Evaluation</h1>
            <p className="text-white/60 text-sm mt-0.5">Structured KRA/KPI evaluation forms for all staff</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-white text-sm font-semibold transition-colors">
            <Plus size={16}/> New Evaluation
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Evaluations', value: totalEvals, icon: FileText,    color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { label: 'Avg Score',         value: avgScore,   icon: TrendingUp,  color: 'text-purple-600',  bg: 'bg-purple-50'  },
          { label: 'Pending Review',    value: pendingMgr, icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50'   },
          { label: 'Approved',          value: approved,   icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={color}/>
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 font-medium">Filter:</span>
        {['', 'draft', 'self_submitted', 'manager_reviewed', 'approved', 'acknowledged'].map(s => {
          const cfg = s ? STATUS_CFG[s] : null;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                ${filterStatus === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
              {s ? cfg?.label : 'All'}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
            Loading evaluations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ClipboardList size={40} className="mb-3 opacity-30"/>
            <p className="font-medium">No evaluations found</p>
            <p className="text-sm mt-1">Click "New Evaluation" to create the first one</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Evaluator</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide">Self</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-purple-500 uppercase tracking-wide">Manager</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(ev => {
                const rc = RATING_CFG[ev.overall_rating] || {};
                const sc = STATUS_CFG[ev.status] || {};
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-800">{ev.employee_name}</p>
                      <p className="text-xs text-gray-400">{ev.employee_code} · {ev.dept_name || ev.department || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ev.eval_period || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{ev.evaluator_name || '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">
                      {ev.self_total ? `${parseFloat(ev.self_total).toFixed(1)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-purple-600">
                      {ev.manager_total ? `${parseFloat(ev.manager_total).toFixed(1)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ev.overall_rating
                        ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${rc.bg} ${rc.text}`}>{ev.overall_rating}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>{sc.label || ev.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewing(ev)} title="View"
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors"><Eye size={14}/></button>
                        <button onClick={() => { setEditing(ev); setShowForm(true); }} title="Edit"
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><FileText size={14}/></button>
                        {ev.status === 'draft' && (
                          <button onClick={() => statusMut.mutate({ id: ev.id, status: 'self_submitted' })} title="Submit"
                            className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-500 transition-colors"><ChevronRight size={14}/></button>
                        )}
                        {ev.status === 'self_submitted' && (
                          <button onClick={() => statusMut.mutate({ id: ev.id, status: 'manager_reviewed' })} title="Mark Reviewed"
                            className="p-1.5 hover:bg-purple-50 rounded-lg text-purple-500 transition-colors"><CheckCircle size={14}/></button>
                        )}
                        {ev.status === 'manager_reviewed' && (
                          <button onClick={() => statusMut.mutate({ id: ev.id, status: 'approved' })} title="Approve"
                            className="p-1.5 hover:bg-teal-50 rounded-lg text-teal-500 transition-colors"><Award size={14}/></button>
                        )}
                        {ev.status === 'draft' && (
                          <button onClick={() => { if (window.confirm('Delete this draft?')) deleteMut.mutate(ev.id); }}
                            title="Delete" className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors"><Trash2 size={14}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showForm  && <EvalFormModal editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {viewing   && <DetailView ev={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
