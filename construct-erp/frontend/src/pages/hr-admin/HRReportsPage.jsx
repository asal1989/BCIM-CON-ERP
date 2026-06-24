import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeIndianRupee,
  Briefcase,
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  Clock3,
  Download,
  FileBarChart,
  FileText,
  Headphones,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
import toast from 'react-hot-toast';
import {
  hrAttendanceAPI,
  hrAdvancedAPI,
  hrEmployeesAPI,
  hrLeaveAPI,
  hrPayrollAPI,
} from '../../api/client';
import HRConfirmationReportPage from './HRConfirmationReportPage';
import HRCompliancePage from './HRCompliancePage';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const fmtMoney = (value) =>
  `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const intVal = (value) => Number.parseInt(value || 0, 10);
const numVal = (value) => Number.parseFloat(value || 0);

function downloadCSV(rows, filename) {
  if (!rows?.length) {
    toast.error('No data to export');
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvRows = rows.map((row) =>
    headers.map((key) => JSON.stringify(row[key] ?? '')).join(',')
  );
  const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
}

function asRows(payload) {
  return Array.isArray(payload) ? payload : payload?.data || [];
}

const tabs = [
  { id: 'overview',        label: 'Overview',            icon: FileBarChart   },
  { id: 'employees',       label: 'Employees',           icon: Users          },
  { id: 'attendance',      label: 'Attendance',          icon: CalendarCheck  },
  { id: 'leave',           label: 'Leave',               icon: CalendarOff    },
  { id: 'payroll',         label: 'Payroll',             icon: BadgeIndianRupee },
  { id: 'statutory',       label: 'Statutory Reports',   icon: ShieldCheck    },
  { id: 'compliance',      label: 'Compliance Alerts',   icon: AlertTriangle  },
  { id: 'confirmation',    label: 'Confirmation',        icon: CheckCircle2   },
  { id: 'advanced',        label: 'Advanced HR',         icon: Briefcase      },
];

function MonthFilter({ month, setMonth, year, setYear }) {
  const sel = "h-9 rounded-xl border border-white/20 bg-white/15 px-3 text-sm font-black text-white focus:outline-none focus:border-white/40 transition backdrop-blur-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={sel}>
        {MONTHS.slice(1).map((label, index) => <option key={label} value={index + 1} className="bg-gray-900 text-white">{label}</option>)}
      </select>
      <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={sel}>
        {YEARS.map((item) => <option key={item} value={item} className="bg-gray-900 text-white">{item}</option>)}
      </select>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          {sub && <p className="mt-1 text-xs font-semibold text-slate-600">{sub}</p>}
        </div>
        <div className="rounded-lg bg-white/80 p-2 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function DataTable({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wide">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} className="border-b border-slate-200 hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {col.render ? col.render(row) : row[col.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportSection({ title, subtitle, action, children }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          {subtitle && <p className="text-sm font-semibold text-slate-600">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function OverviewTab({ employees, headcountRows, payrollRecords, payrollTotals, leaveRows, attendanceRows, compliance }) {
  const active = employees.filter((emp) => (emp.employment_status || 'active') === 'active').length;
  const missingStatutory = compliance?.missing_statutory?.length || 0;
  const missingDocs = compliance?.missing_documents?.length || 0;
  const pendingLeaves = leaveRows.filter((row) => row.status === 'pending').length;
  const attendanceMarked = attendanceRows.length;

  const deptRows = headcountRows.slice(0, 8);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Active Employees" value={active} sub={`${employees.length} total profiles`} tone="blue" />
        <MetricCard icon={CalendarCheck} label="Attendance Marked" value={attendanceMarked} sub="Current selected month" tone="green" />
        <MetricCard icon={CalendarOff} label="Pending Leaves" value={pendingLeaves} sub="Needs HR action" tone="amber" />
        <MetricCard icon={BadgeIndianRupee} label="Net Payroll" value={fmtMoney(payrollTotals.net_pay)} sub={`${payrollRecords.length} payroll rows`} tone="slate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="Department Headcount" subtitle="Quick view by department">
          <DataTable
            columns={[
              { key: 'department', label: 'Department', render: (r) => r.department || 'Unassigned' },
              { key: 'active', label: 'Active' },
              { key: 'permanent', label: 'Permanent' },
              { key: 'contract', label: 'Contract' },
              { key: 'probation', label: 'Probation' },
            ]}
            rows={deptRows}
          />
        </ReportSection>
        <ReportSection title="Compliance Snapshot" subtitle="Profile gaps that HR must close">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard icon={AlertTriangle} label="Missing Statutory" value={missingStatutory} sub="PAN, Aadhaar, bank details" tone="amber" />
            <MetricCard icon={FileText} label="No Documents" value={missingDocs} sub="No HR documents uploaded" tone="blue" />
            <MetricCard icon={ShieldCheck} label="Probation Due" value={compliance?.probation_due?.length || 0} sub="Due in next 30 days" tone="green" />
            <MetricCard icon={AlertTriangle} label="Exit Pending" value={compliance?.exit_pending?.length || 0} sub="Exit checklist pending" tone="slate" />
          </div>
        </ReportSection>
      </div>
    </div>
  );
}

function EmployeesTab({ employees, headcountRows }) {
  const exportRows = employees.map((emp) => ({
    employee_code: emp.employee_code,
    name: emp.name,
    email: emp.email,
    phone: emp.phone,
    department: emp.department_name || emp.department,
    designation: emp.designation_name || emp.designation,
    reporting_manager: emp.reporting_manager_name,
    work_location: emp.work_location,
    joining_date: emp.date_of_joining,
    employment_type: emp.employment_type,
    employment_status: emp.employment_status,
  }));

  return (
    <div className="space-y-6">
      <ReportSection
        title="Employee Register"
        subtitle="Full employee directory with department, manager, work location, and service status"
        action={<button onClick={() => downloadCSV(exportRows, 'hr-employee-register.csv')} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
      >
        <DataTable
          columns={[
            { key: 'employee_code', label: 'Code' },
            { key: 'name', label: 'Employee' },
            { key: 'department_name', label: 'Department', render: (r) => r.department_name || r.department || '-' },
            { key: 'designation_name', label: 'Designation', render: (r) => r.designation_name || r.designation || '-' },
            { key: 'reporting_manager_name', label: 'Manager' },
            { key: 'work_location', label: 'Location' },
            { key: 'employment_status', label: 'Status', render: (r) => <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{r.employment_status || 'active'}</span> },
          ]}
          rows={employees}
        />
      </ReportSection>

      <ReportSection title="Headcount Summary" subtitle="Department-wise employment mix">
        <DataTable
          columns={[
            { key: 'department', label: 'Department', render: (r) => r.department || 'Unassigned' },
            { key: 'total', label: 'Total' },
            { key: 'active', label: 'Active' },
            { key: 'resigned', label: 'Resigned' },
            { key: 'permanent', label: 'Permanent' },
            { key: 'contract', label: 'Contract' },
            { key: 'probation', label: 'Probation' },
          ]}
          rows={headcountRows}
        />
      </ReportSection>
    </div>
  );
}

function AttendanceTab({ rows, month, year }) {
  const summary = rows.reduce((acc, row) => {
    acc.present += numVal(row.present_days || row.present || (row.status === 'present' ? 1 : 0));
    acc.absent += numVal(row.absent_days || row.absent || (row.status === 'absent' ? 1 : 0));
    acc.leave += numVal(row.leave_days || row.leave || (row.status === 'leave' ? 1 : 0));
    acc.half += numVal(row.half_day_days || row.half_day || (row.status === 'half_day' ? 1 : 0));
    return acc;
  }, { present: 0, absent: 0, leave: 0, half: 0 });

  const exportRows = rows.map((row) => ({
    employee: row.employee_name || row.name,
    department: row.department_name,
    date: row.attendance_date || row.date,
    status: row.status,
    present: row.present_days || row.present,
    absent: row.absent_days || row.absent,
    leave: row.leave_days || row.leave,
    half_day: row.half_day_days || row.half_day,
  }));

  return (
    <ReportSection
      title={`Attendance Report - ${MONTHS[month]} ${year}`}
      subtitle="Monthly attendance rows from HR attendance module"
      action={<button onClick={() => downloadCSV(exportRows, `attendance-${MONTHS[month]}-${year}.csv`)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
    >
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <MetricCard icon={CalendarCheck} label="Present" value={summary.present} tone="green" />
        <MetricCard icon={CalendarOff} label="Absent" value={summary.absent} tone="amber" />
        <MetricCard icon={CalendarOff} label="Leave" value={summary.leave} tone="blue" />
        <MetricCard icon={CalendarCheck} label="Half Day" value={summary.half} tone="slate" />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee', render: (r) => r.employee_name || r.name || '-' },
          { key: 'department_name', label: 'Department' },
          { key: 'attendance_date', label: 'Date', render: (r) => r.attendance_date || r.date || '-' },
          { key: 'status', label: 'Status', render: (r) => <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{r.status || '-'}</span> },
          { key: 'remarks', label: 'Remarks' },
        ]}
        rows={rows}
      />
    </ReportSection>
  );
}

function LeaveTab({ rows }) {
  const totals = rows.reduce((acc, row) => {
    acc[row.status || 'pending'] = (acc[row.status || 'pending'] || 0) + 1;
    return acc;
  }, {});
  const exportRows = rows.map((row) => ({
    employee: row.employee_name || row.name,
    leave_type: row.leave_type_name || row.leave_type,
    from_date: row.from_date,
    to_date: row.to_date,
    days: row.days,
    status: row.status,
    reason: row.reason,
  }));

  return (
    <ReportSection
      title="Leave Register"
      subtitle="Leave requests with approval status"
      action={<button onClick={() => downloadCSV(exportRows, 'leave-register.csv')} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
    >
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <MetricCard icon={CalendarOff} label="Pending" value={totals.pending || 0} tone="amber" />
        <MetricCard icon={CalendarCheck} label="Approved" value={totals.approved || 0} tone="green" />
        <MetricCard icon={AlertTriangle} label="Rejected" value={totals.rejected || 0} tone="slate" />
        <MetricCard icon={Users} label="Total Requests" value={rows.length} tone="blue" />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee', render: (r) => r.employee_name || r.name || '-' },
          { key: 'leave_type_name', label: 'Leave Type', render: (r) => r.leave_type_name || r.leave_type || '-' },
          { key: 'from_date', label: 'From' },
          { key: 'to_date', label: 'To' },
          { key: 'days', label: 'Days' },
          { key: 'status', label: 'Status', render: (r) => <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{r.status || '-'}</span> },
        ]}
        rows={rows}
      />
    </ReportSection>
  );
}

function PayrollTab({ records, totals, month, year }) {
  const exportRows = records.map((row) => ({
    employee: row.employee_name,
    code: row.employee_code,
    department: row.department_name,
    gross: row.gross_earnings,
    pf: row.pf_employee,
    esi: row.esi_employee,
    pt: row.pt,
    tds: row.tds,
    deductions: row.total_deductions,
    net_pay: row.net_pay,
    status: row.status,
  }));

  return (
    <ReportSection
      title={`Payroll Summary - ${MONTHS[month]} ${year}`}
      subtitle="Gross salary, statutory deductions, and net payable"
      action={<button onClick={() => downloadCSV(exportRows, `payroll-${MONTHS[month]}-${year}.csv`)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
    >
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <MetricCard icon={Users} label="Employees" value={records.length} tone="blue" />
        <MetricCard icon={BadgeIndianRupee} label="Gross Pay" value={fmtMoney(totals.gross_earnings)} tone="slate" />
        <MetricCard icon={AlertTriangle} label="Deductions" value={fmtMoney(totals.total_deductions)} tone="amber" />
        <MetricCard icon={BadgeIndianRupee} label="Net Pay" value={fmtMoney(totals.net_pay)} tone="green" />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'department_name', label: 'Department' },
          { key: 'gross_earnings', label: 'Gross', render: (r) => fmtMoney(r.gross_earnings) },
          { key: 'pf_employee', label: 'PF', render: (r) => fmtMoney(r.pf_employee) },
          { key: 'esi_employee', label: 'ESI', render: (r) => fmtMoney(r.esi_employee) },
          { key: 'tds', label: 'TDS', render: (r) => fmtMoney(r.tds) },
          { key: 'total_deductions', label: 'Deductions', render: (r) => fmtMoney(r.total_deductions) },
          { key: 'net_pay', label: 'Net Pay', render: (r) => fmtMoney(r.net_pay) },
          { key: 'status', label: 'Status' },
        ]}
        rows={records}
      />
    </ReportSection>
  );
}

function StatutoryTab({ pfRows, esiRows, month, year }) {
  const pfTotals = pfRows.reduce((acc, row) => {
    acc.basic += numVal(row.basic);
    acc.employee += numVal(row.pf_employee);
    acc.employer += numVal(row.pf_employer);
    acc.total += numVal(row.total_pf);
    return acc;
  }, { basic: 0, employee: 0, employer: 0, total: 0 });

  const esiTotals = esiRows.reduce((acc, row) => {
    acc.gross += numVal(row.gross_earnings);
    acc.employee += numVal(row.esi_employee);
    acc.employer += numVal(row.esi_employer);
    acc.total += numVal(row.total_esi);
    return acc;
  }, { gross: 0, employee: 0, employer: 0, total: 0 });

  return (
    <div className="space-y-6">
      <ReportSection
        title={`PF ECR - ${MONTHS[month]} ${year}`}
        subtitle="Provident Fund statutory report"
        action={<button onClick={() => downloadCSV(pfRows, `pf-ecr-${MONTHS[month]}-${year}.csv`)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> PF CSV</button>}
      >
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <MetricCard icon={Users} label="PF Employees" value={pfRows.length} tone="blue" />
          <MetricCard icon={BadgeIndianRupee} label="Basic Wages" value={fmtMoney(pfTotals.basic)} tone="slate" />
          <MetricCard icon={ShieldCheck} label="Employee PF" value={fmtMoney(pfTotals.employee)} tone="green" />
          <MetricCard icon={ShieldCheck} label="Total PF" value={fmtMoney(pfTotals.total)} tone="amber" />
        </div>
        <DataTable
          columns={[
            { key: 'name', label: 'Employee' },
            { key: 'uan_number', label: 'UAN' },
            { key: 'pf_account_number', label: 'PF Account' },
            { key: 'basic', label: 'Basic', render: (r) => fmtMoney(r.basic) },
            { key: 'pf_employee', label: 'PF Employee', render: (r) => fmtMoney(r.pf_employee) },
            { key: 'pf_employer', label: 'PF Employer', render: (r) => fmtMoney(r.pf_employer) },
            { key: 'total_pf', label: 'Total PF', render: (r) => fmtMoney(r.total_pf) },
          ]}
          rows={pfRows}
        />
      </ReportSection>

      <ReportSection
        title={`ESI Return - ${MONTHS[month]} ${year}`}
        subtitle="ESI statutory report"
        action={<button onClick={() => downloadCSV(esiRows, `esi-return-${MONTHS[month]}-${year}.csv`)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> ESI CSV</button>}
      >
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <MetricCard icon={Users} label="ESI Employees" value={esiRows.length} tone="blue" />
          <MetricCard icon={BadgeIndianRupee} label="Gross Wages" value={fmtMoney(esiTotals.gross)} tone="slate" />
          <MetricCard icon={ShieldCheck} label="Employee ESI" value={fmtMoney(esiTotals.employee)} tone="green" />
          <MetricCard icon={ShieldCheck} label="Total ESI" value={fmtMoney(esiTotals.total)} tone="amber" />
        </div>
        <DataTable
          columns={[
            { key: 'name', label: 'Employee' },
            { key: 'esi_number', label: 'ESI No.' },
            { key: 'gross_earnings', label: 'Gross', render: (r) => fmtMoney(r.gross_earnings) },
            { key: 'esi_employee', label: 'ESI Employee', render: (r) => fmtMoney(r.esi_employee) },
            { key: 'esi_employer', label: 'ESI Employer', render: (r) => fmtMoney(r.esi_employer) },
            { key: 'total_esi', label: 'Total ESI', render: (r) => fmtMoney(r.total_esi) },
          ]}
          rows={esiRows}
        />
      </ReportSection>
    </div>
  );
}

function ComplianceTab({ compliance }) {
  const statutoryRows = compliance?.missing_statutory || [];
  const docRows = compliance?.missing_documents || [];
  const probationRows = compliance?.probation_due || [];
  const exitRows = compliance?.exit_pending || [];
  const allRows = [
    ...probationRows.map((r) => ({ type: 'Probation Due', employee: r.name, code: r.employee_code, department: r.department_name, detail: r.probation_end_date })),
    ...statutoryRows.map((r) => ({ type: 'Missing Statutory', employee: r.name, code: r.employee_code, department: r.department_name, detail: (r.missing_fields || []).join(', ') })),
    ...docRows.map((r) => ({ type: 'No Documents', employee: r.name, code: r.employee_code, department: r.department_name, detail: 'No documents uploaded' })),
    ...exitRows.map((r) => ({ type: 'Exit Pending', employee: r.name, code: r.employee_code, department: r.department_name, detail: `${r.pending_items || 0} pending items` })),
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={ShieldCheck} label="Probation Due" value={probationRows.length} tone="blue" />
        <MetricCard icon={AlertTriangle} label="Statutory Missing" value={statutoryRows.length} tone="amber" />
        <MetricCard icon={FileText} label="Documents Missing" value={docRows.length} tone="slate" />
        <MetricCard icon={AlertTriangle} label="Exit Pending" value={exitRows.length} tone="green" />
      </div>

      <ReportSection
        title="HR Compliance Register"
        subtitle="Action list for employee master, documents, probation, and exit clearance"
        action={<button onClick={() => downloadCSV(allRows, 'hr-compliance-register.csv')} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
      >
        <DataTable
          columns={[
            { key: 'type', label: 'Alert Type' },
            { key: 'code', label: 'Code' },
            { key: 'employee', label: 'Employee' },
            { key: 'department', label: 'Department' },
            { key: 'detail', label: 'Detail' },
          ]}
          rows={allRows}
          empty="No compliance gaps found"
        />
      </ReportSection>
    </div>
  );
}

function AdvancedHRTab({ summary, jobs, candidates, training, goals, cases, exits, letters, policies, serviceRequests }) {
  const s = summary || {};
  const metricRows = [
    { label: 'Open Jobs', value: s.recruitment?.open_jobs || 0, icon: Briefcase, tone: 'blue' },
    { label: 'Pending Corrections', value: s.attendanceCorrections?.pending || 0, icon: Clock3, tone: 'amber' },
    { label: 'Planned Training', value: s.training?.planned || 0, icon: FileText, tone: 'green' },
    { label: 'Open Cases', value: s.cases?.open_cases || 0, icon: XCircle, tone: 'slate' },
    { label: 'Active Exits', value: s.exits?.active_exits || 0, icon: Users, tone: 'amber' },
    { label: 'Avg Rating', value: s.goals?.avg_rating || 0, icon: CheckCircle2, tone: 'green' },
    { label: 'Issued Letters', value: s.letters?.issued_letters || 0, icon: FileText, tone: 'blue' },
    { label: 'Policies', value: s.policies?.published_policies || 0, icon: ShieldCheck, tone: 'slate' },
    { label: 'Open HR Requests', value: s.serviceRequests?.open_requests || 0, icon: Headphones, tone: 'amber' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {metricRows.map((m) => <MetricCard key={m.label} icon={m.icon} label={m.label} value={m.value} tone={m.tone} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection
          title="Recruitment Pipeline"
          subtitle="Open jobs and candidate status"
          action={<button onClick={() => downloadCSV(candidates, 'hr-candidate-pipeline.csv')} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}><Download className="h-4 w-4" /> Export</button>}
        >
          <DataTable
            columns={[
              { key: 'name', label: 'Candidate' },
              { key: 'job_title', label: 'Job' },
              { key: 'phone', label: 'Phone' },
              { key: 'status', label: 'Status' },
            ]}
            rows={candidates}
          />
        </ReportSection>

        <ReportSection title="Open Job Register" subtitle="Vacancy and candidate count">
          <DataTable
            columns={[
              { key: 'title', label: 'Job' },
              { key: 'department_name', label: 'Department' },
              { key: 'vacancies', label: 'Vacancies' },
              { key: 'candidates_count', label: 'Candidates' },
              { key: 'status', label: 'Status' },
            ]}
            rows={jobs}
          />
        </ReportSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="Training Tracker" subtitle="Programs, nominations and attendance">
          <DataTable
            columns={[
              { key: 'title', label: 'Program' },
              { key: 'category', label: 'Category' },
              { key: 'training_date', label: 'Date', render: (r) => String(r.training_date || '').slice(0, 10) || '-' },
              { key: 'nominated_count', label: 'Nominated' },
              { key: 'attended_count', label: 'Attended' },
            ]}
            rows={training}
          />
        </ReportSection>

        <ReportSection title="Performance Goals" subtitle="KRA status and ratings">
          <DataTable
            columns={[
              { key: 'employee_name', label: 'Employee' },
              { key: 'period', label: 'Period' },
              { key: 'goal_title', label: 'Goal' },
              { key: 'target_value', label: 'Target' },
              { key: 'rating', label: 'Rating' },
            ]}
            rows={goals}
          />
        </ReportSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="HR Cases" subtitle="Grievance, warning and disciplinary matters">
          <DataTable
            columns={[
              { key: 'employee_name', label: 'Employee' },
              { key: 'case_type', label: 'Type' },
              { key: 'severity', label: 'Severity' },
              { key: 'title', label: 'Title' },
              { key: 'status', label: 'Status' },
            ]}
            rows={cases}
          />
        </ReportSection>

        <ReportSection title="Exit Clearance" subtitle="Resignation and clearance status">
          <DataTable
            columns={[
              { key: 'employee_name', label: 'Employee' },
              { key: 'last_working_date', label: 'LWD', render: (r) => String(r.last_working_date || '').slice(0, 10) || '-' },
              { key: 'handover_status', label: 'Handover' },
              { key: 'asset_clearance_status', label: 'Assets' },
              { key: 'finance_clearance_status', label: 'Finance' },
              { key: 'status', label: 'Status' },
            ]}
            rows={exits}
          />
        </ReportSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="Issued HR Letters" subtitle="Employee letters issued by HR">
          <DataTable
            columns={[
              { key: 'letter_no', label: 'Letter No.' },
              { key: 'employee_name', label: 'Employee' },
              { key: 'template_title', label: 'Template' },
              { key: 'issue_date', label: 'Date', render: (r) => String(r.issue_date || '').slice(0, 10) || '-' },
              { key: 'status', label: 'Status' },
            ]}
            rows={letters}
          />
        </ReportSection>

        <ReportSection title="Policy Acknowledgement" subtitle="Published policies and employee acknowledgements">
          <DataTable
            columns={[
              { key: 'policy_code', label: 'Code' },
              { key: 'title', label: 'Policy' },
              { key: 'version', label: 'Version' },
              { key: 'acknowledged_count', label: 'Acknowledged' },
              { key: 'status', label: 'Status' },
            ]}
            rows={policies}
          />
        </ReportSection>
      </div>

      <ReportSection title="HR Service Desk" subtitle="Employee requests and HR support status">
        <DataTable
          columns={[
            { key: 'request_no', label: 'Req No.' },
            { key: 'employee_name', label: 'Employee' },
            { key: 'request_type', label: 'Type' },
            { key: 'priority', label: 'Priority' },
            { key: 'subject', label: 'Subject' },
            { key: 'assigned_to_name', label: 'Owner' },
            { key: 'status', label: 'Status' },
          ]}
          rows={serviceRequests}
        />
      </ReportSection>
    </div>
  );
}

export default function HRReportsPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('overview');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: empData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['hr-report-employees'],
    queryFn: () => hrEmployeesAPI.list({}).then((r) => r.data),
  });
  const { data: headcountData } = useQuery({
    queryKey: ['hr-report-headcount'],
    queryFn: () => hrPayrollAPI.headcount().then((r) => r.data),
  });
  const { data: attendanceData } = useQuery({
    queryKey: ['hr-report-attendance', month, year],
    queryFn: () => hrAttendanceAPI.list({ month, year }).then((r) => r.data),
  });
  const { data: leaveData } = useQuery({
    queryKey: ['hr-report-leaves'],
    queryFn: () => hrLeaveAPI.listRequests({}).then((r) => r.data),
  });
  const { data: payrollData } = useQuery({
    queryKey: ['hr-report-payroll', month, year],
    queryFn: () => hrPayrollAPI.list({ month, year }).then((r) => r.data),
  });
  const { data: pfData } = useQuery({
    queryKey: ['hr-report-pf', month, year],
    queryFn: () => hrPayrollAPI.pfEcr({ month, year }).then((r) => r.data),
  });
  const { data: esiData } = useQuery({
    queryKey: ['hr-report-esi', month, year],
    queryFn: () => hrPayrollAPI.esiReturn({ month, year }).then((r) => r.data),
  });
  const { data: complianceData } = useQuery({
    queryKey: ['hr-report-compliance'],
    queryFn: () => hrEmployeesAPI.compliance().then((r) => r.data),
  });
  const { data: advancedSummaryData } = useQuery({
    queryKey: ['hr-report-advanced-summary'],
    queryFn: () => hrAdvancedAPI.analyticsSummary().then((r) => r.data),
  });
  const { data: jobsData } = useQuery({
    queryKey: ['hr-report-advanced-jobs'],
    queryFn: () => hrAdvancedAPI.listJobs().then((r) => r.data),
  });
  const { data: candidatesData } = useQuery({
    queryKey: ['hr-report-advanced-candidates'],
    queryFn: () => hrAdvancedAPI.listCandidates().then((r) => r.data),
  });
  const { data: trainingData } = useQuery({
    queryKey: ['hr-report-advanced-training'],
    queryFn: () => hrAdvancedAPI.listTrainingPrograms().then((r) => r.data),
  });
  const { data: goalsData } = useQuery({
    queryKey: ['hr-report-advanced-goals'],
    queryFn: () => hrAdvancedAPI.listGoals().then((r) => r.data),
  });
  const { data: casesData } = useQuery({
    queryKey: ['hr-report-advanced-cases'],
    queryFn: () => hrAdvancedAPI.listEmployeeCases().then((r) => r.data),
  });
  const { data: exitsData } = useQuery({
    queryKey: ['hr-report-advanced-exits'],
    queryFn: () => hrAdvancedAPI.listExits().then((r) => r.data),
  });
  const { data: lettersData } = useQuery({
    queryKey: ['hr-report-advanced-letters'],
    queryFn: () => hrAdvancedAPI.listLetterIssues().then((r) => r.data),
  });
  const { data: policiesData } = useQuery({
    queryKey: ['hr-report-advanced-policies'],
    queryFn: () => hrAdvancedAPI.listPolicies().then((r) => r.data),
  });
  const { data: serviceRequestsData } = useQuery({
    queryKey: ['hr-report-advanced-service-requests'],
    queryFn: () => hrAdvancedAPI.listServiceRequests().then((r) => r.data),
  });

  const employees = asRows(empData);
  const headcountRows = asRows(headcountData);
  const attendanceRows = asRows(attendanceData);
  const leaveRows = asRows(leaveData);
  const payrollRecords = asRows(payrollData);
  const pfRows = asRows(pfData);
  const esiRows = asRows(esiData);
  const payrollTotals = payrollData?.totals || {};
  const compliance = complianceData || {};
  const advancedSummary = advancedSummaryData?.data || {};
  const jobs = asRows(jobsData);
  const candidates = asRows(candidatesData);
  const training = asRows(trainingData);
  const goals = asRows(goalsData);
  const cases = asRows(casesData);
  const exits = asRows(exitsData);
  const letters = asRows(lettersData);
  const policies = asRows(policiesData);
  const serviceRequests = asRows(serviceRequestsData);

  const loading = loadingEmployees;
  const activeLabel = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label || 'Overview', [activeTab]);

  return (
    <div className="min-h-screen p-6 space-y-6" style={{background:'#F8FAFC'}}>

      {/* Header Banner */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <FileBarChart className="w-5 h-5 text-white"/>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-0.5">HR &amp; Admin</p>
              <h1 className="text-2xl font-black text-white">HR Reports Hub</h1>
              <p className="text-white/55 text-sm mt-0.5">Employee, attendance, leave, payroll, statutory &amp; compliance reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl p-1.5">
            <MonthFilter month={month} setMonth={setMonth} year={year} setYear={setYear}/>
          </div>
        </div>
      </motion.div>

      {/* Tab Bar */}
      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 p-1.5"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition whitespace-nowrap ${
                  isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm font-bold text-gray-400"
          style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
          Loading {activeLabel}…
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab employees={employees} headcountRows={headcountRows} payrollRecords={payrollRecords} payrollTotals={payrollTotals} leaveRows={leaveRows} attendanceRows={attendanceRows} compliance={compliance} />}
          {activeTab === 'employees' && <EmployeesTab employees={employees} headcountRows={headcountRows} />}
          {activeTab === 'attendance' && <AttendanceTab rows={attendanceRows} month={month} year={year} />}
          {activeTab === 'leave' && <LeaveTab rows={leaveRows} />}
          {activeTab === 'payroll' && <PayrollTab records={payrollRecords} totals={payrollTotals} month={month} year={year} />}
          {activeTab === 'statutory'    && <HRCompliancePage embedded />}
          {activeTab === 'compliance'   && <ComplianceTab compliance={compliance} />}
          {activeTab === 'confirmation' && <HRConfirmationReportPage embedded />}
          {activeTab === 'advanced'     && <AdvancedHRTab summary={advancedSummary} jobs={jobs} candidates={candidates} training={training} goals={goals} cases={cases} exits={exits} letters={letters} policies={policies} serviceRequests={serviceRequests} />}
        </>
      )}
    </div>
  );
}
