// src/pages/hr-admin/HRChecklistPage.jsx — HR Admin Monthly Checklist
import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight,
  IndianRupee, Users, FileText, Calendar, ShieldCheck, BadgeCheck,
  UserCheck, Briefcase, Receipt, RefreshCw, AlertCircle,
  ClipboardList, CreditCard, BookOpen, Fingerprint,
  ArrowUpRight, Bell, Printer, Download,
} from 'lucide-react';
import { clsx } from 'clsx';
import { hrComplianceAPI } from '../../api/client';
import { PageHeader } from '../../theme';

const fmt     = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

// ── Status icon ───────────────────────────────────────────────────────────────
const STATUS_ICONS = {
  done:    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 print:text-emerald-700" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
  danger:  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
  pending: <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />,
  info:    <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />,
};

const STATUS_LABEL = { done:'✓', warning:'!', danger:'✗', pending:'○', info:'ℹ' };

function SectionCard({ icon: Icon, title, color = 'indigo', count, badge, children, id }) {
  const colors = {
    indigo:  { icon: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    amber:   { icon: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
    red:     { icon: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
    blue:    { icon: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
    violet:  { icon: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
    slate:   { icon: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
  };
  const c = colors[color] || colors.indigo;
  return (
    <div id={id} className={clsx('bg-white rounded-2xl border overflow-hidden shadow-sm print:shadow-none print:rounded-lg print:break-inside-avoid', c.border)}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center print:hidden', c.bg)}>
          <Icon className={clsx('w-4 h-4', c.icon)} />
        </div>
        <span className="font-semibold text-slate-800 text-sm flex-1">{title}</span>
        {count !== undefined && (
          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', c.bg, c.icon)}>{count}</span>
        )}
        {badge && <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', badge.cls)}>{badge.label}</span>}
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function SubHeader({ label }) {
  return (
    <div className="px-5 pt-3 pb-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function CheckRow({ status, label, sub, action, onClick, rightLabel }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 px-5 py-2.5 text-sm',
        onClick && 'hover:bg-slate-50 cursor-pointer transition-colors print:cursor-default',
      )}
    >
      <span className="print:hidden">{STATUS_ICONS[status] || STATUS_ICONS.pending}</span>
      <span className={clsx(
        'hidden print:inline-flex w-4 h-4 flex-shrink-0 items-center justify-center text-xs font-bold rounded',
        status === 'done'    && 'bg-emerald-100 text-emerald-700',
        status === 'warning' && 'bg-amber-100 text-amber-700',
        status === 'danger'  && 'bg-red-100 text-red-700',
        status === 'pending' && 'bg-slate-100 text-slate-500',
        status === 'info'    && 'bg-blue-100 text-blue-700',
      )}>{STATUS_LABEL[status] || '○'}</span>

      <div className="flex-1 min-w-0">
        <p className={clsx('font-medium truncate',
          status === 'done' ? 'text-slate-400 line-through print:no-underline print:text-slate-600' : 'text-slate-800'
        )}>{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {rightLabel && <span className="text-xs text-slate-500 flex-shrink-0">{rightLabel}</span>}
      {action && (
        <span className="text-xs text-indigo-600 font-semibold flex-shrink-0 flex items-center gap-0.5 print:hidden">
          {action} <ChevronRight className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRChecklistPage() {
  const navigate = useNavigate();
  const printRef = useRef();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hr-checklist'],
    queryFn: () => hrComplianceAPI.hrChecklist().then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });

  const handlePrint = () => window.print();

  if (isLoading) return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="HR Checklist" subtitle="Monthly HR admin task tracker" breadcrumbs={[{label:'HR & Admin'},{label:'Checklist'}]} />
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading checklist…</div>
    </div>
  );

  if (isError) return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="HR Checklist" subtitle="Monthly HR admin task tracker" breadcrumbs={[{label:'HR & Admin'},{label:'Checklist'}]} />
      <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
        <AlertCircle className="w-10 h-10" />
        <p className="text-sm">Failed to load checklist</p>
        <button onClick={() => refetch()} className="h-8 px-4 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Retry</button>
      </div>
    </div>
  );

  const {
    month_name, year,                          // current calendar month (July)
    payroll_month_name, payroll_year,          // payroll month being processed (June)
    payroll = {},
    compliance_tasks = [],
    probation_due = [],
    lifecycle_pending = [],
    license_expiry = [],
    doc_expiry = [],
    leaves_pending = 0,
    expenses_pending = 0,
    new_joiners = [],
    exits_pending = [],
  } = data || {};

  const overdueCount = compliance_tasks.filter(t => t.overdue).length;
  const dueSoonCount = compliance_tasks.filter(t => t.due_soon).length;
  const alertCount   = probation_due.length + lifecycle_pending.length + license_expiry.length + doc_expiry.length + exits_pending.length;

  // Determine quarterly TDS return month (Apr, Jul, Oct, Jan)
  const currMonth = data?.month || new Date().getMonth() + 1;
  const isQ1 = [4,5,6].includes(currMonth);  // Q4 filing in Jul
  const isQ2 = [7,8,9].includes(currMonth);  // Q1 filing in Jul
  const isQ3 = [10,11,12].includes(currMonth);
  const isQ4 = [1,2,3].includes(currMonth);
  const tdsReturnDue = currMonth === 7 || currMonth === 10 || currMonth === 1 || currMonth === 4;

  const SUMMARY_CARDS = [
    {
      label: 'Payroll Status',
      value: payroll.status === 'paid'     ? 'Paid'
           : payroll.status === 'approved' ? 'Approved'
           : payroll.status === 'not_run'  ? 'Not Run'
           : 'Pending',
      sub:   payroll.total_employees ? `${payroll.total_employees} of ${payroll.total_active} employees` : 'No payroll yet',
      icon:  CreditCard,
      color: payroll.status === 'paid' ? 'emerald' : payroll.status === 'not_run' ? 'red' : 'amber',
    },
    {
      label: 'Compliance Filings',
      value: `${overdueCount} Overdue`,
      sub:   `${dueSoonCount} due within 3 days`,
      icon:  ShieldCheck,
      color: overdueCount > 0 ? 'red' : dueSoonCount > 0 ? 'amber' : 'emerald',
    },
    {
      label: 'HR Alerts',
      value: alertCount,
      sub:   `${leaves_pending + expenses_pending} pending approvals`,
      icon:  Bell,
      color: alertCount > 0 ? 'amber' : 'emerald',
    },
    {
      label: 'New Joiners',
      value: new_joiners.length,
      sub:   `${payroll_month_name} ${payroll_year}`,
      icon:  UserCheck,
      color: 'blue',
    },
  ];

  const colorMap = {
    emerald: { bg:'bg-emerald-50', text:'text-emerald-700', icon:'text-emerald-500' },
    amber:   { bg:'bg-amber-50',   text:'text-amber-700',   icon:'text-amber-500'   },
    red:     { bg:'bg-red-50',     text:'text-red-700',     icon:'text-red-500'     },
    blue:    { bg:'bg-blue-50',    text:'text-blue-700',    icon:'text-blue-500'    },
  };

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #hr-checklist-print, #hr-checklist-print * { visibility: visible; }
          #hr-checklist-print { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          .print\\:inline-flex { display: inline-flex !important; }
          .print\\:no-underline { text-decoration: none !important; }
          .print\\:text-slate-600 { color: #475569 !important; }
          .print\\:text-emerald-700 { color: #047857 !important; }
          .print\\:cursor-default { cursor: default !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-lg { border-radius: 0.5rem !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:hidden { display: none; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>

      <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
        <PageHeader
          title={`HR Checklist — ${payroll_month_name} ${payroll_year}`}
          subtitle={`Running ${payroll_month_name} payroll · Compliance due dates for ${month_name} ${year}`}
          breadcrumbs={[{ label:'HR & Admin' }, { label:'Checklist' }]}
          actions={
            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-2">
                <Printer className="w-3.5 h-3.5" /> Print / PDF
              </button>
              <button onClick={() => refetch()}
                className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-medium flex items-center gap-2 hover:bg-slate-50">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          }
        />

        <div id="hr-checklist-print" ref={printRef} className="flex-1 overflow-auto p-5 md:p-6 space-y-5">

          {/* Print header (only shows when printing) */}
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold text-slate-900">HR Checklist — {payroll_month_name} {payroll_year}</h1>
            <p className="text-sm text-slate-500">Generated: {new Date().toLocaleDateString('en-IN')} · Compliance due dates for {month_name} {year}</p>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
            {SUMMARY_CARDS.map(({ label, value, sub, icon: Icon, color }) => {
              const c = colorMap[color] || colorMap.blue;
              return (
                <div key={label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm flex items-center gap-4 print:rounded-lg print:shadow-none print:px-3 print:py-3">
                  <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 print:hidden', c.bg)}>
                    <Icon className={clsx('w-5 h-5', c.icon)} />
                  </div>
                  <div className="min-w-0">
                    <div className={clsx('text-xl font-bold truncate print:text-base', c.text)}>{value}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
                    <div className="text-[10px] text-slate-400">{sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 print:grid-cols-1 print:gap-3">

            {/* ── 1. Payroll Checklist ── */}
            <SectionCard
              id="payroll-checklist"
              icon={CreditCard}
              title={`Payroll Checklist — ${payroll_month_name} ${payroll_year}`}
              color={payroll.status === 'paid' ? 'emerald' : 'amber'}
              badge={payroll.status === 'paid'
                ? { label:'COMPLETE', cls:'bg-emerald-100 text-emerald-700' }
                : { label:'IN PROGRESS', cls:'bg-amber-100 text-amber-700' }}>

              <SubHeader label="Step 1 — Pre-Payroll Preparation" />
              <CheckRow
                status={payroll.salary_missing === 0 ? 'done' : 'danger'}
                label="Assign salary structure to all employees"
                sub={payroll.salary_missing === 0
                  ? 'All active employees have a salary structure'
                  : `${payroll.salary_missing} employee${payroll.salary_missing !== 1 ? 's' : ''} missing salary structure — fix before running`}
                action={payroll.salary_missing > 0 ? 'Fix' : undefined}
                onClick={() => navigate('/hr-admin/employee-salaries')}
              />
              <CheckRow
                status="info"
                label="Collect & sync attendance from biometric / ESSL"
                sub="Import punch data from ESSL device or attendance system before calculating LOP"
                action="Attendance"
                onClick={() => navigate('/hr-admin/attendance')}
              />
              <CheckRow
                status={payroll.lop_entries > 0 ? 'done' : 'warning'}
                label="Update LOP (Loss of Pay) days"
                sub={payroll.lop_entries > 0
                  ? `${payroll.lop_entries} employee${payroll.lop_entries !== 1 ? 's' : ''} marked · ${payroll.lop_total_days} total LOP days`
                  : 'No LOP entries yet — mark absent/unpaid days before running payroll'}
                action="LOP Days"
                onClick={() => navigate('/hr-admin/lop-days')}
              />
              <CheckRow
                status="info"
                label="Process overtime hours (if applicable)"
                sub="Verify and approve overtime claims before payroll run"
                action="Attendance"
                onClick={() => navigate('/hr-admin/attendance')}
              />
              <CheckRow
                status={payroll.stop_salary_count === 0 ? 'done' : 'warning'}
                label="Review stop-salary list"
                sub={payroll.stop_salary_count === 0
                  ? 'No employees on salary hold'
                  : `${payroll.stop_salary_count} employee${payroll.stop_salary_count !== 1 ? 's' : ''} on salary hold — verify or remove before running`}
                action={payroll.stop_salary_count > 0 ? 'Review' : undefined}
                onClick={() => navigate('/hr-admin/stop-salary')}
              />
              <CheckRow
                status={payroll.active_loans_count > 0 ? 'info' : 'done'}
                label="Verify loan & advance deductions"
                sub={payroll.active_loans_count > 0
                  ? `${payroll.active_loans_count} employee${payroll.active_loans_count !== 1 ? 's' : ''} with active loans — deductions auto-applied when payroll runs`
                  : 'No active loans / advances pending'}
                action={payroll.active_loans_count > 0 ? 'Loans' : undefined}
                onClick={() => navigate('/hr-admin/loans')}
              />
              <CheckRow
                status="info"
                label="Process arrears / salary revision backlog"
                sub="If any salary revision or increment was pending from prior months, add arrears before running"
                action="Employee Salaries"
                onClick={() => navigate('/hr-admin/employee-salaries')}
              />
              <CheckRow
                status="info"
                label="Update new joiner & exit prorations"
                sub={`${new_joiners.length} new joiner${new_joiners.length !== 1 ? 's' : ''} this month · ${exits_pending.length} exit${exits_pending.length !== 1 ? 's' : ''} pending FnF — verify joining/leaving dates for prorated pay`}
                action="Employees"
                onClick={() => navigate('/hr-admin/employees')}
              />

              <SubHeader label="Step 2 — Run & Verify Payroll" />
              <CheckRow
                status={payroll.total_employees > 0 ? 'done' : 'danger'}
                label="Generate payroll for all employees"
                sub={payroll.total_employees > 0
                  ? `${payroll.total_employees} of ${payroll.total_active} employees processed for ${payroll_month_name}`
                  : `${payroll.total_active} active employees — payroll not yet generated for ${payroll_month_name}`}
                action={payroll.total_employees === 0 ? 'Run Now' : 'View'}
                onClick={() => navigate('/hr-admin/payroll')}
              />
              <CheckRow
                status={payroll.total_employees > 0 ? 'info' : 'pending'}
                label="Verify basic, HRA, allowances & gross pay"
                sub="Check each employee's earnings — compare with previous month for unexpected changes"
                action="Payroll"
                onClick={() => navigate('/hr-admin/payroll')}
              />
              <CheckRow
                status={payroll.total_employees > 0 ? 'info' : 'pending'}
                label="Verify PF, ESI, PT & TDS deductions"
                sub="Confirm statutory deductions are correctly calculated — PF 12%, ESI 0.75%, TDS per slab"
                action="Payroll"
                onClick={() => navigate('/hr-admin/payroll')}
              />
              <CheckRow
                status={payroll.total_employees > 0 ? 'info' : 'pending'}
                label="Cross-check net pay totals"
                sub="Total net pay should match bank transfer amount — flag any negative pay or outliers"
                action="Payroll"
                onClick={() => navigate('/hr-admin/payroll')}
              />

              <SubHeader label="Step 3 — Approval" />
              <CheckRow
                status={['approved','paid'].includes(payroll.status) ? 'done' : payroll.total_employees > 0 ? 'warning' : 'pending'}
                label="HR review & approve payroll"
                sub={payroll.approved_count > 0
                  ? `${payroll.approved_count} records approved`
                  : 'Pending HR approval — review each record before approving'}
                action="Approve"
                onClick={() => navigate('/hr-admin/payroll')}
              />
              <CheckRow
                status={['approved','paid'].includes(payroll.status) ? 'done' : 'pending'}
                label="Accounts / Management approval"
                sub="Get sign-off from Accounts Manager or MD before disbursing salaries"
              />

              <SubHeader label="Step 4 — Disbursement" />
              <CheckRow
                status={payroll.status === 'paid' ? 'done' : ['approved'].includes(payroll.status) ? 'warning' : 'pending'}
                label="Download bank transfer file (NEFT/RTGS)"
                sub="Export CSV file from Payroll Reports — upload to your bank's bulk payment portal"
                action="Download"
                onClick={() => navigate('/hr-admin/payroll-reports')}
              />
              <CheckRow
                status={payroll.status === 'paid' ? 'done' : 'pending'}
                label="Upload to bank portal & disburse salaries"
                sub={payroll.status === 'paid'
                  ? `₹${fmt(payroll.net_pay_total)} disbursed to ${payroll.paid_count} employees`
                  : 'Upload CSV to HDFC/SBI/Axis bulk pay → get UTR → mark paid here'}
                action={payroll.status !== 'paid' ? 'Mark Paid' : undefined}
                onClick={() => navigate('/hr-admin/payroll')}
              />

              <SubHeader label="Step 5 — Post-Payroll Tasks" />
              <CheckRow
                status={payroll.payslips_sent > 0 ? 'done' : payroll.status === 'paid' ? 'warning' : 'pending'}
                label="Generate & send payslips to employees"
                sub={payroll.payslips_sent > 0
                  ? `${payroll.payslips_sent} payslips generated`
                  : 'Generate payslips and send via email / ESS portal after salary disbursement'}
                action="Payslips"
                onClick={() => navigate('/hr-admin/payroll')}
              />
              <CheckRow
                status={payroll.status === 'paid' ? 'info' : 'pending'}
                label="Update loan repayment tracker"
                sub="Mark EMI deductions paid in the loans register — update outstanding balances"
                action="Loans"
                onClick={() => navigate('/hr-admin/loans')}
              />
              <CheckRow
                status={payroll.status === 'paid' ? 'info' : 'pending'}
                label="Download & file monthly wage register"
                sub="Mandatory record under Payment of Wages Act — keep signed copies for 3 years"
                action="Reports"
                onClick={() => navigate('/hr-admin/reports')}
              />
              <CheckRow
                status={payroll.status === 'paid' ? 'info' : 'pending'}
                label="Update Form 16 / TDS data"
                sub="Annual TDS summary auto-updates — review in Payroll Reports once salary is paid"
                action="Form 16"
                onClick={() => navigate('/hr-admin/payroll-reports')}
              />

              <SubHeader label="Step 6 — Statutory Filing (Due Dates)" />
              <CheckRow
                status={compliance_tasks.find(t => t.category === 'TDS')?.overdue ? 'danger'
                      : compliance_tasks.find(t => t.category === 'TDS')?.due_soon ? 'warning' : 'pending'}
                label={`Deposit TDS challan — ${payroll_month_name} (by 7th ${month_name})`}
                sub="Pay TDS on salary to IT Dept via challan 281 on TIN NSDL / Income Tax portal"
                rightLabel={compliance_tasks.find(t => t.category === 'TDS') &&
                  `${compliance_tasks.find(t => t.category === 'TDS').days_remaining}d left`}
                action="Compliance"
                onClick={() => navigate('/hr-admin/compliance')}
              />
              <CheckRow
                status={compliance_tasks.find(t => t.category === 'PF')?.overdue ? 'danger'
                      : compliance_tasks.find(t => t.category === 'PF')?.due_soon ? 'warning' : 'pending'}
                label={`Upload PF ECR & deposit challan — ${payroll_month_name} (by 15th ${month_name})`}
                sub="Generate ECR file from Compliance → upload on EPFO Unified Portal → pay challan"
                rightLabel={compliance_tasks.find(t => t.category === 'PF') &&
                  `${compliance_tasks.find(t => t.category === 'PF').days_remaining}d left`}
                action="PF ECR"
                onClick={() => navigate('/hr-admin/compliance')}
              />
              <CheckRow
                status={compliance_tasks.find(t => t.category === 'PT')?.overdue ? 'danger'
                      : compliance_tasks.find(t => t.category === 'PT')?.due_soon ? 'warning' : 'pending'}
                label={`Pay Professional Tax — ${payroll_month_name} (by 20th ${month_name})`}
                sub="Pay PT to Commercial Taxes Department — collect from employees + file monthly return"
                rightLabel={compliance_tasks.find(t => t.category === 'PT') &&
                  `${compliance_tasks.find(t => t.category === 'PT').days_remaining}d left`}
                action="Compliance"
                onClick={() => navigate('/hr-admin/compliance')}
              />
              <CheckRow
                status={compliance_tasks.find(t => t.category === 'ESI')?.overdue ? 'danger'
                      : compliance_tasks.find(t => t.category === 'ESI')?.due_soon ? 'warning' : 'pending'}
                label={`Upload ESI contribution & pay — ${payroll_month_name} (by 21st ${month_name})`}
                sub="Upload ESI contribution file on ESIC portal → pay challan (employer 3.25% + employee 0.75%)"
                rightLabel={compliance_tasks.find(t => t.category === 'ESI') &&
                  `${compliance_tasks.find(t => t.category === 'ESI').days_remaining}d left`}
                action="ESI"
                onClick={() => navigate('/hr-admin/compliance')}
              />
              {tdsReturnDue && (
                <CheckRow
                  status="warning"
                  label={`File Form 24Q (TDS Return) — Quarterly`}
                  sub={`Quarterly TDS return on salary — due this month. File via TRACES/TIN portal.`}
                  action="Compliance"
                  onClick={() => navigate('/hr-admin/compliance')}
                />
              )}
              <CheckRow
                status="pending"
                label={`Pay contract worker wages by 7th ${month_name}`}
                sub="Wages for daily/weekly/site contract workers must be paid within 7 days of wage period end"
              />
            </SectionCard>

            {/* ── 2. Statutory Compliance ── */}
            <SectionCard icon={ShieldCheck} title="Compliance Filings" color={overdueCount > 0 ? 'red' : 'indigo'}
              badge={overdueCount > 0 ? { label:`${overdueCount} OVERDUE`, cls:'bg-red-100 text-red-700' } : undefined}>
              {compliance_tasks.map(t => (
                <CheckRow
                  key={t.id}
                  status={t.overdue ? 'danger' : t.due_soon ? 'warning' : 'pending'}
                  label={t.task}
                  sub={t.description}
                  rightLabel={t.overdue
                    ? `${Math.abs(t.days_remaining)}d overdue`
                    : `Due ${fmtDate(t.due_date)} (${t.days_remaining}d)`}
                  action="Compliance"
                  onClick={() => navigate('/hr-admin/compliance')}
                />
              ))}
              <SubHeader label="Quarterly / Annual" />
              <CheckRow
                status={tdsReturnDue ? 'warning' : 'pending'}
                label="Form 24Q — Quarterly TDS Return"
                sub={tdsReturnDue ? `Due this month — file on TRACES portal` : 'Next filing due in next quarter'}
                action="Compliance"
                onClick={() => navigate('/hr-admin/compliance')}
              />
              <CheckRow status="pending" label="PF Annual Return (Form 3A / 6A)" sub="Due annually in April — consolidated PF contribution register" />
              <CheckRow status="pending" label="ESI Half-Yearly Return" sub="Due Apr & Oct — filed on ESIC portal for Apr–Sep and Oct–Mar periods" />
              <CheckRow status="pending" label="Labour Licence Renewal" sub={license_expiry.length > 0 ? `${license_expiry.length} licence${license_expiry.length !== 1 ? 's' : ''} expiring within 60 days` : 'No licences expiring soon'} />
            </SectionCard>

            {/* ── 3. Employee Actions ── */}
            <SectionCard icon={Users} title="Employee Actions" color="blue"
              count={probation_due.length + new_joiners.length + exits_pending.length}>
              {new_joiners.length > 0 && (
                <>
                  <SubHeader label="New Joiners This Month" />
                  {new_joiners.map(e => (
                    <CheckRow key={e.id} status="info" label={e.name}
                      sub={`${e.employee_code || '—'} · Joined ${fmtDate(e.date_of_joining)} · ${e.department_name || 'No dept'}`}
                      action="View" onClick={() => navigate(`/hr-admin/employees/${e.id}`)} />
                  ))}
                </>
              )}
              {probation_due.length > 0 && (
                <>
                  <SubHeader label="Probation Reviews Due (within 30 days)" />
                  {probation_due.map(e => (
                    <CheckRow key={e.id} status={e.days_left <= 7 ? 'warning' : 'pending'} label={e.name}
                      sub={`${e.employee_code || '—'} · ${e.designation_name || ''} · ${e.department_name || ''}`}
                      rightLabel={`Ends ${fmtDate(e.probation_end_date)}`}
                      action="Review" onClick={() => navigate(`/hr-admin/employees/${e.id}`)} />
                  ))}
                </>
              )}
              {exits_pending.length > 0 && (
                <>
                  <SubHeader label="Exit / Full & Final Pending" />
                  {exits_pending.map(e => (
                    <CheckRow key={e.id} status="warning" label={e.name}
                      sub={`${e.employee_code || '—'} · ${e.leaving_reason || 'Resigned'}`}
                      rightLabel={e.date_of_leaving ? fmtDate(e.date_of_leaving) : 'Date TBD'}
                      action="FnF" onClick={() => navigate('/hr-admin/fnf')} />
                  ))}
                </>
              )}
              {new_joiners.length === 0 && probation_due.length === 0 && exits_pending.length === 0 && (
                <CheckRow status="done" label="No employee actions pending this month" />
              )}
            </SectionCard>

            {/* ── 4. Pending Approvals ── */}
            <SectionCard icon={ClipboardList} title="Pending Approvals" color="violet"
              count={leaves_pending + expenses_pending}>
              <CheckRow
                status={leaves_pending > 0 ? 'warning' : 'done'}
                label={`Leave Requests — ${leaves_pending} pending`}
                sub="Review and approve / reject leave applications before payroll cutoff"
                action={leaves_pending > 0 ? 'Approve' : undefined}
                onClick={() => navigate('/hr-admin/leaves')}
              />
              <CheckRow
                status={expenses_pending > 0 ? 'warning' : 'done'}
                label={`Expense Claims — ${expenses_pending} pending`}
                sub="Review submitted expense reimbursement requests"
                action={expenses_pending > 0 ? 'Review' : undefined}
                onClick={() => navigate('/hr-admin/expenses')}
              />
            </SectionCard>

            {/* ── 5. Lifecycle Checklist ── */}
            {lifecycle_pending.length > 0 && (
              <SectionCard icon={BookOpen} title="Onboarding / Exit Checklist" color="amber"
                count={lifecycle_pending.length}>
                {lifecycle_pending.slice(0, 8).map((item, i) => (
                  <CheckRow key={i} status="pending" label={item.title}
                    sub={`${item.employee_name} (${item.employee_code || '—'}) · ${item.owner_department || ''}`}
                    rightLabel={item.stage === 'onboarding' ? 'Onboarding' : 'Exit'} />
                ))}
                {lifecycle_pending.length > 8 && (
                  <div className="px-5 py-2 text-xs text-slate-400">+{lifecycle_pending.length - 8} more items…</div>
                )}
              </SectionCard>
            )}

            {/* ── 6. Document & Licence Expiry ── */}
            {(doc_expiry.length > 0 || license_expiry.length > 0) && (
              <SectionCard icon={BadgeCheck} title="Expiry Alerts" color="red"
                count={doc_expiry.length + license_expiry.length}>
                {license_expiry.length > 0 && (
                  <>
                    <SubHeader label="Labour Licences (within 60 days)" />
                    {license_expiry.map((l, i) => (
                      <CheckRow key={i} status={l.days_left <= 15 ? 'danger' : 'warning'}
                        label={l.licence_type}
                        sub={`${l.authority || ''} · ${l.licence_number || ''}`}
                        rightLabel={`Expires ${fmtDate(l.expiry_date)} (${l.days_left}d)`}
                        action="Update" onClick={() => navigate('/hr-admin/compliance')} />
                    ))}
                  </>
                )}
                {doc_expiry.length > 0 && (
                  <>
                    <SubHeader label="Employee Documents (within 30 days)" />
                    {doc_expiry.map((d, i) => (
                      <CheckRow key={i} status={d.days_left <= 7 ? 'danger' : 'warning'}
                        label={`${d.employee_name} — ${d.doc_type || d.doc_name}`}
                        sub={`${d.employee_code || '—'} · ${d.doc_name || ''}`}
                        rightLabel={`Expires ${fmtDate(d.expiry_date)}`}
                        action="View" onClick={() => navigate('/hr-admin/compliance')} />
                    ))}
                  </>
                )}
              </SectionCard>
            )}

            {/* ── 7. Quick Actions ── */}
            <SectionCard icon={ArrowUpRight} title="Quick Actions" color="slate">
              {[
                { label: 'Run / View Payroll',      sub: 'Generate, approve & disburse salaries',       path: '/hr-admin/payroll',         icon: CreditCard  },
                { label: 'Payroll Reports',          sub: 'Form 16, bank transfer file download',        path: '/hr-admin/payroll-reports', icon: Download    },
                { label: 'LOP Days',                 sub: 'Enter loss of pay / absent days',             path: '/hr-admin/lop-days',        icon: Calendar    },
                { label: 'PF Register & ECR File',  sub: 'Download ECR for EPFO portal upload',         path: '/hr-admin/compliance',      icon: ShieldCheck },
                { label: 'ESI Register',             sub: 'ESI contribution register for ESIC portal',  path: '/hr-admin/compliance',      icon: Fingerprint },
                { label: 'Wage Register',            sub: 'Monthly wage register — statutory record',   path: '/hr-admin/compliance',      icon: IndianRupee },
                { label: 'Loans & Advances',         sub: 'Manage employee loans and advance recovery', path: '/hr-admin/loans',           icon: Briefcase   },
                { label: 'HR Reports',               sub: 'Export payroll & statutory reports to Excel',path: '/hr-admin/reports',         icon: FileText    },
                { label: 'Employee List',            sub: 'Manage employee profiles and assignments',   path: '/hr-admin/employees',       icon: Users       },
              ].map(({ label, sub, path, icon: Icon }) => (
                <div key={path + label} onClick={() => navigate(path)}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors print:hidden">
                  <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </div>
              ))}
            </SectionCard>

          </div>
        </div>
      </div>
    </>
  );
}
