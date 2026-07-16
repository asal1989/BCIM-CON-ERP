// src/pages/hr-admin/HRAdvancedPage.jsx
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Briefcase, CalendarCheck, CheckCircle2, Clock3, FileCheck2, FileText,
  Headphones, IndianRupee, Plus, RefreshCw, ShieldCheck, Users, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hrAdvancedAPI, hrEmployeesAPI, hrMastersAPI } from '../../api/client';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const label = 'mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition disabled:opacity-50';

const tabs = [
  { id: 'recruitment', label: 'Recruitment', icon: Briefcase },
  { id: 'roster', label: 'Shifts / Roster', icon: CalendarCheck },
  { id: 'regularization', label: 'Regularization', icon: CheckCircle2 },
  { id: 'leave', label: 'Leave Automation', icon: Clock3 },
  { id: 'compliance', label: 'Payroll Compliance', icon: ShieldCheck },
  { id: 'training', label: 'Training', icon: FileCheck2 },
  { id: 'performance', label: 'Performance', icon: CheckCircle2 },
  { id: 'cases', label: 'Cases', icon: XCircle },
  { id: 'exit', label: 'Exit Clearance', icon: Users },
  { id: 'letters', label: 'Letters', icon: FileText },
  { id: 'policies', label: 'Policies', icon: BookOpen },
  { id: 'service', label: 'Service Desk', icon: Headphones },
  { id: 'analytics', label: 'HR Analytics', icon: IndianRupee },
];

const unwrap = (res) => res?.data?.data || [];
const today = () => new Date().toISOString().slice(0, 10);

function Field({ label: text, children }) {
  return <div><label className={label}>{text}</label>{children}</div>;
}

function Panel({ title, subtitle, icon: Icon, children, action }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950">{title}</h2>
            {subtitle && <p className="text-xs font-semibold text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function DataTable({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm font-bold text-slate-400">{empty}</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {columns.map((c) => <td key={c.key} className="px-3 py-2 font-semibold text-slate-900">{c.render ? c.render(row) : row[c.key] || '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecruitmentTab({ employees, departments, designations }) {
  const qc = useQueryClient();
  const [job, setJob] = useState({ title: '', job_code: '', department_id: '', designation_id: '', location: '', vacancies: 1 });
  const [candidate, setCandidate] = useState({ name: '', phone: '', email: '', job_id: '', experience_years: 0, expected_ctc: 0 });
  const [interview, setInterview] = useState({ candidate_id: '', interview_date: '', interviewer_id: '', interview_round: 'Round 1', mode: 'in-person' });
  const [offer, setOffer] = useState({ candidate_id: '', offered_ctc: 0, joining_date: '' });

  const jobs = useQuery({ queryKey: ['hr-advanced-jobs'], queryFn: () => hrAdvancedAPI.listJobs().then(unwrap) });
  const candidates = useQuery({ queryKey: ['hr-advanced-candidates'], queryFn: () => hrAdvancedAPI.listCandidates().then(unwrap) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-advanced-jobs'] }); qc.invalidateQueries({ queryKey: ['hr-advanced-candidates'] }); };
  const saveJob = useMutation({ mutationFn: hrAdvancedAPI.createJob, onSuccess: () => { toast.success('Job opening created'); setJob({ title: '', job_code: '', department_id: '', designation_id: '', location: '', vacancies: 1 }); refresh(); } });
  const saveCandidate = useMutation({ mutationFn: hrAdvancedAPI.createCandidate, onSuccess: () => { toast.success('Candidate added'); setCandidate({ name: '', phone: '', email: '', job_id: '', experience_years: 0, expected_ctc: 0 }); refresh(); } });
  const schedule = useMutation({ mutationFn: () => hrAdvancedAPI.scheduleInterview(interview.candidate_id, interview), onSuccess: () => { toast.success('Interview scheduled'); setInterview({ candidate_id: '', interview_date: '', interviewer_id: '', interview_round: 'Round 1', mode: 'in-person' }); refresh(); } });
  const createOffer = useMutation({ mutationFn: () => hrAdvancedAPI.createOffer(offer.candidate_id, offer), onSuccess: () => { toast.success('Offer recorded'); setOffer({ candidate_id: '', offered_ctc: 0, joining_date: '' }); refresh(); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }) => hrAdvancedAPI.updateCandidate(id, { status }), onSuccess: refresh });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <Panel title="Create Job Opening" subtitle="Hiring request, vacancy and department mapping" icon={Briefcase}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job Title"><input className={input} value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} /></Field>
            <Field label="Job Code"><input className={input} value={job.job_code} onChange={(e) => setJob({ ...job, job_code: e.target.value })} /></Field>
            <Field label="Department"><select className={input} value={job.department_id} onChange={(e) => setJob({ ...job, department_id: e.target.value })}><option value="">Select</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Designation"><select className={input} value={job.designation_id} onChange={(e) => setJob({ ...job, designation_id: e.target.value })}><option value="">Select</option>{designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Location"><input className={input} value={job.location} onChange={(e) => setJob({ ...job, location: e.target.value })} /></Field>
            <Field label="Vacancies"><input type="number" className={input} value={job.vacancies} onChange={(e) => setJob({ ...job, vacancies: e.target.value })} /></Field>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white hover:bg-blue-800`} disabled={!job.title} onClick={() => saveJob.mutate(job)}><Plus className="h-4 w-4" />Create Job</button>
        </Panel>
        <Panel title="Candidate Pipeline" subtitle="Add candidate, schedule interview, issue offer" icon={Users}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Candidate Name"><input className={input} value={candidate.name} onChange={(e) => setCandidate({ ...candidate, name: e.target.value })} /></Field>
            <Field label="Phone"><input className={input} value={candidate.phone} onChange={(e) => setCandidate({ ...candidate, phone: e.target.value })} /></Field>
            <Field label="Email"><input className={input} value={candidate.email} onChange={(e) => setCandidate({ ...candidate, email: e.target.value })} /></Field>
            <Field label="Job"><select className={input} value={candidate.job_id} onChange={(e) => setCandidate({ ...candidate, job_id: e.target.value })}><option value="">Walk-in / General</option>{(jobs.data || []).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
            <Field label="Experience"><input type="number" className={input} value={candidate.experience_years} onChange={(e) => setCandidate({ ...candidate, experience_years: e.target.value })} /></Field>
            <Field label="Expected CTC"><input type="number" className={input} value={candidate.expected_ctc} onChange={(e) => setCandidate({ ...candidate, expected_ctc: e.target.value })} /></Field>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white hover:bg-blue-800`} disabled={!candidate.name} onClick={() => saveCandidate.mutate(candidate)}><Plus className="h-4 w-4" />Add Candidate</button>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel title="Open Jobs" subtitle={`${jobs.data?.length || 0} openings`} icon={Briefcase}>
          <DataTable columns={[
            { key: 'title', label: 'Job' }, { key: 'department_name', label: 'Department' },
            { key: 'vacancies', label: 'Vacancies' }, { key: 'status', label: 'Status' },
          ]} rows={jobs.data || []} />
        </Panel>
        <Panel title="Candidate Register" subtitle="Interview, shortlist, offer and hire tracking" icon={Users}>
          <DataTable columns={[
            { key: 'name', label: 'Candidate' }, { key: 'job_title', label: 'Job' }, { key: 'phone', label: 'Phone' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: 'Actions', render: (r) => (
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => setStatus.mutate({ id: r.id, status: 'shortlisted' })}>Shortlist</button>
                <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => setInterview((p) => ({ ...p, candidate_id: r.id }))}>Interview</button>
                <button className="rounded bg-amber-50 px-2 py-1 text-xs font-black text-amber-700" onClick={() => setOffer((p) => ({ ...p, candidate_id: r.id }))}>Offer</button>
              </div>
            ) },
          ]} rows={candidates.data || []} />
          <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Interview Candidate"><select className={input} value={interview.candidate_id} onChange={(e) => setInterview({ ...interview, candidate_id: e.target.value })}><option value="">Select</option>{(candidates.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Date / Time"><input type="datetime-local" className={input} value={interview.interview_date} onChange={(e) => setInterview({ ...interview, interview_date: e.target.value })} /></Field>
            <Field label="Interviewer"><select className={input} value={interview.interviewer_id} onChange={(e) => setInterview({ ...interview, interviewer_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="Round"><input className={input} value={interview.interview_round} onChange={(e) => setInterview({ ...interview, interview_round: e.target.value })} /></Field>
            <button className={`${btn} bg-slate-900 text-white`} disabled={!interview.candidate_id} onClick={() => schedule.mutate()}>Schedule Interview</button>
          </div>
          <div className="mt-3 grid gap-3 rounded-lg bg-blue-50 p-3 sm:grid-cols-3">
            <Field label="Offer Candidate"><select className={input} value={offer.candidate_id} onChange={(e) => setOffer({ ...offer, candidate_id: e.target.value })}><option value="">Select</option>{(candidates.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Offered CTC"><input type="number" className={input} value={offer.offered_ctc} onChange={(e) => setOffer({ ...offer, offered_ctc: e.target.value })} /></Field>
            <Field label="Joining Date"><input type="date" className={input} value={offer.joining_date} onChange={(e) => setOffer({ ...offer, joining_date: e.target.value })} /></Field>
            <button className={`${btn} bg-blue-700 text-white`} disabled={!offer.candidate_id} onClick={() => createOffer.mutate()}>Record Offer</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RosterTab({ employees }) {
  const qc = useQueryClient();
  const [shift, setShift] = useState({ shift_code: '', name: '', start_time: '09:30', end_time: '18:00', grace_minutes: 10, weekly_offs: 'Sunday' });
  const [roster, setRoster] = useState({ user_id: '', shift_id: '', roster_date: today(), remarks: '' });
  const shifts = useQuery({ queryKey: ['hr-advanced-shifts'], queryFn: () => hrAdvancedAPI.listShifts().then(unwrap) });
  const rosters = useQuery({ queryKey: ['hr-advanced-rosters'], queryFn: () => hrAdvancedAPI.listRosters({ month: new Date().getMonth() + 1, year: new Date().getFullYear() }).then(unwrap) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-advanced-shifts'] }); qc.invalidateQueries({ queryKey: ['hr-advanced-rosters'] }); };
  const saveShift = useMutation({ mutationFn: hrAdvancedAPI.createShift, onSuccess: () => { toast.success('Shift created'); setShift({ shift_code: '', name: '', start_time: '09:30', end_time: '18:00', grace_minutes: 10, weekly_offs: 'Sunday' }); refresh(); } });
  const saveRoster = useMutation({ mutationFn: hrAdvancedAPI.createRoster, onSuccess: () => { toast.success('Roster assigned'); refresh(); } });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.2fr]">
      <Panel title="Shift Master" subtitle="Office, site and security shift configuration" icon={Clock3}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shift Code"><input className={input} value={shift.shift_code} onChange={(e) => setShift({ ...shift, shift_code: e.target.value })} /></Field>
          <Field label="Shift Name"><input className={input} value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} /></Field>
          <Field label="Start Time"><input type="time" className={input} value={shift.start_time} onChange={(e) => setShift({ ...shift, start_time: e.target.value })} /></Field>
          <Field label="End Time"><input type="time" className={input} value={shift.end_time} onChange={(e) => setShift({ ...shift, end_time: e.target.value })} /></Field>
          <Field label="Grace Minutes"><input type="number" className={input} value={shift.grace_minutes} onChange={(e) => setShift({ ...shift, grace_minutes: e.target.value })} /></Field>
          <Field label="Weekly Offs"><input className={input} value={shift.weekly_offs} onChange={(e) => setShift({ ...shift, weekly_offs: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!shift.name} onClick={() => saveShift.mutate(shift)}><Plus className="h-4 w-4" />Create Shift</button>
        <div className="mt-5">
          <DataTable columns={[{ key: 'shift_code', label: 'Code' }, { key: 'name', label: 'Shift' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' }]} rows={shifts.data || []} />
        </div>
      </Panel>
      <Panel title="Roster Assignment" subtitle="Employee shift allocation by date" icon={CalendarCheck}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Employee"><select className={input} value={roster.user_id} onChange={(e) => setRoster({ ...roster, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Shift"><select className={input} value={roster.shift_id} onChange={(e) => setRoster({ ...roster, shift_id: e.target.value })}><option value="">Select</option>{(shifts.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Date"><input type="date" className={input} value={roster.roster_date} onChange={(e) => setRoster({ ...roster, roster_date: e.target.value })} /></Field>
          <Field label="Remarks"><input className={input} value={roster.remarks} onChange={(e) => setRoster({ ...roster, remarks: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!roster.user_id || !roster.shift_id} onClick={() => saveRoster.mutate(roster)}>Assign Roster</button>
        <div className="mt-5">
          <DataTable columns={[
            { key: 'roster_date', label: 'Date', render: (r) => String(r.roster_date || '').slice(0, 10) },
            { key: 'employee_name', label: 'Employee' }, { key: 'shift_name', label: 'Shift' },
            { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' },
          ]} rows={rosters.data || []} />
        </div>
      </Panel>
    </div>
  );
}

function RegularizationTab({ employees }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ user_id: '', attendance_date: today(), requested_status: 'present', requested_in_time: '09:30', requested_out_time: '18:00', reason: '' });
  const regs = useQuery({ queryKey: ['hr-advanced-regularizations'], queryFn: () => hrAdvancedAPI.listRegularizations().then(unwrap) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-advanced-regularizations'] });
  const create = useMutation({ mutationFn: hrAdvancedAPI.createRegularization, onSuccess: () => { toast.success('Regularization requested'); setForm({ ...form, reason: '' }); refresh(); }, onError: (e) => toast.error(e?.response?.data?.error || 'Failed to submit regularization') });
  const action = useMutation({ mutationFn: ({ id, type }) => hrAdvancedAPI.actionRegularization(id, type), onSuccess: () => { toast.success('Request updated'); refresh(); } });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Attendance Regularization" subtitle="Request correction for missed punch or wrong status" icon={CheckCircle2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee"><select className={input} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">Self / Select Employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Attendance Date"><input type="date" className={input} value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} /></Field>
          <Field label="Status"><select className={input} value={form.requested_status} onChange={(e) => setForm({ ...form, requested_status: e.target.value })}><option value="present">Present</option><option value="late_coming">Late Coming</option><option value="half_day">Half Day</option><option value="absent">Absent</option><option value="leave">Leave</option></select></Field>
          <Field label="In Time"><input type="time" className={input} value={form.requested_in_time} onChange={(e) => setForm({ ...form, requested_in_time: e.target.value })} /></Field>
          <Field label="Out Time"><input type="time" className={input} value={form.requested_out_time} onChange={(e) => setForm({ ...form, requested_out_time: e.target.value })} /></Field>
          <Field label="Reason"><input className={input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!form.attendance_date} onClick={() => create.mutate(form)}>Submit Request</button>
      </Panel>
      <Panel title="Approval Queue" subtitle="Approved requests update attendance automatically" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'attendance_date', label: 'Date', render: (r) => String(r.attendance_date || '').slice(0, 10) },
          { key: 'requested_status', label: 'Requested' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', render: (r) => r.status === 'pending' ? (
            <div className="flex gap-2">
              <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => action.mutate({ id: r.id, type: 'approve' })}>Approve</button>
              <button className="rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-700" onClick={() => action.mutate({ id: r.id, type: 'reject' })}>Reject</button>
            </div>
          ) : '-' },
        ]} rows={regs.data || []} />
      </Panel>
    </div>
  );
}

function LeaveAutomationTab({ leaveTypes }) {
  const qc = useQueryClient();
  const [policy, setPolicy] = useState({ leave_type_id: '', accrual_frequency: 'monthly', accrual_days: 1.5, effective_from: today(), is_active: true });
  const [year, setYear] = useState(new Date().getFullYear());
  const policies = useQuery({ queryKey: ['hr-advanced-leave-policies'], queryFn: () => hrAdvancedAPI.listLeavePolicies().then(unwrap) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-advanced-leave-policies'] });
  const create = useMutation({ mutationFn: hrAdvancedAPI.createLeavePolicy, onSuccess: () => { toast.success('Leave accrual policy saved'); refresh(); } });
  const accrue = useMutation({ mutationFn: () => hrAdvancedAPI.runLeaveAccrual({ year }), onSuccess: (r) => toast.success(`Accrual posted: ${r.data.entries} entries`) });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Accrual Policy" subtitle="Monthly, quarterly, yearly leave credit rules" icon={Clock3}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Leave Type"><select className={input} value={policy.leave_type_id} onChange={(e) => setPolicy({ ...policy, leave_type_id: e.target.value })}><option value="">Select</option>{leaveTypes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Frequency"><select className={input} value={policy.accrual_frequency} onChange={(e) => setPolicy({ ...policy, accrual_frequency: e.target.value })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></Field>
          <Field label="Days To Credit"><input type="number" step="0.5" className={input} value={policy.accrual_days} onChange={(e) => setPolicy({ ...policy, accrual_days: e.target.value })} /></Field>
          <Field label="Effective From"><input type="date" className={input} value={policy.effective_from} onChange={(e) => setPolicy({ ...policy, effective_from: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!policy.leave_type_id} onClick={() => create.mutate(policy)}>Save Policy</button>
        <div className="mt-4 flex items-end gap-3 rounded-lg bg-amber-50 p-3">
          <Field label="Accrual Year"><input type="number" className={input} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <button className={`${btn} bg-amber-500 text-slate-950`} onClick={() => accrue.mutate()}><RefreshCw className="h-4 w-4" />Run Accrual</button>
        </div>
      </Panel>
      <Panel title="Policy Register" subtitle="Active leave automation rules" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'leave_type_name', label: 'Leave Type' }, { key: 'accrual_frequency', label: 'Frequency' },
          { key: 'accrual_days', label: 'Days' }, { key: 'effective_from', label: 'Effective From', render: (r) => String(r.effective_from || '').slice(0, 10) },
        ]} rows={policies.data || []} />
      </Panel>
    </div>
  );
}

function PayrollComplianceTab({ employees }) {
  const qc = useQueryClient();
  const [fy, setFy] = useState(`${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`);
  const settingsQ = useQuery({ queryKey: ['hr-advanced-compliance-settings'], queryFn: () => hrAdvancedAPI.getComplianceSettings().then((r) => r.data.data || {}) });
  const declarations = useQuery({ queryKey: ['hr-advanced-tax-declarations', fy], queryFn: () => hrAdvancedAPI.listTaxDeclarations({ financial_year: fy }).then(unwrap) });
  const [settings, setSettings] = useState({});
  const [declaration, setDeclaration] = useState({ user_id: '', declared_amount: 0, approved_amount: 0, financial_year: fy });
  const actualSettings = useMemo(() => ({ ...settingsQ.data, ...settings }), [settingsQ.data, settings]);
  const saveSettings = useMutation({ mutationFn: hrAdvancedAPI.saveComplianceSettings, onSuccess: () => { toast.success('Compliance settings saved'); qc.invalidateQueries({ queryKey: ['hr-advanced-compliance-settings'] }); } });
  const createDeclaration = useMutation({ mutationFn: hrAdvancedAPI.createTaxDeclaration, onSuccess: () => { toast.success('Tax declaration added'); declarations.refetch(); } });
  const approveDeclaration = useMutation({ mutationFn: ({ id, approved_amount }) => hrAdvancedAPI.updateTaxDeclaration(id, { approved_amount, status: 'approved' }), onSuccess: () => declarations.refetch() });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Compliance Settings" subtitle="PF, ESI, PT and employer statutory details" icon={ShieldCheck}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PF Ceiling"><input type="number" className={input} value={actualSettings.pf_ceiling || 15000} onChange={(e) => setSettings({ ...settings, pf_ceiling: e.target.value })} /></Field>
          <Field label="ESI Ceiling"><input type="number" className={input} value={actualSettings.esi_ceiling || 21000} onChange={(e) => setSettings({ ...settings, esi_ceiling: e.target.value })} /></Field>
          <Field label="PT State"><input className={input} value={actualSettings.pt_state || 'Karnataka'} onChange={(e) => setSettings({ ...settings, pt_state: e.target.value })} /></Field>
          <Field label="TAN Number"><input className={input} value={actualSettings.tan_number || ''} onChange={(e) => setSettings({ ...settings, tan_number: e.target.value })} /></Field>
          <Field label="PF Establishment Code"><input className={input} value={actualSettings.pf_establishment_code || ''} onChange={(e) => setSettings({ ...settings, pf_establishment_code: e.target.value })} /></Field>
          <Field label="ESI Employer Code"><input className={input} value={actualSettings.esi_employer_code || ''} onChange={(e) => setSettings({ ...settings, esi_employer_code: e.target.value })} /></Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {['pf_enabled', 'esi_enabled', 'pt_enabled', 'lwf_enabled'].map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-800">
              <input type="checkbox" checked={actualSettings[key] !== false} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />
              {key.replace('_enabled', '').toUpperCase()}
            </label>
          ))}
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} onClick={() => saveSettings.mutate(actualSettings)}>Save Settings</button>
      </Panel>
      <Panel title="Tax Declarations" subtitle="Employee investment declaration and approval" icon={IndianRupee}>
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          <Field label="Financial Year"><input className={input} value={fy} onChange={(e) => { setFy(e.target.value); setDeclaration({ ...declaration, financial_year: e.target.value }); }} /></Field>
          <Field label="Employee"><select className={input} value={declaration.user_id} onChange={(e) => setDeclaration({ ...declaration, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Declared"><input type="number" className={input} value={declaration.declared_amount} onChange={(e) => setDeclaration({ ...declaration, declared_amount: e.target.value })} /></Field>
          <Field label="Approved"><input type="number" className={input} value={declaration.approved_amount} onChange={(e) => setDeclaration({ ...declaration, approved_amount: e.target.value })} /></Field>
          <button className={`${btn} bg-blue-700 text-white`} disabled={!declaration.user_id} onClick={() => createDeclaration.mutate({ ...declaration, financial_year: fy })}>Add Declaration</button>
        </div>
        <div className="mt-4">
          <DataTable columns={[
            { key: 'employee_name', label: 'Employee' }, { key: 'financial_year', label: 'FY' },
            { key: 'declared_amount', label: 'Declared' }, { key: 'approved_amount', label: 'Approved' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: 'Actions', render: (r) => r.status !== 'approved' ? <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => approveDeclaration.mutate({ id: r.id, approved_amount: r.approved_amount || r.declared_amount })}>Approve</button> : '-' },
          ]} rows={declarations.data || []} />
        </div>
      </Panel>
    </div>
  );
}

function TrainingTab({ employees }) {
  const qc = useQueryClient();
  const [program, setProgram] = useState({ title: '', category: 'Skill', trainer: '', training_date: today(), duration_hours: 2, mode: 'classroom' });
  const [nomination, setNomination] = useState({ program_id: '', user_id: '', attendance_status: 'pending', score: '' });
  const programs = useQuery({ queryKey: ['hr-advanced-training-programs'], queryFn: () => hrAdvancedAPI.listTrainingPrograms().then(unwrap) });
  const nominations = useQuery({ queryKey: ['hr-advanced-training-nominations'], queryFn: () => hrAdvancedAPI.listNominations().then(unwrap) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-advanced-training-programs'] }); qc.invalidateQueries({ queryKey: ['hr-advanced-training-nominations'] }); };
  const createProgram = useMutation({ mutationFn: hrAdvancedAPI.createTrainingProgram, onSuccess: () => { toast.success('Training program created'); setProgram({ title: '', category: 'Skill', trainer: '', training_date: today(), duration_hours: 2, mode: 'classroom' }); refresh(); } });
  const nominate = useMutation({ mutationFn: hrAdvancedAPI.nominateTraining, onSuccess: () => { toast.success('Training nomination saved'); refresh(); } });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Training Program" subtitle="Plan skill, safety and compliance training" icon={FileCheck2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><input className={input} value={program.title} onChange={(e) => setProgram({ ...program, title: e.target.value })} /></Field>
          <Field label="Category"><input className={input} value={program.category} onChange={(e) => setProgram({ ...program, category: e.target.value })} /></Field>
          <Field label="Trainer"><input className={input} value={program.trainer} onChange={(e) => setProgram({ ...program, trainer: e.target.value })} /></Field>
          <Field label="Date"><input type="date" className={input} value={program.training_date} onChange={(e) => setProgram({ ...program, training_date: e.target.value })} /></Field>
          <Field label="Hours"><input type="number" className={input} value={program.duration_hours} onChange={(e) => setProgram({ ...program, duration_hours: e.target.value })} /></Field>
          <Field label="Mode"><select className={input} value={program.mode} onChange={(e) => setProgram({ ...program, mode: e.target.value })}><option value="classroom">Classroom</option><option value="site">Site</option><option value="online">Online</option></select></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!program.title} onClick={() => createProgram.mutate(program)}><Plus className="h-4 w-4" />Create Program</button>
      </Panel>
      <Panel title="Training Register" subtitle="Nominations, attendance and scores" icon={Users}>
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          <Field label="Program"><select className={input} value={nomination.program_id} onChange={(e) => setNomination({ ...nomination, program_id: e.target.value })}><option value="">Select</option>{(programs.data || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Field label="Employee"><select className={input} value={nomination.user_id} onChange={(e) => setNomination({ ...nomination, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Attendance"><select className={input} value={nomination.attendance_status} onChange={(e) => setNomination({ ...nomination, attendance_status: e.target.value })}><option value="pending">Pending</option><option value="attended">Attended</option><option value="absent">Absent</option></select></Field>
          <Field label="Score"><input type="number" className={input} value={nomination.score} onChange={(e) => setNomination({ ...nomination, score: e.target.value })} /></Field>
          <button className={`${btn} bg-blue-700 text-white`} disabled={!nomination.program_id || !nomination.user_id} onClick={() => nominate.mutate(nomination)}>Save Nomination</button>
        </div>
        <div className="mt-4">
          <DataTable columns={[
            { key: 'program_title', label: 'Program' }, { key: 'employee_name', label: 'Employee' },
            { key: 'attendance_status', label: 'Attendance' }, { key: 'score', label: 'Score' },
          ]} rows={nominations.data || []} />
        </div>
      </Panel>
    </div>
  );
}

function PerformanceTab({ employees }) {
  const qc = useQueryClient();
  const [goal, setGoal] = useState({ user_id: '', period: `${new Date().getFullYear()} Q${Math.floor(new Date().getMonth() / 3) + 1}`, goal_title: '', metric: '', target_value: 0, weightage: 10 });
  const goals = useQuery({ queryKey: ['hr-advanced-performance-goals'], queryFn: () => hrAdvancedAPI.listGoals().then(unwrap) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-advanced-performance-goals'] });
  const createGoal = useMutation({ mutationFn: hrAdvancedAPI.createGoal, onSuccess: () => { toast.success('Performance goal created'); setGoal({ ...goal, goal_title: '', metric: '', target_value: 0 }); refresh(); } });
  const closeGoal = useMutation({ mutationFn: ({ id, rating }) => hrAdvancedAPI.updateGoal(id, { status: 'reviewed', rating }), onSuccess: refresh });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Goal Sheet" subtitle="KRA, KPI and rating tracker" icon={CheckCircle2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee"><select className={input} value={goal.user_id} onChange={(e) => setGoal({ ...goal, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Period"><input className={input} value={goal.period} onChange={(e) => setGoal({ ...goal, period: e.target.value })} /></Field>
          <Field label="Goal / KRA"><input className={input} value={goal.goal_title} onChange={(e) => setGoal({ ...goal, goal_title: e.target.value })} /></Field>
          <Field label="Metric"><input className={input} value={goal.metric} onChange={(e) => setGoal({ ...goal, metric: e.target.value })} /></Field>
          <Field label="Target"><input type="number" className={input} value={goal.target_value} onChange={(e) => setGoal({ ...goal, target_value: e.target.value })} /></Field>
          <Field label="Weightage %"><input type="number" className={input} value={goal.weightage} onChange={(e) => setGoal({ ...goal, weightage: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!goal.user_id || !goal.goal_title} onClick={() => createGoal.mutate(goal)}>Create Goal</button>
      </Panel>
      <Panel title="Performance Register" subtitle="Review status and ratings" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'employee_name', label: 'Employee' }, { key: 'period', label: 'Period' }, { key: 'goal_title', label: 'Goal' },
          { key: 'target_value', label: 'Target' }, { key: 'rating', label: 'Rating' },
          { key: 'actions', label: 'Actions', render: (r) => <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => closeGoal.mutate({ id: r.id, rating: r.rating || 4 })}>Mark Reviewed</button> },
        ]} rows={goals.data || []} />
      </Panel>
    </div>
  );
}

function CasesTab({ employees }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ user_id: '', case_type: 'grievance', severity: 'medium', title: '', description: '', assigned_to: '' });
  const cases = useQuery({ queryKey: ['hr-advanced-cases'], queryFn: () => hrAdvancedAPI.listEmployeeCases().then(unwrap) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-advanced-cases'] });
  const create = useMutation({ mutationFn: hrAdvancedAPI.createEmployeeCase, onSuccess: () => { toast.success('HR case created'); setForm({ ...form, title: '', description: '' }); refresh(); } });
  const closeCase = useMutation({ mutationFn: (id) => hrAdvancedAPI.updateEmployeeCase(id, { status: 'closed', action_taken: 'Closed by HR' }), onSuccess: refresh });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Grievance / Disciplinary Case" subtitle="Track HR cases with owner and closure" icon={XCircle}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee"><select className={input} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Type"><select className={input} value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })}><option value="grievance">Grievance</option><option value="disciplinary">Disciplinary</option><option value="warning">Warning</option></select></Field>
          <Field label="Severity"><select className={input} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          <Field label="Assigned To"><select className={input} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Title"><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!form.user_id || !form.title} onClick={() => create.mutate(form)}>Create Case</button>
      </Panel>
      <Panel title="Case Register" subtitle="Open and closed HR matters" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'employee_name', label: 'Employee' }, { key: 'case_type', label: 'Type' }, { key: 'severity', label: 'Severity' },
          { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', render: (r) => r.status !== 'closed' ? <button className="rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-700" onClick={() => closeCase.mutate(r.id)}>Close</button> : '-' },
        ]} rows={cases.data || []} />
      </Panel>
    </div>
  );
}

function ExitTab({ employees }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ user_id: '', resignation_date: today(), last_working_date: '', reason: '', notice_days: 30 });
  const exits = useQuery({ queryKey: ['hr-advanced-exits'], queryFn: () => hrAdvancedAPI.listExits().then(unwrap) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-advanced-exits'] });
  const create = useMutation({ mutationFn: hrAdvancedAPI.createExit, onSuccess: () => { toast.success('Exit case initiated'); refresh(); } });
  const clear = useMutation({ mutationFn: ({ id, field }) => hrAdvancedAPI.updateExit(id, { [field]: 'cleared' }), onSuccess: refresh });
  const close = useMutation({ mutationFn: (id) => hrAdvancedAPI.updateExit(id, { status: 'closed' }), onSuccess: refresh });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Exit / Offboarding" subtitle="Resignation, clearance and final settlement" icon={Users}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee"><select className={input} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Resignation Date"><input type="date" className={input} value={form.resignation_date} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} /></Field>
          <Field label="Last Working Date"><input type="date" className={input} value={form.last_working_date} onChange={(e) => setForm({ ...form, last_working_date: e.target.value })} /></Field>
          <Field label="Notice Days"><input type="number" className={input} value={form.notice_days} onChange={(e) => setForm({ ...form, notice_days: e.target.value })} /></Field>
          <Field label="Reason"><input className={input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!form.user_id} onClick={() => create.mutate(form)}>Initiate Exit</button>
      </Panel>
      <Panel title="Clearance Register" subtitle="Handover, assets, finance and settlement" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'last_working_date', label: 'LWD', render: (r) => String(r.last_working_date || '').slice(0, 10) || '-' },
          { key: 'handover_status', label: 'Handover' }, { key: 'asset_clearance_status', label: 'Assets' },
          { key: 'finance_clearance_status', label: 'Finance' }, { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', render: (r) => (
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => clear.mutate({ id: r.id, field: 'handover_status' })}>Handover</button>
              <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => clear.mutate({ id: r.id, field: 'asset_clearance_status' })}>Assets</button>
              <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => clear.mutate({ id: r.id, field: 'finance_clearance_status' })}>Finance</button>
              <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => close.mutate(r.id)}>Close</button>
            </div>
          ) },
        ]} rows={exits.data || []} />
      </Panel>
    </div>
  );
}

function LettersTab({ employees }) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState({
    template_code: '', title: '', letter_type: 'appointment', body: 'Dear {{employee_name}},\n\nThis letter is issued by BCIM Engineering Pvt Ltd.\n\nRegards,\nHR Department',
  });
  const [issue, setIssue] = useState({ template_id: '', user_id: '', letter_no: '', issue_date: today(), body: '', remarks: '' });
  const templates = useQuery({ queryKey: ['hr-advanced-letter-templates'], queryFn: () => hrAdvancedAPI.listLetterTemplates().then(unwrap) });
  const issues = useQuery({ queryKey: ['hr-advanced-letter-issues'], queryFn: () => hrAdvancedAPI.listLetterIssues().then(unwrap) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-advanced-letter-templates'] });
    qc.invalidateQueries({ queryKey: ['hr-advanced-letter-issues'] });
    qc.invalidateQueries({ queryKey: ['hr-advanced-analytics'] });
  };
  const saveTemplate = useMutation({
    mutationFn: hrAdvancedAPI.createLetterTemplate,
    onSuccess: () => { toast.success('Letter template saved'); setTemplate({ ...template, template_code: '', title: '' }); refresh(); },
  });
  const issueLetter = useMutation({
    mutationFn: hrAdvancedAPI.issueLetter,
    onSuccess: () => { toast.success('Letter issued'); setIssue({ template_id: '', user_id: '', letter_no: '', issue_date: today(), body: '', remarks: '' }); refresh(); },
  });
  const selectedTemplate = (templates.data || []).find((t) => t.id === issue.template_id);
  const selectedEmployee = employees.find((e) => e.id === issue.user_id);
  const resolvedBody = issue.body || (selectedTemplate?.body || '')
    .replaceAll('{{employee_name}}', selectedEmployee?.name || 'Employee')
    .replaceAll('{{employee_code}}', selectedEmployee?.employee_code || '');

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.2fr]">
      <div className="space-y-5">
        <Panel title="Letter Template" subtitle="Appointment, confirmation, warning and experience letter formats" icon={FileText}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Template Code"><input className={input} value={template.template_code} onChange={(e) => setTemplate({ ...template, template_code: e.target.value })} /></Field>
            <Field label="Title"><input className={input} value={template.title} onChange={(e) => setTemplate({ ...template, title: e.target.value })} /></Field>
            <Field label="Letter Type"><select className={input} value={template.letter_type} onChange={(e) => setTemplate({ ...template, letter_type: e.target.value })}><option value="appointment">Appointment</option><option value="confirmation">Confirmation</option><option value="warning">Warning</option><option value="experience">Experience</option><option value="general">General</option></select></Field>
            <Field label="Status"><select className={input} value={template.status || 'active'} onChange={(e) => setTemplate({ ...template, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            <div className="sm:col-span-2"><Field label="Template Body"><textarea rows={7} className={input} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} /></Field></div>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!template.title || !template.body} onClick={() => saveTemplate.mutate(template)}><Plus className="h-4 w-4" />Save Template</button>
        </Panel>
        <Panel title="Issue Letter" subtitle="Generate an employee letter from a template" icon={FileCheck2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee"><select className={input} value={issue.user_id} onChange={(e) => setIssue({ ...issue, user_id: e.target.value })}><option value="">Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="Template"><select className={input} value={issue.template_id} onChange={(e) => setIssue({ ...issue, template_id: e.target.value, body: '' })}><option value="">Manual / Select</option>{(templates.data || []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
            <Field label="Letter No."><input className={input} value={issue.letter_no} onChange={(e) => setIssue({ ...issue, letter_no: e.target.value })} placeholder="Auto if blank" /></Field>
            <Field label="Issue Date"><input type="date" className={input} value={issue.issue_date} onChange={(e) => setIssue({ ...issue, issue_date: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Letter Body"><textarea rows={7} className={input} value={resolvedBody} onChange={(e) => setIssue({ ...issue, body: e.target.value })} /></Field></div>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!issue.user_id || !resolvedBody} onClick={() => issueLetter.mutate({ ...issue, body: resolvedBody })}>Issue Letter</button>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel title="Template Register" subtitle={`${templates.data?.length || 0} templates`} icon={FileText}>
          <DataTable columns={[
            { key: 'template_code', label: 'Code' }, { key: 'title', label: 'Title' },
            { key: 'letter_type', label: 'Type' }, { key: 'status', label: 'Status' },
          ]} rows={templates.data || []} />
        </Panel>
        <Panel title="Issued Letters" subtitle="Employee-wise letter register" icon={FileCheck2}>
          <DataTable columns={[
            { key: 'letter_no', label: 'Letter No.' }, { key: 'employee_name', label: 'Employee' },
            { key: 'template_title', label: 'Template' }, { key: 'issue_date', label: 'Date', render: (r) => String(r.issue_date || '').slice(0, 10) || '-' },
            { key: 'status', label: 'Status' },
          ]} rows={issues.data || []} />
        </Panel>
      </div>
    </div>
  );
}

function PoliciesTab({ employees }) {
  const qc = useQueryClient();
  const [policy, setPolicy] = useState({ policy_code: '', title: '', category: 'HR', version: '1.0', effective_date: today(), body: '' });
  const [ack, setAck] = useState({ policy_id: '', user_id: '', remarks: '' });
  const policies = useQuery({ queryKey: ['hr-advanced-policies'], queryFn: () => hrAdvancedAPI.listPolicies().then(unwrap) });
  const acknowledgements = useQuery({ queryKey: ['hr-advanced-policy-acks'], queryFn: () => hrAdvancedAPI.listPolicyAcks().then(unwrap) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-advanced-policies'] });
    qc.invalidateQueries({ queryKey: ['hr-advanced-policy-acks'] });
    qc.invalidateQueries({ queryKey: ['hr-advanced-analytics'] });
  };
  const savePolicy = useMutation({
    mutationFn: hrAdvancedAPI.createPolicy,
    onSuccess: () => { toast.success('Policy published'); setPolicy({ policy_code: '', title: '', category: 'HR', version: '1.0', effective_date: today(), body: '' }); refresh(); },
  });
  const acknowledge = useMutation({
    mutationFn: () => hrAdvancedAPI.acknowledgePolicy(ack.policy_id, { user_id: ack.user_id, remarks: ack.remarks }),
    onSuccess: () => { toast.success('Acknowledgement recorded'); setAck({ policy_id: '', user_id: '', remarks: '' }); refresh(); },
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.2fr]">
      <div className="space-y-5">
        <Panel title="Publish HR Policy" subtitle="Company policies with version and effective date" icon={BookOpen}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Policy Code"><input className={input} value={policy.policy_code} onChange={(e) => setPolicy({ ...policy, policy_code: e.target.value })} /></Field>
            <Field label="Title"><input className={input} value={policy.title} onChange={(e) => setPolicy({ ...policy, title: e.target.value })} /></Field>
            <Field label="Category"><input className={input} value={policy.category} onChange={(e) => setPolicy({ ...policy, category: e.target.value })} /></Field>
            <Field label="Version"><input className={input} value={policy.version} onChange={(e) => setPolicy({ ...policy, version: e.target.value })} /></Field>
            <Field label="Effective Date"><input type="date" className={input} value={policy.effective_date} onChange={(e) => setPolicy({ ...policy, effective_date: e.target.value })} /></Field>
            <Field label="Status"><select className={input} value={policy.status || 'published'} onChange={(e) => setPolicy({ ...policy, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></Field>
            <div className="sm:col-span-2"><Field label="Policy Content"><textarea rows={8} className={input} value={policy.body} onChange={(e) => setPolicy({ ...policy, body: e.target.value })} /></Field></div>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!policy.title || !policy.body} onClick={() => savePolicy.mutate(policy)}><Plus className="h-4 w-4" />Publish Policy</button>
        </Panel>
        <Panel title="Record Acknowledgement" subtitle="Mark employee confirmation for published policies" icon={CheckCircle2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Policy"><select className={input} value={ack.policy_id} onChange={(e) => setAck({ ...ack, policy_id: e.target.value })}><option value="">Select</option>{(policies.data || []).map((p) => <option key={p.id} value={p.id}>{p.title} v{p.version}</option>)}</select></Field>
            <Field label="Employee"><select className={input} value={ack.user_id} onChange={(e) => setAck({ ...ack, user_id: e.target.value })}><option value="">Self / Select</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Remarks"><input className={input} value={ack.remarks} onChange={(e) => setAck({ ...ack, remarks: e.target.value })} /></Field></div>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!ack.policy_id} onClick={() => acknowledge.mutate()}>Record Acknowledgement</button>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel title="Policy Register" subtitle={`${policies.data?.length || 0} policies`} icon={BookOpen}>
          <DataTable columns={[
            { key: 'policy_code', label: 'Code' }, { key: 'title', label: 'Policy' },
            { key: 'category', label: 'Category' }, { key: 'version', label: 'Version' },
            { key: 'acknowledged_count', label: 'Acknowledged' },
          ]} rows={policies.data || []} />
        </Panel>
        <Panel title="Acknowledgement Register" subtitle="Employee policy confirmations" icon={CheckCircle2}>
          <DataTable columns={[
            { key: 'policy_title', label: 'Policy' }, { key: 'employee_name', label: 'Employee' },
            { key: 'version', label: 'Version' }, { key: 'acknowledged_at', label: 'Acknowledged', render: (r) => String(r.acknowledged_at || '').slice(0, 10) || '-' },
            { key: 'status', label: 'Status' },
          ]} rows={acknowledgements.data || []} />
        </Panel>
      </div>
    </div>
  );
}

function ServiceDeskTab({ employees }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    user_id: '', request_type: 'certificate', priority: 'normal', subject: '', description: '', assigned_to: '',
  });
  const [resolution, setResolution] = useState({});
  const requests = useQuery({ queryKey: ['hr-advanced-service-requests'], queryFn: () => hrAdvancedAPI.listServiceRequests().then(unwrap) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-advanced-service-requests'] });
    qc.invalidateQueries({ queryKey: ['hr-advanced-analytics'] });
  };
  const create = useMutation({
    mutationFn: hrAdvancedAPI.createServiceRequest,
    onSuccess: () => { toast.success('HR request created'); setForm({ user_id: '', request_type: 'certificate', priority: 'normal', subject: '', description: '', assigned_to: '' }); refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ id, data }) => hrAdvancedAPI.updateServiceRequest(id, data),
    onSuccess: () => { toast.success('Request updated'); refresh(); },
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.2fr]">
      <Panel title="Raise HR Request" subtitle="Certificate, payroll, attendance, leave, document and general HR support" icon={Headphones}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee"><select className={input} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}><option value="">Self / Select Employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Request Type"><select className={input} value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}><option value="certificate">Certificate / Letter</option><option value="payroll">Payroll Query</option><option value="attendance">Attendance Issue</option><option value="leave">Leave Query</option><option value="documents">Document Correction</option><option value="general">General</option></select></Field>
          <Field label="Priority"><select className={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
          <Field label="Assign To"><select className={input} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><option value="">Unassigned</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Subject"><input className={input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Description"><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!form.subject} onClick={() => create.mutate(form)}><Plus className="h-4 w-4" />Create Request</button>
      </Panel>
      <Panel title="HR Service Register" subtitle="Track open, in-progress and closed employee requests" icon={FileCheck2}>
        <DataTable columns={[
          { key: 'request_no', label: 'Req No.' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'request_type', label: 'Type' },
          { key: 'priority', label: 'Priority' },
          { key: 'subject', label: 'Subject' },
          { key: 'assigned_to_name', label: 'Owner' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', render: (r) => (
            <div className="flex min-w-[260px] flex-wrap items-center gap-2">
              <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => update.mutate({ id: r.id, data: { status: 'in_progress' } })}>Progress</button>
              <input className="w-28 rounded border border-slate-300 px-2 py-1 text-xs font-bold" placeholder="Resolution" value={resolution[r.id] || ''} onChange={(e) => setResolution({ ...resolution, [r.id]: e.target.value })} />
              <button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => update.mutate({ id: r.id, data: { status: 'closed', resolution: resolution[r.id] || 'Closed by HR' } })}>Close</button>
            </div>
          ) },
        ]} rows={requests.data || []} />
      </Panel>
    </div>
  );
}

function AnalyticsTab() {
  const summary = useQuery({ queryKey: ['hr-advanced-analytics'], queryFn: () => hrAdvancedAPI.analyticsSummary().then((r) => r.data.data) });
  const data = summary.data || {};
  const cards = [
    ['Active Employees', data.employees?.active || 0],
    ['Open Jobs', data.recruitment?.open_jobs || 0],
    ['Pending Corrections', data.attendanceCorrections?.pending || 0],
    ['Planned Training', data.training?.planned || 0],
    ['Open Cases', data.cases?.open_cases || 0],
    ['Active Exits', data.exits?.active_exits || 0],
    ['Goals', data.goals?.goals || 0],
    ['Avg Rating', data.goals?.avg_rating || 0],
    ['Issued Letters', data.letters?.issued_letters || 0],
    ['Published Policies', data.policies?.published_policies || 0],
    ['Policy Acks', data.policies?.acknowledgements || 0],
    ['Open HR Requests', data.serviceRequests?.open_requests || 0],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([name, value]) => (
          <div key={name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{name}</p>
            <p className="mt-2 text-3xl font-black text-blue-700">{value}</p>
          </div>
        ))}
      </div>
      <Panel title="Department Headcount" subtitle="Current active employees by department" icon={Users}>
        <DataTable columns={[{ key: 'department', label: 'Department' }, { key: 'headcount', label: 'Headcount' }]} rows={data.departments || []} />
      </Panel>
    </div>
  );
}

export default function HRAdvancedPage() {
  const [active, setActive] = useState('recruitment');
  const employees = useQuery({ queryKey: ['hr-advanced-employees'], queryFn: () => hrEmployeesAPI.list({ employment_status: 'active' }).then(unwrap) });
  const departments = useQuery({ queryKey: ['hr-advanced-departments'], queryFn: () => hrMastersAPI.listDepts().then(unwrap) });
  const designations = useQuery({ queryKey: ['hr-advanced-designations'], queryFn: () => hrMastersAPI.listDesigs().then(unwrap) });
  const leaveTypes = useQuery({ queryKey: ['hr-advanced-leave-types'], queryFn: () => hrMastersAPI.listLeaveTypes().then(unwrap) });

  const common = {
    employees: employees.data || [],
    departments: departments.data || [],
    designations: designations.data || [],
    leaveTypes: leaveTypes.data || [],
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-blue-900 bg-[#0A1F5C] px-6 py-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200">HR & Admin</p>
        <h1 className="mt-1 text-2xl font-black">Advanced HR Controls</h1>
        <p className="mt-1 text-sm font-semibold text-blue-100">Recruitment, roster, regularization, policies, HR letters, training, performance and compliance.</p>
      </div>
      <div className="px-6 py-5">
        <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((t) => {
            const Icon = t.icon;
            const selected = active === t.id;
            return (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`${btn} ${selected ? 'bg-blue-700 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                <Icon className="h-4 w-4" />{t.label}
              </button>
            );
          })}
        </div>
        {active === 'recruitment' && <RecruitmentTab {...common} />}
        {active === 'roster' && <RosterTab {...common} />}
        {active === 'regularization' && <RegularizationTab {...common} />}
        {active === 'leave' && <LeaveAutomationTab {...common} />}
        {active === 'compliance' && <PayrollComplianceTab {...common} />}
        {active === 'training' && <TrainingTab {...common} />}
        {active === 'performance' && <PerformanceTab {...common} />}
        {active === 'cases' && <CasesTab {...common} />}
        {active === 'exit' && <ExitTab {...common} />}
        {active === 'letters' && <LettersTab {...common} />}
        {active === 'policies' && <PoliciesTab {...common} />}
        {active === 'service' && <ServiceDeskTab {...common} />}
        {active === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}
