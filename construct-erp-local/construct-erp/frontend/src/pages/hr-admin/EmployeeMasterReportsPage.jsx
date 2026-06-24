// src/pages/hr-admin/EmployeeMasterReportsPage.jsx
// 👤 Employee Master — 8 reports (master, new joinees, probation, separation,
// headcount, contract expiry, transfers, document checklist)
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, UserPlus, BadgeCheck, UserMinus, PieChart,
  CalendarClock, ArrowLeftRight, FileCheck2, Download,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const API = axios.create({ baseURL: '/api', withCredentials: true });
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();
const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const daysBetween = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
const tenure = (d) => {
  if (!d) return '—';
  const days = daysBetween(d);
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return `${y}y ${m}m`;
};

function downloadCSV(rows, filename) {
  if (!rows?.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((k) => JSON.stringify(row[k] ?? '')).join(','));
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
}

const REPORTS = [
  { id: 'master',     label: 'Employee Master',       icon: Users },
  { id: 'joinees',    label: 'New Joinees',           icon: UserPlus },
  { id: 'probation',  label: 'Confirmation / Probation', icon: BadgeCheck },
  { id: 'separation', label: 'Separation / Exit',     icon: UserMinus },
  { id: 'headcount',  label: 'Headcount Summary',     icon: PieChart },
  { id: 'contract',   label: 'Contract Expiry',       icon: CalendarClock },
  { id: 'transfer',   label: 'Transfers',             icon: ArrowLeftRight },
  { id: 'documents',  label: 'Document Checklist',    icon: FileCheck2 },
];

const TH = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' };
const TD = { padding: '10px 14px', fontSize: 13, color: '#334155', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' };

function Table({ columns, rows, empty = 'No records found' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F8FAFC' }}>{columns.map((c) => <th key={c.key} style={TH}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{empty}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id || i} style={{ background: i % 2 ? '#FCFCFD' : '#fff' }}>
                {columns.map((c) => <td key={c.key} style={TD}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate:  { bg: '#F1F5F9', fg: '#475569' },
    green:  { bg: '#DCFCE7', fg: '#15803D' },
    amber:  { bg: '#FEF3C7', fg: '#B45309' },
    red:    { bg: '#FEE2E2', fg: '#DC2626' },
    blue:   { bg: '#DBEAFE', fg: '#1D4ED8' },
  }[tone];
  return <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: tones.bg, color: tones.fg }}>{children}</span>;
}

function Stat({ label, value, tone = 'blue' }) {
  const c = { blue: '#2563EB', green: '#15803D', amber: '#B45309', red: '#DC2626', slate: '#475569' }[tone];
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: c, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ExportBtn({ rows, filename }) {
  return (
    <button onClick={() => downloadCSV(rows, filename)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#0A1F5C', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
      <Download size={14} /> Export CSV
    </button>
  );
}

function SectionHead({ title, subtitle, rows, filename }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: '#64748B', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <ExportBtn rows={rows} filename={filename} />
    </div>
  );
}

export default function EmployeeMasterReportsPage() {
  const [active, setActive] = useState('master');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expiryDays, setExpiryDays] = useState(60);

  const { data, isLoading } = useQuery({
    queryKey: ['emp-master-reports', month, year, expiryDays],
    queryFn: () => API.get('/hr/reports/employee-master', { params: { month, year, expiry_days: expiryDays } }).then((r) => r.data?.data || {}),
  });

  const d = data || {};
  const master = d.master || [];
  const joinees = d.new_joinees || [];
  const probation = d.probation || [];
  const separations = d.separations || [];
  const headcount = d.headcount || [];
  const contracts = d.contract_expiry || [];
  const transfers = d.transfers || [];
  const docs = d.document_checklist || [];
  const requiredDocs = d.required_docs || [];

  const totalActive = master.filter((e) => (e.employment_status || 'active') === 'active').length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0A1F5C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={19} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Employee Master Reports</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Master list, joinees, probation, separation, headcount, contract expiry, transfers & document checklist.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(active === 'joinees') && (
            <>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selStyle}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selStyle}>
                {YEARS.map((y) => <option key={y}>{y}</option>)}
              </select>
            </>
          )}
          {active === 'contract' && (
            <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} style={selStyle}>
              {[30, 60, 90, 180].map((n) => <option key={n} value={n}>Next {n} days</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Report tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const on = active === r.id;
          return (
            <button key={r.id} onClick={() => setActive(r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid', borderColor: on ? '#0A1F5C' : '#E2E8F0', background: on ? '#0A1F5C' : '#fff', color: on ? '#fff' : '#64748B' }}>
              <Icon size={15} /> {r.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Loading reports…</div>
      ) : (
        <>
          {/* 1. MASTER */}
          {active === 'master' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="Total Employees" value={master.length} tone="slate" />
                <Stat label="Active" value={totalActive} tone="green" />
                <Stat label="On Probation" value={master.filter((e) => e.employment_type === 'probation').length} tone="amber" />
                <Stat label="Contract" value={master.filter((e) => e.employment_type === 'contract').length} tone="blue" />
              </div>
              <SectionHead title="Employee Master List" subtitle="Complete directory with department, designation, manager and status" rows={master.map((e) => ({ code: e.employee_code, name: e.name, email: e.email, phone: e.phone, department: e.department_name, designation: e.designation_name, type: e.employment_type, status: e.employment_status, joined: e.date_of_joining }))} filename="employee-master.csv" />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.name}</strong> },
                  { key: 'department_name', label: 'Department' },
                  { key: 'designation_name', label: 'Designation' },
                  { key: 'reporting_manager_name', label: 'Manager' },
                  { key: 'work_location', label: 'Location' },
                  { key: 'employment_type', label: 'Type', render: (r) => <Badge tone="blue">{r.employment_type || 'permanent'}</Badge> },
                  { key: 'employment_status', label: 'Status', render: (r) => <Badge tone={(r.employment_status || 'active') === 'active' ? 'green' : 'red'}>{r.employment_status || 'active'}</Badge> },
                ]}
                rows={master}
              />
            </div>
          )}

          {/* 2. NEW JOINEES */}
          {active === 'joinees' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label={`Joined in ${MONTHS[month - 1]} ${year}`} value={joinees.length} tone="green" />
              </div>
              <SectionHead title={`New Joinee Report — ${MONTHS[month - 1]} ${year}`} subtitle="Employees who joined in the selected month" rows={joinees.map((e) => ({ code: e.employee_code, name: e.name, department: e.department_name, designation: e.designation_name, joined: e.date_of_joining, type: e.employment_type }))} filename={`new-joinees-${MONTHS[month - 1]}-${year}.csv`} />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.name}</strong> },
                  { key: 'department_name', label: 'Department' },
                  { key: 'designation_name', label: 'Designation' },
                  { key: 'date_of_joining', label: 'Date of Joining', render: (r) => fmtDate(r.date_of_joining) },
                  { key: 'employment_type', label: 'Type', render: (r) => <Badge tone="blue">{r.employment_type || 'permanent'}</Badge> },
                  { key: 'work_location', label: 'Location' },
                ]}
                rows={joinees}
                empty={`No employees joined in ${MONTHS[month - 1]} ${year}`}
              />
            </div>
          )}

          {/* 3. PROBATION / CONFIRMATION */}
          {active === 'probation' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="On Probation" value={probation.length} tone="amber" />
                <Stat label="Confirmation Overdue" value={probation.filter((e) => e.probation_end_date && new Date(e.probation_end_date) < now).length} tone="red" />
              </div>
              <SectionHead title="Confirmation / Probation Report" subtitle="Employees on probation and confirmation due dates" rows={probation.map((e) => ({ code: e.employee_code, name: e.name, department: e.department_name, joined: e.date_of_joining, probation_end: e.probation_end_date }))} filename="probation-confirmation.csv" />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.name}</strong> },
                  { key: 'department_name', label: 'Department' },
                  { key: 'date_of_joining', label: 'Joined', render: (r) => fmtDate(r.date_of_joining) },
                  { key: 'probation_end_date', label: 'Probation Ends', render: (r) => fmtDate(r.probation_end_date) },
                  { key: 'due', label: 'Confirmation', render: (r) => {
                    if (!r.probation_end_date) return <Badge>No date</Badge>;
                    const days = Math.floor((new Date(r.probation_end_date) - now) / 86400000);
                    if (days < 0) return <Badge tone="red">Overdue {Math.abs(days)}d</Badge>;
                    if (days <= 30) return <Badge tone="amber">Due in {days}d</Badge>;
                    return <Badge tone="green">In {days}d</Badge>;
                  } },
                ]}
                rows={probation}
                empty="No employees on probation"
              />
            </div>
          )}

          {/* 4. SEPARATION / EXIT */}
          {active === 'separation' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="Total Separations" value={separations.length} tone="red" />
                <Stat label="Clearance Pending" value={separations.filter((e) => e.clearance_status && e.clearance_status !== 'completed' && e.clearance_status !== 'cleared').length} tone="amber" />
              </div>
              <SectionHead title="Separation / Exit Report" subtitle="Resigned, terminated and exited employees with clearance status" rows={separations.map((e) => ({ code: e.employee_code, name: e.name, department: e.department_name, resignation: e.resignation_date, last_working: e.last_working_day || e.date_of_leaving, reason: e.separation_reason || e.leaving_reason, clearance: e.clearance_status }))} filename="separation-exit.csv" />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.name}</strong> },
                  { key: 'department_name', label: 'Department' },
                  { key: 'resignation_date', label: 'Resigned On', render: (r) => fmtDate(r.resignation_date) },
                  { key: 'lwd', label: 'Last Working Day', render: (r) => fmtDate(r.last_working_day || r.date_of_leaving) },
                  { key: 'reason', label: 'Reason', render: (r) => r.separation_reason || r.leaving_reason || '—' },
                  { key: 'clearance_status', label: 'Clearance', render: (r) => {
                    const s = r.clearance_status;
                    if (!s) return <Badge>Pending</Badge>;
                    const done = s === 'completed' || s === 'cleared';
                    return <Badge tone={done ? 'green' : 'amber'}>{s}</Badge>;
                  } },
                ]}
                rows={separations}
                empty="No separations recorded"
              />
            </div>
          )}

          {/* 5. HEADCOUNT */}
          {active === 'headcount' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="Departments" value={headcount.length} tone="slate" />
                <Stat label="Total Headcount" value={headcount.reduce((s, r) => s + (r.total || 0), 0)} tone="blue" />
                <Stat label="Active" value={headcount.reduce((s, r) => s + (r.active || 0), 0)} tone="green" />
                <Stat label="Permanent" value={headcount.reduce((s, r) => s + (r.permanent || 0), 0)} tone="slate" />
              </div>
              <SectionHead title="Headcount Summary Report" subtitle="Department-wise employment mix" rows={headcount} filename="headcount-summary.csv" />
              <Table
                columns={[
                  { key: 'department', label: 'Department', render: (r) => <strong style={{ color: '#0F172A' }}>{r.department}</strong> },
                  { key: 'total', label: 'Total' },
                  { key: 'active', label: 'Active', render: (r) => <Badge tone="green">{r.active}</Badge> },
                  { key: 'separated', label: 'Separated', render: (r) => <Badge tone="red">{r.separated}</Badge> },
                  { key: 'permanent', label: 'Permanent' },
                  { key: 'contract', label: 'Contract' },
                  { key: 'probation', label: 'Probation' },
                ]}
                rows={headcount}
                empty="No headcount data"
              />
            </div>
          )}

          {/* 6. CONTRACT EXPIRY */}
          {active === 'contract' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label={`Expiring in ${expiryDays} days`} value={contracts.length} tone="amber" />
                <Stat label="Already Expired" value={contracts.filter((c) => c.days_to_expiry != null && c.days_to_expiry < 0).length} tone="red" />
              </div>
              <SectionHead title="Contract Expiry Alert Report" subtitle="Labour / contractor agreements approaching their end date" rows={contracts.map((c) => ({ firm: c.firm_name, work: c.nature_of_work, code: c.contractor_code, start: c.start_date, end: c.end_date, employees: c.emp_count, status: c.status }))} filename="contract-expiry.csv" />
              <Table
                columns={[
                  { key: 'firm_name', label: 'Firm', render: (r) => <strong style={{ color: '#0F172A' }}>{r.firm_name}</strong> },
                  { key: 'nature_of_work', label: 'Nature of Work' },
                  { key: 'contractor_code', label: 'Code' },
                  { key: 'start_date', label: 'Start', render: (r) => fmtDate(r.start_date) },
                  { key: 'end_date', label: 'End', render: (r) => fmtDate(r.end_date) },
                  { key: 'emp_count', label: 'Workers' },
                  { key: 'days_to_expiry', label: 'Expiry', render: (r) => {
                    const dte = r.days_to_expiry;
                    if (dte == null) return <Badge>—</Badge>;
                    if (dte < 0) return <Badge tone="red">Expired {Math.abs(dte)}d ago</Badge>;
                    if (dte <= 30) return <Badge tone="amber">{dte}d left</Badge>;
                    return <Badge tone="green">{dte}d left</Badge>;
                  } },
                ]}
                rows={contracts}
                empty="No contracts expiring in this window. Add contracts under HR → Admin → Contract Details."
              />
            </div>
          )}

          {/* 7. TRANSFERS */}
          {active === 'transfer' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="Transfer / Movement Events" value={transfers.length} tone="blue" />
              </div>
              <SectionHead title="Employee Transfer Report" subtitle="Transfers, department changes, promotions and location moves" rows={transfers.map((t) => ({ code: t.employee_code, name: t.employee_name, event: t.event_type, title: t.title, detail: t.description, date: t.event_date }))} filename="employee-transfers.csv" />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'employee_name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.employee_name}</strong> },
                  { key: 'event_type', label: 'Event', render: (r) => <Badge tone="blue">{r.event_type}</Badge> },
                  { key: 'title', label: 'Description' },
                  { key: 'description', label: 'Detail', render: (r) => r.description || '—' },
                  { key: 'event_date', label: 'Date', render: (r) => fmtDate(r.event_date) },
                ]}
                rows={transfers}
                empty="No transfer / movement records found"
              />
            </div>
          )}

          {/* 8. DOCUMENT CHECKLIST */}
          {active === 'documents' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <Stat label="Employees" value={docs.length} tone="slate" />
                <Stat label="Fully Complete" value={docs.filter((e) => e.complete).length} tone="green" />
                <Stat label="Missing Documents" value={docs.filter((e) => !e.complete).length} tone="red" />
              </div>
              <SectionHead title="Employee Document Checklist Report" subtitle={`Required: ${requiredDocs.join(', ')}`} rows={docs.map((e) => ({ code: e.employee_code, name: e.name, department: e.department_name, present: e.present_count, missing: (e.missing || []).join('; '), complete: e.complete ? 'Yes' : 'No' }))} filename="document-checklist.csv" />
              <Table
                columns={[
                  { key: 'employee_code', label: 'Code' },
                  { key: 'name', label: 'Employee', render: (r) => <strong style={{ color: '#0F172A' }}>{r.name}</strong> },
                  { key: 'department_name', label: 'Department' },
                  ...requiredDocs.map((doc) => ({
                    key: doc, label: doc,
                    render: (r) => r.status?.[doc]
                      ? <CheckCircle2 size={16} color="#15803D" />
                      : <XCircle size={16} color="#DC2626" />,
                  })),
                  { key: 'status_overall', label: 'Status', render: (r) => r.complete
                    ? <Badge tone="green">Complete</Badge>
                    : <Badge tone="amber">{r.missing_count} missing</Badge> },
                ]}
                rows={docs}
                empty="No active employees"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const selStyle = { padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#F8FAFC', color: '#374151', outline: 'none', cursor: 'pointer' };
