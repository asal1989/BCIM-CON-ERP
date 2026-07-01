import React, { useState, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import {
  UserPlus, Users, FolderOpen, Calendar, Target, BookOpen,
  Heart, Shield, Package, LogOut, BarChart3,
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  Printer, Download, Loader2, RotateCcw, TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '../../theme';

// ── Checklist data ─────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'recruitment',
    title: 'Recruitment & Hiring',
    icon: UserPlus,
    color: 'blue',
    bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
    barColor: 'bg-blue-500',
    items: [
      'Create job requisition',
      'Prepare job description',
      'Post job opening',
      'Screen resumes',
      'Schedule interviews',
      'Conduct interviews',
      'Verify references',
      'Release offer letter',
      'Complete background verification',
      'Collect joining documents',
    ],
  },
  {
    id: 'onboarding',
    title: 'Employee Onboarding',
    icon: Users,
    color: 'emerald',
    bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    barColor: 'bg-emerald-500',
    items: [
      'Issue appointment letter',
      'Collect KYC and statutory documents',
      'Create employee ID',
      'Set up email and system access',
      'Provide laptop / IT assets',
      'Conduct orientation',
      'Explain company policies',
      'Enroll in benefits',
      'Assign reporting manager and mentor',
    ],
  },
  {
    id: 'records',
    title: 'Employee Records Management',
    icon: FolderOpen,
    color: 'purple',
    bg: 'bg-purple-50', border: 'border-purple-200', iconBg: 'bg-purple-100', iconColor: 'text-purple-600',
    barColor: 'bg-purple-500',
    items: [
      'Maintain employee personal information',
      'Update emergency contacts',
      'Store educational and experience certificates',
      'Track contract renewals',
      'Update promotions and transfers',
      'Maintain attendance records',
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance & Leave Management',
    icon: Calendar,
    color: 'amber',
    bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    barColor: 'bg-amber-500',
    items: [
      'Configure work schedules',
      'Monitor attendance',
      'Approve leave requests',
      'Track leave balances',
      'Record holidays',
      'Review overtime requests',
    ],
  },
  {
    id: 'performance',
    title: 'Performance Management',
    icon: Target,
    color: 'orange',
    bg: 'bg-orange-50', border: 'border-orange-200', iconBg: 'bg-orange-100', iconColor: 'text-orange-600',
    barColor: 'bg-orange-500',
    items: [
      'Set performance goals',
      'Conduct probation reviews',
      'Schedule periodic appraisals',
      'Collect manager feedback',
      'Conduct performance discussions',
      'Create development plans',
    ],
  },
  {
    id: 'learning',
    title: 'Learning & Development',
    icon: BookOpen,
    color: 'cyan',
    bg: 'bg-cyan-50', border: 'border-cyan-200', iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600',
    barColor: 'bg-cyan-500',
    items: [
      'Identify training needs',
      'Schedule training programs',
      'Track training completion',
      'Maintain certification records',
      'Evaluate training effectiveness',
    ],
  },
  {
    id: 'engagement',
    title: 'Employee Engagement',
    icon: Heart,
    color: 'pink',
    bg: 'bg-pink-50', border: 'border-pink-200', iconBg: 'bg-pink-100', iconColor: 'text-pink-600',
    barColor: 'bg-pink-500',
    items: [
      'Conduct engagement surveys',
      'Organize team activities',
      'Recognize employee achievements',
      'Address employee concerns',
      'Collect feedback regularly',
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance & Statutory',
    icon: Shield,
    color: 'red',
    bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-100', iconColor: 'text-red-600',
    barColor: 'bg-red-500',
    items: [
      'Maintain employee documentation',
      'Ensure labor law compliance',
      'Update HR policies',
      'Conduct compliance training',
      'Maintain health and safety records',
      'Handle disciplinary actions',
    ],
  },
  {
    id: 'assets',
    title: 'Asset Management',
    icon: Package,
    color: 'slate',
    bg: 'bg-slate-50', border: 'border-slate-200', iconBg: 'bg-slate-100', iconColor: 'text-slate-600',
    barColor: 'bg-slate-500',
    items: [
      'Issue company assets',
      'Track asset allocation',
      'Record asset returns',
      'Verify asset condition',
      'Update inventory records',
    ],
  },
  {
    id: 'separation',
    title: 'Employee Separation (Offboarding)',
    icon: LogOut,
    color: 'rose',
    bg: 'bg-rose-50', border: 'border-rose-200', iconBg: 'bg-rose-100', iconColor: 'text-rose-600',
    barColor: 'bg-rose-500',
    items: [
      'Receive resignation',
      'Manager approval',
      'Conduct exit interview',
      'Recover company assets',
      'Disable system access',
      'Process full and final settlement',
      'Issue relieving and experience letters',
      'Archive employee records',
    ],
  },
  {
    id: 'reporting',
    title: 'HR Reporting',
    icon: BarChart3,
    color: 'indigo',
    bg: 'bg-indigo-50', border: 'border-indigo-200', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600',
    barColor: 'bg-indigo-500',
    items: [
      'Headcount report',
      'Attrition report',
      'Recruitment status',
      'Leave utilization',
      'Training completion',
      'Performance review status',
      'Diversity and inclusion metrics',
      'Compliance reports',
    ],
  },
];

const TOTAL_ITEMS = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
const STORAGE_KEY = 'hr-ops-checklist-v1';

function loadChecked() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

// ── Section Card ───────────────────────────────────────────────────────────────
function SectionCard({ section, checked, onToggle, onReset }) {
  const [open, setOpen] = useState(true);
  const done = section.items.filter((_, i) => checked[`${section.id}-${i}`]).length;
  const pct  = Math.round((done / section.items.length) * 100);
  const Icon = section.icon;
  const allDone = done === section.items.length;

  return (
    <div className={clsx('rounded-2xl border bg-white overflow-hidden', section.border)}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', section.iconBg)}>
          <Icon className={clsx('w-4.5 h-4.5', section.iconColor)} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{section.title}</span>
            {allDone && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', section.barColor)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">{done}/{section.items.length}</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {/* Items */}
      {open && (
        <div className="px-5 pb-4 space-y-1 border-t border-slate-100">
          {section.items.map((item, i) => {
            const key  = `${section.id}-${i}`;
            const done = !!checked[key];
            return (
              <label key={key} className="flex items-center gap-3 py-2 cursor-pointer group rounded-lg px-1 hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="sr-only" checked={done} onChange={() => onToggle(key)} />
                {done
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  : <Circle className="w-5 h-5 text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
                }
                <span className={clsx('text-sm transition-colors', done ? 'line-through text-slate-400' : 'text-slate-700')}>
                  {item}
                </span>
              </label>
            );
          })}
          {done > 0 && (
            <button
              onClick={() => onReset(section.id)}
              className="mt-2 text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset section
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HROpsChecklistPage() {
  const printRef = useRef();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [checked, setChecked] = useState(loadChecked);

  const toggle = (key) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetSection = (sectionId) => {
    setChecked(prev => {
      const next = { ...prev };
      SECTIONS.find(s => s.id === sectionId)?.items.forEach((_, i) => delete next[`${sectionId}-${i}`]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetAll = () => {
    setChecked({});
    localStorage.removeItem(STORAGE_KEY);
  };

  const totalDone = Object.values(checked).filter(Boolean).length;
  const overallPct = Math.round((totalDone / TOTAL_ITEMS) * 100);

  // ── Print ──
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'HR_Operations_Checklist',
    pageStyle: `
      @page { size: A4; margin: 12mm 14mm; }
      @media print {
        body { font-family: Arial, sans-serif; font-size: 10px; color: #1e293b; }
        .no-print { display: none !important; }
        .print-section { break-inside: avoid; margin-bottom: 14px; }
        .print-item { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f1f5f9; }
        .print-check { width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 9px; font-weight: 700; }
        .check-done { background: #d1fae5; border-color: #10b981; color: #065f46; }
        .check-empty { background: #fff; }
        .done-text { color: #94a3b8; text-decoration: line-through; }
        .section-title { font-size: 11px; font-weight: 700; padding: 6px 0 3px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 4px; }
        .section-prog { font-size: 8px; color: #64748b; float: right; font-weight: normal; }
      }
    `,
  });

  // ── Download PDF ──
  const handleDownloadPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210; const PH = 297;
      const ML = 14; const MR = 14; const MT = 14;
      const CW = PW - ML - MR;
      let y = MT;

      const checkNewPage = (needed = 8) => {
        if (y + needed > PH - 12) { doc.addPage(); y = MT; }
      };

      // ── Title header ──
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, PW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15); doc.setFont('helvetica', 'bold');
      doc.text('HR Operations Checklist', ML, 10);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}   ·   Overall Progress: ${totalDone}/${TOTAL_ITEMS} (${overallPct}%)`, ML, 17);
      y = 28;

      // ── Overall progress bar ──
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(ML, y, CW, 4, 1, 1, 'F');
      if (overallPct > 0) {
        doc.setFillColor(79, 70, 229);
        doc.roundedRect(ML, y, CW * overallPct / 100, 4, 1, 1, 'F');
      }
      y += 10;

      // ── Sections ──
      SECTIONS.forEach((sec, sIdx) => {
        const secDone = sec.items.filter((_, i) => checked[`${sec.id}-${i}`]).length;
        const secPct  = Math.round((secDone / sec.items.length) * 100);

        checkNewPage(24);

        // Section header
        const colorMap = {
          blue:[59,130,246], emerald:[16,185,129], purple:[139,92,246], amber:[245,158,11],
          orange:[249,115,22], cyan:[6,182,212], pink:[236,72,153], red:[239,68,68],
          slate:[100,116,139], rose:[244,63,94], indigo:[99,102,241],
        };
        const [r, g, b] = colorMap[sec.color] || colorMap.indigo;

        doc.setFillColor(r, g, b);
        doc.rect(ML, y, 3, 8, 'F');
        doc.setTextColor(r, g, b);
        doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
        doc.text(`${sIdx + 1}. ${sec.title}`, ML + 5, y + 6);
        doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(`${secDone}/${sec.items.length} (${secPct}%)`, PW - MR - 22, y + 6);

        // Section progress bar
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(ML, y + 9, CW, 2.5, 0.8, 0.8, 'F');
        if (secPct > 0) {
          doc.setFillColor(r, g, b);
          doc.roundedRect(ML, y + 9, CW * secPct / 100, 2.5, 0.8, 0.8, 'F');
        }
        y += 14;

        // Items
        sec.items.forEach((item, i) => {
          checkNewPage(7);
          const done = !!checked[`${sec.id}-${i}`];

          if (done) {
            doc.setFillColor(209, 250, 229);
            doc.circle(ML + 2.5, y + 3.2, 2.2, 'F');
            doc.setTextColor(6, 95, 70);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text('✓', ML + 1.3, y + 4.2);
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
          } else {
            doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3);
            doc.circle(ML + 2.5, y + 3.2, 2.2, 'S');
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
          }

          const lines = doc.splitTextToSize(item, CW - 12);
          doc.text(lines, ML + 7, y + 3.8);
          doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.1);
          doc.line(ML + 6, y + 6.5, ML + CW, y + 6.5);
          y += 7 + (lines.length - 1) * 3.5;
        });

        y += 5;
      });

      // ── Footer ──
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFillColor(248, 250, 252);
        doc.rect(0, PH - 10, PW, 10, 'F');
        doc.setTextColor(148, 163, 184); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        doc.text('HR Operations Checklist · BCIM Construction', ML, PH - 4);
        doc.text(`Page ${p} of ${pages}`, PW - MR - 16, PH - 4);
      }

      doc.save('HR_Operations_Checklist.pdf');
    } catch (err) {
      console.error('PDF error:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [checked, totalDone, overallPct]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader
        title="HR Operations Checklist"
        subtitle="Standard HR process checklist across the full employee lifecycle"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'HR Ops Checklist' }]}
        actions={
          <div className="flex gap-2 items-center no-print">
            <button
              onClick={resetAll}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-500 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset All
            </button>
            <button
              onClick={handlePrint}
              className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-2"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium flex items-center gap-2"
            >
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </button>
          </div>
        }
      />

      <div ref={printRef} className="flex-1 overflow-auto p-5 md:p-6">

        {/* Print-only header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold text-slate-900">HR Operations Checklist</h1>
          <p className="text-sm text-slate-500">BCIM Construction · Generated: {new Date().toLocaleDateString('en-IN')}</p>
        </div>

        {/* Overall progress */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Overall Progress</p>
                <p className="text-xs text-slate-500">{totalDone} of {TOTAL_ITEMS} tasks completed</p>
              </div>
            </div>
            <span className={clsx(
              'text-2xl font-bold',
              overallPct === 100 ? 'text-emerald-600' : overallPct >= 50 ? 'text-indigo-600' : 'text-slate-700'
            )}>{overallPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
          {/* Section mini-pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {SECTIONS.map(sec => {
              const d = sec.items.filter((_, i) => checked[`${sec.id}-${i}`]).length;
              const p = Math.round((d / sec.items.length) * 100);
              return (
                <div key={sec.id} className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border', sec.bg, sec.border)}>
                  <sec.icon className={clsx('w-3 h-3', sec.iconColor)} />
                  <span className={clsx('font-medium', sec.iconColor)}>{p}%</span>
                  <span className="text-slate-500">{sec.title.split(' ').slice(0, 2).join(' ')}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {SECTIONS.map(sec => (
            <SectionCard
              key={sec.id}
              section={sec}
              checked={checked}
              onToggle={toggle}
              onReset={resetSection}
            />
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 no-print">
          Progress is saved automatically in your browser.
        </p>
      </div>
    </div>
  );
}
