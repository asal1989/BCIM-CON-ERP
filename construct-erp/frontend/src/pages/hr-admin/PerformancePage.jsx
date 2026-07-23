// src/pages/hr-admin/PerformancePage.jsx
// BCIM Employee Performance Review Form — Monthly / Quarterly
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, X, ChevronRight, Star, TrendingUp,
  Users, CheckCircle, Clock, Eye, Trash2, Award, FileText, Printer, XCircle,
} from 'lucide-react';
import { hrEvaluationsAPI, hrEmployeesAPI } from '../../api/client';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

// ── constants ─────────────────────────────────────────────────────────────────
const NAVY = '#0A1F5C';
const inp  = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100';
const lbl  = 'text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1';

const SCORE_LABELS = {
  1: 'Unsatisfactory',
  2: 'Needs Improvement',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
};

const RATING_CFG = {
  'Outstanding':       { bg: 'bg-emerald-50', text: 'text-emerald-700', pct: 95 },
  'Very Good':         { bg: 'bg-blue-50',    text: 'text-blue-700',    pct: 85 },
  'Good':              { bg: 'bg-indigo-50',  text: 'text-indigo-700',  pct: 75 },
  'Satisfactory':      { bg: 'bg-amber-50',   text: 'text-amber-700',   pct: 65 },
  'Needs Improvement': { bg: 'bg-red-50',     text: 'text-red-700',     pct: 30 },
};

// 4-stage approval chain: Immediate Manager -> Project Manager -> HR Manager -> Managing Director
const STATUS_CFG = {
  draft:            { label: 'Draft',                        bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400'    },
  self_submitted:   { label: 'Self Submitted',                bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500'    },
  manager_approved: { label: 'Immediate Manager Approved',    bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  pm_approved:      { label: 'Project Manager Approved',      bg: 'bg-purple-50',   text: 'text-purple-700',  dot: 'bg-purple-500'  },
  hr_approved:      { label: 'HR Manager Approved',           bg: 'bg-pink-50',     text: 'text-pink-700',    dot: 'bg-pink-500'    },
  approved:         { label: 'MD Approved',                   bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  acknowledged:     { label: 'Acknowledged',                  bg: 'bg-teal-50',     text: 'text-teal-700',    dot: 'bg-teal-500'    },
  rejected:         { label: 'Rejected',                      bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500'     },
};

const APPROVAL_STAGES = [
  { from: 'self_submitted',   to: 'manager_approved', label: 'Approve — Immediate Manager', icon: 'ChevronRight' },
  { from: 'manager_approved', to: 'pm_approved',      label: 'Approve — Project Manager',   icon: 'ChevronRight' },
  { from: 'pm_approved',      to: 'hr_approved',       label: 'Approve — HR Manager',        icon: 'ChevronRight' },
  { from: 'hr_approved',      to: 'approved',          label: 'Approve — Managing Director', icon: 'Award' },
];

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Rating scale legend (matches document)
const RATING_SCALE = [
  { score: 5, label: 'Outstanding'         },
  { score: 4, label: 'Exceeds Expectations'},
  { score: 3, label: 'Meets Expectations'  },
  { score: 2, label: 'Needs Improvement'   },
  { score: 1, label: 'Unsatisfactory'      },
];

// Overall performance rating bands (matches document)
const OVERALL_BANDS = [
  { label: 'Outstanding',       range: '90–100' },
  { label: 'Very Good',         range: '80–89'  },
  { label: 'Good',              range: '70–79'  },
  { label: 'Satisfactory',      range: '60–69'  },
  { label: 'Needs Improvement', range: 'Below 60' },
];

// ── Print CSS ─────────────────────────────────────────────────────────────────
// Turns the on-screen modal into a proper standalone A4 document: flattens the
// screen "card" chrome (rounded corners/shadows) into bordered form sections,
// keeps each section from splitting awkwardly across a page break, and gives
// tables real borders + row-level break protection instead of relying on the
// screen styling to carry over as-is.
const PERF_PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm 10mm; }
  html, body {
    height:auto !important; min-height:0 !important; overflow:visible !important;
    margin:0 !important; padding:0 !important; background:#fff !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  /* The app shell (Layout) pins overflow:hidden + a fixed viewport height on its
     root wrapper, which clips print output to a single page — unlock it here. */
  .erp-layout-enter, .erp-layout-enter > *, .erp-layout-enter > * > *,
  #root, body > div {
    height:auto !important; max-height:none !important; overflow:visible !important;
  }
  /* Hide literally everything else on the page — including the list view
     behind this modal — and show only the print report itself. This is more
     reliable than hiding individual elements by class, since it doesn't
     depend on enumerating every sibling that must not print. */
  body * { visibility:hidden !important; }
  #perf-print-root, #perf-print-root * { visibility:visible !important; }
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
    border-radius:0 !important; height:auto !important; display:block !important;
  }
  #perf-print-body {
    overflow:visible !important; height:auto !important; display:block !important;
    padding:0 !important;
  }
  .print-only { display:block !important; }

  /* Flatten every screen "card" into a plain bordered form section, and never
     let a section split mid-way across a page break. */
  .perf-block {
    border-radius:0 !important; box-shadow:none !important;
    border:1px solid #b6bfcc !important; background:#fff !important;
    padding:9px 12px !important; margin:0 0 9px 0 !important;
    page-break-inside:avoid !important; break-inside:avoid !important;
  }
  .perf-block + .perf-block { margin-top:9px !important; }
  .perf-info-grid { display:grid !important; grid-template-columns:repeat(3, 1fr) !important; gap:6px 16px !important; }
  .perf-qual-grid { display:grid !important; grid-template-columns:repeat(3, 1fr) !important; gap:9px !important; }
  .perf-goals-grid { display:grid !important; grid-template-columns:repeat(2, 1fr) !important; gap:9px !important; }

  table { border-collapse:collapse !important; width:100% !important; }
  table th, table td { border:1px solid #b6bfcc !important; }
  table tr { page-break-inside:avoid !important; break-inside:avoid !important; }
  table thead { display:table-header-group; } /* repeat header row if a table spans pages */

  .perf-sig-section {
    page-break-inside:avoid !important; break-inside:avoid !important;
    margin-top:16px !important; border-top:1px solid #b6bfcc; padding-top:14px;
  }
}
@media screen {
  .print-only { display:none !important; }
}
`;

// ── KRA Table ─────────────────────────────────────────────────────────────────
function KRATable({ kras, onChange }) {
  const handleScore = (idx, field, val) => {
    onChange(kras.map((k, i) => i === idx ? { ...k, [field]: Number(val) } : k));
  };
  const handleRemarks = (idx, val) => {
    onChange(kras.map((k, i) => i === idx ? { ...k, remarks: val } : k));
  };

  const selfTotal = useMemo(() =>
    kras.reduce((s, k) => s + (parseFloat(k.self_score || 0) * k.weight / 100) * 20, 0).toFixed(1), [kras]);
  const managerTotal = useMemo(() =>
    kras.reduce((s, k) => s + (parseFloat(k.manager_score || 0) * k.weight / 100) * 20, 0).toFixed(1), [kras]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: NAVY }}>
            <th className="text-left px-4 py-3 text-white text-xs font-semibold w-8">Sl.</th>
            <th className="text-left px-4 py-3 text-white text-xs font-semibold">Performance Parameter</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-24">Weightage</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-40">Rating (1–5)</th>
            <th className="text-center px-3 py-3 text-white text-xs font-semibold w-40">Manager Score (1–5)</th>
            <th className="text-left px-3 py-3 text-white text-xs font-semibold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {kras.map((k, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-3 text-center text-gray-500 font-medium">{i + 1}</td>
              <td className="px-4 py-3 font-medium text-gray-800">{k.kra}</td>
              <td className="px-3 py-3 text-center font-semibold text-gray-700">{k.weight}</td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1 items-center">
                  <select value={k.self_score || ''} onChange={e => handleScore(i, 'self_score', e.target.value)}
                    className="w-28 text-center px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400">
                    <option value="">—</option>
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} – {SCORE_LABELS[n]}</option>)}
                  </select>
                  {k.self_score ? <span className="text-[10px] text-blue-600 font-medium">{SCORE_LABELS[k.self_score]}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1 items-center">
                  <select value={k.manager_score || ''} onChange={e => handleScore(i, 'manager_score', e.target.value)}
                    className="w-28 text-center px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400">
                    <option value="">—</option>
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} – {SCORE_LABELS[n]}</option>)}
                  </select>
                  {k.manager_score ? <span className="text-[10px] text-purple-600 font-medium">{SCORE_LABELS[k.manager_score]}</span> : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <input value={k.remarks || ''} onChange={e => handleRemarks(i, e.target.value)}
                  placeholder="Optional…" className={inp} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-100">
            <td colSpan={2} className="px-4 py-3 font-bold text-gray-800">Total Score</td>
            <td className="px-3 py-3 text-center font-bold text-gray-700">100</td>
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
  const rc = RATING_CFG[ev.overall_rating] || RATING_CFG['Satisfactory'];
  const sc = STATUS_CFG[ev.status] || STATUS_CFG.draft;
  const kras = ev.kra_scores || [];
  const reviewLabel = ev.review_type === 'quarterly' ? 'Quarterly' : 'Monthly';

  return (
    <div id="perf-print-root" className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center overflow-hidden">
      <style>{PERF_PRINT_CSS}</style>
      <div id="perf-print-card" className="bg-white w-full flex flex-col" style={{ maxWidth: '100vw' }}>

        {/* Screen header */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Performance Review Report</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors">
              <Printer size={14}/> Print
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18}/></button>
          </div>
        </div>

        {/* Print letterhead */}
        <div className="print-only" style={{ borderBottom: `3px solid ${NAVY}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/bcim-logo.png" alt="BCIM" style={{ height: 52, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>BCIM Engineering Private Limited</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '2px 0' }}>EMPLOYEE PERFORMANCE REVIEW FORM</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#333' }}>(MONTHLY / QUARTERLY)</div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 3 }}>Applicable to All Department Employees</div>
          </div>
        </div>

        <div id="perf-print-body" className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Review type badge */}
          <div className="perf-block flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Review Type:</span>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${ev.review_type === 'quarterly' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
              {reviewLabel}
            </span>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>{sc.label}</span>
          </div>

          {ev.status === 'rejected' && ev.rejection_reason && (
            <div className="perf-block p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Rejection Reason</p>
              <p className="text-sm text-red-800">{ev.rejection_reason}</p>
            </div>
          )}

          {/* Employee info */}
          <div className="perf-block perf-info-grid grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
            {[
              ['Employee Name', ev.employee_name],
              ['Emp. ID / Code', ev.employee_code || '—'],
              ['Designation', ev.emp_designation || ev.designation || '—'],
              ['Department', ev.dept_name || ev.department || '—'],
              ['Project / Site', ev.project_site || '—'],
              ['Review Period', ev.eval_period || '—'],
              ['Review Date', ev.eval_date ? dayjs(ev.eval_date).format('DD MMM YYYY') : '—'],
              ['Immediate Manager', ev.evaluator_name || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{k}</p>
                <p className="text-sm font-semibold text-gray-800">{v}</p>
              </div>
            ))}
          </div>

          {/* Rating scale legend */}
          <div className="perf-block p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs font-bold text-amber-800 mb-2">Rating Scale</p>
            <div className="flex flex-wrap gap-3">
              {RATING_SCALE.map(r => (
                <span key={r.score} className="text-xs text-amber-700">
                  <strong>{r.score}</strong> = {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* KRA scores table */}
          {kras.length > 0 && (
            <div className="perf-block">
              <h3 className="font-semibold text-gray-700 mb-3">KRA / KPI Scoring</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: NAVY }}>
                      <th className="text-left px-3 py-2.5 text-white text-xs font-semibold w-8">Sl.</th>
                      <th className="text-left px-3 py-2.5 text-white text-xs font-semibold">Performance Parameter</th>
                      <th className="text-center px-3 py-2.5 text-white text-xs font-semibold">Wt.</th>
                      <th className="text-center px-3 py-2.5 text-white text-xs font-semibold">Self</th>
                      <th className="text-center px-3 py-2.5 text-white text-xs font-semibold">Manager</th>
                      <th className="text-left px-3 py-2.5 text-white text-xs font-semibold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kras.map((k, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2.5 text-center text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{k.kra}</td>
                        <td className="px-3 py-2.5 text-center text-gray-600">{k.weight}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-blue-600">{k.self_score || '—'}</span>
                          {k.self_score ? <span className="text-gray-400 text-xs block">{SCORE_LABELS[k.self_score]}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-purple-600">{k.manager_score || '—'}</span>
                          {k.manager_score ? <span className="text-gray-400 text-xs block">{SCORE_LABELS[k.manager_score]}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{k.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-100">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-gray-800">Total Score</td>
                      <td className="px-3 py-2.5 text-center font-bold">100</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-bold text-blue-700">{parseFloat(ev.self_total || 0).toFixed(1)} / 100</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-bold text-purple-700">{parseFloat(ev.manager_total || 0).toFixed(1)} / 100</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Overall rating */}
          <div className="perf-block p-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Overall Performance Rating</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {OVERALL_BANDS.map(b => (
                <span key={b.label}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${ev.overall_rating === b.label
                    ? `${RATING_CFG[b.label]?.bg} ${RATING_CFG[b.label]?.text} border-current`
                    : 'bg-white text-gray-400 border-gray-200'}`}>
                  {b.label} ({b.range})
                </span>
              ))}
            </div>
            {ev.increment_recommended > 0 && (
              <p className="text-sm text-emerald-700 font-semibold">Increment Recommended: {ev.increment_recommended}%</p>
            )}
          </div>

          {/* Qualitative fields */}
          <div className="perf-qual-grid grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Major Strengths',        val: ev.strengths },
              { label: 'Areas for Improvement',  val: ev.areas_of_improvement },
              { label: 'Training Required',       val: ev.training_required },
            ].map(({ label, val }) => (
              <div key={label} className="perf-block p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[48px]">{val || '—'}</p>
              </div>
            ))}
          </div>

          {/* Goals & Comments */}
          <div className="perf-goals-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            {ev.goals_next_period && (
              <div className="perf-block p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Goals for Next Period</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ev.goals_next_period}</p>
              </div>
            )}
            {ev.comments_remarks && (
              <div className="perf-block p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Comments / Remarks</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ev.comments_remarks}</p>
              </div>
            )}
          </div>

          {/* Signature section */}
          <div className="print-only perf-sig-section" style={{ borderTop: '1px solid #ccc', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              {[
                { role: 'Employee Signature',    name: ev.employee_name || '' },
                { role: 'Immediate Manager',     name: ev.evaluator_name || '' },
                { role: 'Project Manager',       name: '' },
                { role: 'HR Manager',            name: '' },
                { role: 'Managing Director',     name: '' },
              ].map(sig => (
                <div key={sig.role} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ borderBottom: '1.5px solid #333', marginBottom: 5, height: 36 }} />
                  <div style={{ fontSize: 8, fontWeight: 700, color: NAVY }}>{sig.role}</div>
                  {sig.name && <div style={{ fontSize: 7, color: '#555', marginTop: 2 }}>{sig.name}</div>}
                  <div style={{ fontSize: 7, color: '#888', marginTop: 2 }}>Date: ____________</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 7, color: '#aaa' }}>
              System-generated · BCIM Engineering Pvt Ltd · {new Date().toLocaleString('en-IN')}
            </div>
          </div>

          {/* Screen signature section */}
          <div className="no-print border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Signatures (on print)</p>
            <div className="grid grid-cols-5 gap-3">
              {['Employee', 'Immediate Manager', 'Project Manager', 'HR Manager', 'Managing Director'].map(role => (
                <div key={role} className="text-center p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <p className="text-xs text-gray-500 font-medium">{role}</p>
                  <div className="mt-2 h-6 border-b border-gray-300"/>
                </div>
              ))}
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

  const [form, setForm] = useState(() => ({
    employee_id:           editing?.employee_id           || '',
    eval_period:           editing?.eval_period           || '',
    eval_date:             editing?.eval_date ? dayjs(editing.eval_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    review_type:           editing?.review_type           || 'monthly',
    project_site:          editing?.project_site          || '',
    strengths:             editing?.strengths             || '',
    areas_of_improvement:  editing?.areas_of_improvement  || '',
    goals_next_period:     editing?.goals_next_period     || '',
    training_required:     editing?.training_required     || '',
    comments_remarks:      editing?.comments_remarks      || '',
    increment_recommended: editing?.increment_recommended || '',
  }));

  // Month/Quarter + Year pickers that compose form.eval_period (e.g. "July 2026" / "Q2 2026")
  const parsedPeriod = useMemo(() => {
    const raw = editing?.eval_period || '';
    const qMatch = raw.match(/Q([1-4])\s*(\d{4})/i);
    if (qMatch) return { month: dayjs().month(), quarter: parseInt(qMatch[1], 10), year: parseInt(qMatch[2], 10) };
    const mMatch = MONTH_NAMES.findIndex(m => raw.toLowerCase().startsWith(m.toLowerCase()));
    const yMatch = raw.match(/(\d{4})/);
    return {
      month: mMatch >= 0 ? mMatch : dayjs().month(),
      quarter: Math.floor(dayjs().month() / 3) + 1,
      year: yMatch ? parseInt(yMatch[1], 10) : dayjs().year(),
    };
  }, [editing]);
  const [periodMonth, setPeriodMonth]     = useState(parsedPeriod.month);
  const [periodQuarter, setPeriodQuarter] = useState(parsedPeriod.quarter);
  const [periodYear, setPeriodYear]       = useState(parsedPeriod.year);

  React.useEffect(() => {
    const period = form.review_type === 'quarterly'
      ? `Q${periodQuarter} ${periodYear}`
      : `${MONTH_NAMES[periodMonth]} ${periodYear}`;
    setForm(f => (f.eval_period === period ? f : { ...f, eval_period: period }));
  }, [form.review_type, periodMonth, periodQuarter, periodYear]);

  const [kras, setKras] = useState(() => {
    if (editing?.kra_scores?.length) return editing.kra_scores.map(k => ({ ...k }));
    return [];
  });

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
      toast.success(editing ? 'Evaluation updated' : 'Evaluation saved');
      qc.invalidateQueries(['hr-evaluations']);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.employee_id) return toast.error('Select an employee');
    if (!form.eval_period) return toast.error('Enter review period');
    saveMut.mutate({
      ...form,
      kra_scores:    kras,
      self_total:    parseFloat(selfTotal),
      manager_total: parseFloat(managerTotal),
    });
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center overflow-hidden">
      <div className="bg-white w-full flex flex-col" style={{ maxWidth: '100vw' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: NAVY, borderRadius: '16px 16px 0 0' }}>
          <div>
            <h2 className="font-bold text-white text-base">
              {editing ? 'Edit Evaluation' : 'New Performance Evaluation'}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">BCIM Engineering Pvt Ltd — Monthly / Quarterly Review</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} className="text-white"/></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Review type */}
          <div className="flex items-center gap-6 p-3 bg-blue-50 rounded-xl">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Review Period:</span>
            {['monthly', 'quarterly'].map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="review_type" value={type}
                  checked={form.review_type === type}
                  onChange={e => set('review_type', e.target.value)}
                  className="accent-blue-600" />
                <span className="text-sm font-semibold text-gray-700 capitalize">{type === 'monthly' ? '☐ Monthly' : '☐ Quarterly'}</span>
              </label>
            ))}
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={lbl}>Employee Name *</label>
              <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className={inp} required>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>{form.review_type === 'quarterly' ? 'Review Quarter *' : 'Review Month *'}</label>
              <div className="flex gap-2">
                {form.review_type === 'quarterly' ? (
                  <select value={periodQuarter} onChange={e => setPeriodQuarter(Number(e.target.value))} className={inp} required>
                    {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                ) : (
                  <select value={periodMonth} onChange={e => setPeriodMonth(Number(e.target.value))} className={inp} required>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                )}
                <select value={periodYear} onChange={e => setPeriodYear(Number(e.target.value))} className={inp} style={{ maxWidth: 110 }} required>
                  {Array.from({ length: 6 }, (_, i) => dayjs().year() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>Review Date</label>
              <input type="date" value={form.eval_date} onChange={e => set('eval_date', e.target.value)} className={inp} />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>Project / Site</label>
              <input value={form.project_site} onChange={e => set('project_site', e.target.value)}
                placeholder="e.g. Godrej Ascend, HO" className={inp} />
            </div>
          </div>

          {/* Rating scale reference */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-xs font-bold text-amber-800 mb-1.5">Rating Scale</p>
            <div className="flex flex-wrap gap-4">
              {RATING_SCALE.map(r => (
                <span key={r.score} className="text-xs text-amber-700"><strong>{r.score}</strong> = {r.label}</span>
              ))}
            </div>
          </div>

          {/* KRA Table */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Star size={15} className="text-amber-500"/> KRA / KPI Scoring
            </h3>
            <KRATable kras={kras} onChange={setKras} />
            <div className="mt-3 flex gap-4 justify-end text-sm">
              <span className="px-3 py-1 bg-blue-50 rounded-lg text-blue-700 font-semibold">
                Self Total: <strong>{selfTotal}</strong>/100
              </span>
              <span className="px-3 py-1 bg-purple-50 rounded-lg text-purple-700 font-semibold">
                Manager Total: <strong>{managerTotal}</strong>/100
              </span>
            </div>
          </div>

          {/* Overall rating bands reference */}
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-xs font-bold text-gray-600 mb-1.5">Overall Performance Rating</p>
            <div className="flex flex-wrap gap-2">
              {OVERALL_BANDS.map(b => (
                <span key={b.label} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RATING_CFG[b.label]?.bg} ${RATING_CFG[b.label]?.text}`}>
                  {b.label} ({b.range})
                </span>
              ))}
            </div>
          </div>

          {/* Qualitative fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Major Strengths</label>
              <textarea rows={3} value={form.strengths} onChange={e => set('strengths', e.target.value)}
                className={inp} placeholder="List key strengths…" />
            </div>
            <div>
              <label className={lbl}>Areas for Improvement</label>
              <textarea rows={3} value={form.areas_of_improvement} onChange={e => set('areas_of_improvement', e.target.value)}
                className={inp} placeholder="Development areas…" />
            </div>
            <div>
              <label className={lbl}>Training Required</label>
              <textarea rows={3} value={form.training_required} onChange={e => set('training_required', e.target.value)}
                className={inp} placeholder="Training needs identified…" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Goals for Next Period</label>
              <textarea rows={3} value={form.goals_next_period} onChange={e => set('goals_next_period', e.target.value)}
                className={inp} placeholder="Targets / KPIs for next period…" />
            </div>
            <div>
              <label className={lbl}>Comments / Remarks (MD / Department Head)</label>
              <textarea rows={3} value={form.comments_remarks} onChange={e => set('comments_remarks', e.target.value)}
                className={inp} placeholder="Management comments…" />
            </div>
          </div>

          <div className="w-48">
            <label className={lbl}>Increment Recommended (%)</label>
            <input type="number" min="0" max="100" step="0.5"
              value={form.increment_recommended} onChange={e => set('increment_recommended', e.target.value)}
              className={inp} placeholder="0" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saveMut.isPending}
              className="px-6 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: NAVY }}>
              {saveMut.isPending ? 'Saving…' : editing ? 'Update' : 'Save Evaluation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const avatarGrad = (n) => {
  const palette = [['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED']];
  return palette[(n?.charCodeAt(0) || 0) % palette.length];
};
const initials = (n) => (n || 'U').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editing,  setEditing]    = useState(null);
  const [viewing,  setViewing]    = useState(null);
  const [filterStatus, setFilter] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDept,  setFilterDept]  = useState('');

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

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => hrEvaluationsAPI.reject(id, reason),
    onSuccess: () => { toast.success('Evaluation rejected'); qc.invalidateQueries(['hr-evaluations']); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const departments = useMemo(() => [...new Set(rows.map(r => r.dept_name).filter(Boolean))].sort(), [rows]);
  const months = useMemo(() => [...new Set(rows.map(r => r.eval_period).filter(Boolean))], [rows]);

  const filtered = rows.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterMonth  || r.eval_period === filterMonth) &&
    (!filterDept   || r.dept_name === filterDept)
  );

  const totalEvals = rows.length;
  const pendingMgr = rows.filter(r => ['self_submitted','manager_approved','pm_approved','hr_approved'].includes(r.status)).length;
  const approved   = rows.filter(r => r.status === 'approved').length;
  const avgScore   = rows.length
    ? (rows.reduce((s, r) => s + parseFloat(r.manager_total || r.self_total || 0), 0) / rows.length).toFixed(1)
    : '—';

  // Real month-over-month deltas (not decorative) — compares evaluations dated
  // in the current calendar month against the previous one, using eval_date.
  const trend = useMemo(() => {
    const now = dayjs();
    const inMonth = (r, offset) => r.eval_date && dayjs(r.eval_date).isSame(now.subtract(offset, 'month'), 'month');
    const thisM = rows.filter(r => inMonth(r, 0));
    const lastM = rows.filter(r => inMonth(r, 1));
    const pct = (curr, prev) => {
      if (!prev) return curr ? { text: 'New', up: true } : null;
      const delta = ((curr - prev) / prev) * 100;
      return { text: `${Math.abs(delta).toFixed(1)}%`, up: delta >= 0 };
    };
    const avgOf = list => list.length
      ? list.reduce((s, r) => s + parseFloat(r.manager_total || r.self_total || 0), 0) / list.length
      : 0;
    return {
      total:    pct(thisM.length, lastM.length),
      avgScore: pct(avgOf(thisM), avgOf(lastM)),
      pending:  pct(thisM.filter(r => ['self_submitted','manager_approved','pm_approved','hr_approved'].includes(r.status)).length,
                     lastM.filter(r => ['self_submitted','manager_approved','pm_approved','hr_approved'].includes(r.status)).length),
      approved: pct(thisM.filter(r => r.status === 'approved').length, lastM.filter(r => r.status === 'approved').length),
    };
  }, [rows]);

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Everything below (header, stats, filters, table) must never print —
          only the DetailView print modal (rendered at the bottom of this
          component) should ever end up on paper. */}
      <div className="no-print space-y-6">

      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(120deg, #4338CA 0%, #7C3AED 55%, #C026D3 100%)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.12]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-30%)' }}/>
        <div className="absolute bottom-0 left-1/3 w-56 h-56 rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(-25%,40%)' }}/>
        <div className="relative z-10 px-8 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <ClipboardList size={16} className="text-white"/>
              </div>
              <span className="text-white/70 text-sm font-medium">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Performance Evaluation</h1>
            <p className="text-white/70 text-sm mt-0.5">Monthly / Quarterly KRA-based review for all department employees</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-white/90 transition-colors">
            <Plus size={16}/> New Evaluation
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Evaluations', value: totalEvals, icon: FileText,    color: '#2563EB', bg: 'bg-blue-50',    trend: trend.total    },
          { label: 'Average Score',    value: `${avgScore}/100`, icon: TrendingUp, color: '#9333EA', bg: 'bg-purple-50',  trend: trend.avgScore },
          { label: 'Pending Review',   value: pendingMgr, icon: Clock,       color: '#D97706', bg: 'bg-amber-50',   trend: trend.pending, invert: true },
          { label: 'Approved',         value: approved,   icon: CheckCircle, color: '#059669', bg: 'bg-emerald-50', trend: trend.approved },
        ].map(({ label, value, icon: Icon, color, bg, trend: t, invert }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={18} style={{ color }}/>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            {t && (
              <p className={`text-xs font-medium mt-1.5 flex items-center gap-1 ${(invert ? !t.up : t.up) ? 'text-emerald-600' : 'text-rose-600'}`}>
                {t.up ? '↑' : '↓'} {t.text} {t.text !== 'New' && 'vs last month'}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Status</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400">
              <option value="">All Periods</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:outline-none focus:border-indigo-400">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {(filterMonth || filterDept || filterStatus) && (
              <button onClick={() => { setFilterMonth(''); setFilterDept(''); setFilter(''); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">Clear</button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['', 'draft', 'self_submitted', 'manager_approved', 'pm_approved', 'hr_approved', 'approved', 'acknowledged', 'rejected'].map(s => {
            const cfg = s ? STATUS_CFG[s] : null;
            return (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                  ${filterStatus === s ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {s ? cfg?.label : 'All'}
              </button>
            );
          })}
        </div>
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
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
                const [g1, g2] = avatarGrad(ev.employee_name);
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                          {initials(ev.employee_name)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{ev.employee_name}</p>
                          <p className="text-xs text-gray-400">{ev.employee_code} · {ev.dept_name || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ev.eval_period || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ev.review_type === 'quarterly' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                        {ev.review_type === 'quarterly' ? 'Quarterly' : 'Monthly'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">
                      {ev.self_total ? parseFloat(ev.self_total).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-purple-600">
                      {ev.manager_total ? parseFloat(ev.manager_total).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ev.overall_rating
                        ? <span className={`text-xs font-semibold ${rc.text}`}>{ev.overall_rating}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot || 'bg-gray-400'}`}/>
                        {sc.label || ev.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button onClick={() => setViewing(ev)} title="View"
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500"><Eye size={14}/></button>
                        <button onClick={() => { setEditing(ev); setShowForm(true); }} title="Edit"
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><FileText size={14}/></button>
                        {ev.status === 'draft' && (
                          <button onClick={() => statusMut.mutate({ id: ev.id, status: 'self_submitted' })}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                            <ChevronRight size={12}/> Submit
                          </button>
                        )}
                        {APPROVAL_STAGES.filter(st => st.from === ev.status).map(st => (
                          <button key={st.to} onClick={() => statusMut.mutate({ id: ev.id, status: st.to })}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                            <CheckCircle size={12}/> Accept
                          </button>
                        ))}
                        {ev.status === 'approved' && (
                          <button onClick={() => statusMut.mutate({ id: ev.id, status: 'acknowledged' })}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-600 hover:bg-teal-100">
                            <CheckCircle size={12}/> Acknowledge
                          </button>
                        )}
                        {!['draft','approved','acknowledged','rejected'].includes(ev.status) && (
                          <button onClick={() => {
                            const reason = window.prompt('Reason for rejecting this evaluation:');
                            if (reason && reason.trim()) rejectMut.mutate({ id: ev.id, reason: reason.trim() });
                          }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100">
                            <XCircle size={12}/> Reject
                          </button>
                        )}
                        {ev.status === 'draft' && (
                          <button onClick={() => { if (window.confirm('Delete this draft?')) deleteMut.mutate(ev.id); }}
                            title="Delete" className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"><Trash2 size={14}/></button>
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
      </div>

      {showForm && <EvalFormModal editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {viewing  && <DetailView ev={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
