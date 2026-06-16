import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeIndianRupee, Bell, Briefcase, CalendarCheck, CalendarOff, CheckCircle2,
  FileText, FolderUp, Headphones, Monitor, ShieldCheck, UserRound, Printer, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { essAPI, hrAdvancedAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const label = 'mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition disabled:opacity-50';
const unwrap = (res) => res?.data?.data || [];
const today = () => new Date().toISOString().slice(0, 10);

function Field({ title, children }) {
  return <div><label className={label}>{title}</label>{children}</div>;
}

function Card({ icon: Icon, title, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone] || tones.blue}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide opacity-75">{title}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          {sub && <p className="mt-1 text-xs font-semibold text-slate-600">{sub}</p>}
        </div>
        <div className="rounded-lg bg-white/80 p-2 shadow-sm"><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          {subtitle && <p className="text-xs font-semibold text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Table({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {!rows.length && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm font-bold text-slate-400">{empty}</td></tr>}
          {rows.map((row, idx) => (
            <tr key={row.id || idx} className="hover:bg-slate-50">
              {columns.map((c) => <td key={c.key} className="px-3 py-2 font-semibold text-slate-900">{c.render ? c.render(row) : row[c.key] || '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ summary, notifications, serviceRequests }) {
  const profile = summary?.profile || {};
  const attendance = summary?.attendance || {};
  const leave = summary?.leave || {};
  const payroll = summary?.payroll || {};
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card icon={CalendarCheck} title="Present" value={attendance.present || 0} sub="This month" tone="green" />
        <Card icon={CalendarOff} title="Leave Pending" value={leave.pending || 0} sub="Awaiting approval" tone="amber" />
        <Card icon={BadgeIndianRupee} title="Net Pay" value={`Rs ${Number(payroll.net_pay || 0).toLocaleString('en-IN')}`} sub={payroll.month ? `${payroll.month}/${payroll.year}` : 'No payroll'} tone="blue" />
        <Card icon={Bell} title="Unread" value={summary?.notifications?.unread || 0} sub="Notifications" tone="slate" />
        <Card icon={Headphones} title="HR Requests" value={serviceRequests.filter((r) => ['open', 'in_progress'].includes(r.status)).length} sub="Open / progress" tone="amber" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="My Profile" subtitle="Employee master snapshot" icon={UserRound}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Name', profile.name], ['Code', profile.employee_code], ['Email', profile.email],
              ['Department', profile.department_name], ['Designation', profile.designation_name],
              ['Location', profile.work_location], ['Joining Date', String(profile.date_of_joining || '').slice(0, 10)],
              ['Status', profile.employment_status],
            ].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">{k}</p><p className="mt-1 text-sm font-black text-slate-950">{v || '-'}</p></div>)}
          </div>
        </Panel>
        <Panel title="Notifications" subtitle="Latest ESS and HR alerts" icon={Bell}>
          <Table columns={[
            { key: 'title', label: 'Title' }, { key: 'body', label: 'Details' },
            { key: 'type', label: 'Type' }, { key: 'created_at', label: 'Date', render: (r) => String(r.created_at || '').slice(0, 10) },
          ]} rows={notifications} />
        </Panel>
      </div>
    </div>
  );
}

function AttendanceLeave({ leaveTypes }) {
  const qc = useQueryClient();
  const [correction, setCorrection] = useState({ attendance_date: today(), requested_status: 'present', requested_in_time: '09:30', requested_out_time: '18:00', reason: '' });
  const [leave, setLeave] = useState({ leave_type_id: '', from_date: today(), to_date: today(), reason: '' });
  const attendance = useQuery({ queryKey: ['ess-attendance'], queryFn: () => essAPI.attendance().then(unwrap) });
  const corrections = useQuery({ queryKey: ['ess-corrections'], queryFn: () => essAPI.attendanceCorrections().then(unwrap) });
  const balances = useQuery({ queryKey: ['ess-leave-balances'], queryFn: () => essAPI.leaveBalances().then(unwrap) });
  const requests = useQuery({ queryKey: ['ess-leave-requests'], queryFn: () => essAPI.leaveRequests().then(unwrap) });
  const refresh = () => ['ess-attendance', 'ess-corrections', 'ess-leave-balances', 'ess-leave-requests', 'ess-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const createCorrection = useMutation({ mutationFn: essAPI.createCorrection, onSuccess: () => { toast.success('Correction requested'); setCorrection({ ...correction, reason: '' }); refresh(); } });
  const createLeave = useMutation({ mutationFn: essAPI.createLeaveRequest, onSuccess: () => { toast.success('Leave requested'); setLeave({ ...leave, reason: '' }); refresh(); } });
  const cancelLeave = useMutation({ mutationFn: essAPI.cancelLeaveRequest, onSuccess: refresh });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-5">
        <Panel title="Attendance Correction" subtitle="Missed punch or wrong status correction" icon={CalendarCheck}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field title="Date"><input type="date" className={input} value={correction.attendance_date} onChange={(e) => setCorrection({ ...correction, attendance_date: e.target.value })} /></Field>
            <Field title="Status"><select className={input} value={correction.requested_status} onChange={(e) => setCorrection({ ...correction, requested_status: e.target.value })}><option value="present">Present</option><option value="half_day">Half Day</option><option value="leave">Leave</option><option value="absent">Absent</option></select></Field>
            <Field title="In Time"><input type="time" className={input} value={correction.requested_in_time} onChange={(e) => setCorrection({ ...correction, requested_in_time: e.target.value })} /></Field>
            <Field title="Out Time"><input type="time" className={input} value={correction.requested_out_time} onChange={(e) => setCorrection({ ...correction, requested_out_time: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field title="Reason"><input className={input} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} /></Field></div>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!correction.reason} onClick={() => createCorrection.mutate(correction)}>Submit Correction</button>
        </Panel>
        <Panel title="Apply Leave" subtitle="Leave application with balance validation" icon={CalendarOff}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field title="Leave Type"><select className={input} value={leave.leave_type_id} onChange={(e) => setLeave({ ...leave, leave_type_id: e.target.value })}><option value="">Select</option>{leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field title="From"><input type="date" className={input} value={leave.from_date} onChange={(e) => setLeave({ ...leave, from_date: e.target.value })} /></Field>
            <Field title="To"><input type="date" className={input} value={leave.to_date} onChange={(e) => setLeave({ ...leave, to_date: e.target.value })} /></Field>
            <Field title="Reason"><input className={input} value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} /></Field>
          </div>
          <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!leave.leave_type_id} onClick={() => createLeave.mutate(leave)}>Apply Leave</button>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel title="Leave Balances" subtitle="Current year balance" icon={ShieldCheck}>
          <Table columns={[{ key: 'leave_type_name', label: 'Type' }, { key: 'accrued', label: 'Accrued' }, { key: 'taken', label: 'Taken' }, { key: 'closing_balance', label: 'Balance' }]} rows={balances.data || []} />
        </Panel>
        <Panel title="Leave Requests" subtitle="My leave application history" icon={CalendarOff}>
          <Table columns={[
            { key: 'leave_type_name', label: 'Type' }, { key: 'from_date', label: 'From', render: (r) => String(r.from_date || '').slice(0, 10) },
            { key: 'to_date', label: 'To', render: (r) => String(r.to_date || '').slice(0, 10) }, { key: 'days', label: 'Days' },
            { key: 'status', label: 'Status' }, { key: 'actions', label: 'Action', render: (r) => r.status === 'pending' ? <button className="rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-700" onClick={() => cancelLeave.mutate(r.id)}>Cancel</button> : '-' },
          ]} rows={requests.data || []} />
        </Panel>
        <Panel title="Attendance Register" subtitle="My monthly attendance" icon={CalendarCheck}>
          <Table columns={[{ key: 'attendance_date', label: 'Date', render: (r) => String(r.attendance_date || '').slice(0, 10) }, { key: 'status', label: 'Status' }, { key: 'in_time', label: 'In' }, { key: 'out_time', label: 'Out' }, { key: 'late_minutes', label: 'Late' }]} rows={attendance.data || []} />
        </Panel>
        <Panel title="Correction Requests" subtitle="My correction history" icon={CheckCircle2}>
          <Table columns={[{ key: 'attendance_date', label: 'Date', render: (r) => String(r.attendance_date || '').slice(0, 10) }, { key: 'requested_status', label: 'Requested' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }]} rows={corrections.data || []} />
        </Panel>
      </div>
    </div>
  );
}

function PayslipsDocuments({ policies, userId }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [doc, setDoc] = useState({ file: null, doc_type: 'employee_document', doc_name: '' });
  const payslips = useQuery({ queryKey: ['ess-payslips'], queryFn: () => essAPI.payslips().then(unwrap) });
  const documents = useQuery({ queryKey: ['ess-documents'], queryFn: () => essAPI.documents().then(unwrap) });
  const acks = useQuery({
    queryKey: ['ess-policy-acks', userId],
    queryFn: () => hrAdvancedAPI.listPolicyAcks({ user_id: userId }).then(unwrap),
    enabled: Boolean(userId),
  });
  const upload = useMutation({
    mutationFn: () => essAPI.uploadDocument(doc.file, { doc_type: doc.doc_type, doc_name: doc.doc_name }),
    onSuccess: () => { toast.success('Document uploaded'); setDoc({ file: null, doc_type: 'employee_document', doc_name: '' }); qc.invalidateQueries({ queryKey: ['ess-documents'] }); },
  });
  const acknowledge = useMutation({
    mutationFn: (id) => hrAdvancedAPI.acknowledgePolicy(id, {}),
    onSuccess: () => { toast.success('Policy acknowledged'); qc.invalidateQueries({ queryKey: ['ess-policy-acks'] }); },
  });
  const acked = new Set((acks.data || []).map((a) => a.policy_id));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Payslips" subtitle="Approved and paid payslips — click Print to download" icon={BadgeIndianRupee}>
        <Table columns={[
          { key: 'month', label: 'Month' },
          { key: 'year', label: 'Year' },
          { key: 'gross_earnings', label: 'Gross', render: (r) => `Rs ${Number(r.gross_earnings || 0).toLocaleString('en-IN')}` },
          { key: 'total_deductions', label: 'Deductions', render: (r) => `Rs ${Number(r.total_deductions || 0).toLocaleString('en-IN')}` },
          { key: 'net_pay', label: 'Net Pay', render: (r) => <span className="font-black text-emerald-700">Rs {Number(r.net_pay || 0).toLocaleString('en-IN')}</span> },
          { key: 'status', label: 'Status', render: (r) => {
            const cfg = { paid: 'bg-emerald-50 text-emerald-700', approved: 'bg-blue-50 text-blue-700', draft: 'bg-amber-50 text-amber-700' };
            return <span className={`rounded px-2 py-0.5 text-[11px] font-black ${cfg[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>;
          }},
          { key: 'actions', label: 'Payslip', render: (r) => (
            <button
              onClick={() => navigate(`/hr-admin/payroll/${r.id}/payslip`)}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1 text-xs font-black text-white hover:bg-blue-800 transition"
            >
              <Printer className="h-3 w-3" /> Print
            </button>
          )},
        ]} rows={payslips.data || []} />
      </Panel>
      <Panel title="Document Upload" subtitle="Upload profile and HR documents" icon={FolderUp}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Document Type"><select className={input} value={doc.doc_type} onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}><option value="employee_document">Employee Document</option><option value="id_proof">ID Proof</option><option value="address_proof">Address Proof</option><option value="certificate">Certificate</option></select></Field>
          <Field title="Document Name"><input className={input} value={doc.doc_name} onChange={(e) => setDoc({ ...doc, doc_name: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field title="File"><input type="file" className={input} onChange={(e) => setDoc({ ...doc, file: e.target.files?.[0] || null })} /></Field></div>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!doc.file} onClick={() => upload.mutate()}>Upload Document</button>
        <div className="mt-5">
          <Table columns={[{ key: 'doc_type', label: 'Type' }, { key: 'doc_name', label: 'Name' }, { key: 'uploaded_at', label: 'Uploaded', render: (r) => String(r.uploaded_at || '').slice(0, 10) }]} rows={documents.data || []} />
        </div>
      </Panel>
      <div className="xl:col-span-2">
        <Panel title="Policy Acknowledgement" subtitle="Read and acknowledge published company policies" icon={FileText}>
          <Table columns={[
            { key: 'title', label: 'Policy' }, { key: 'category', label: 'Category' }, { key: 'version', label: 'Version' },
            { key: 'effective_date', label: 'Effective', render: (r) => String(r.effective_date || '').slice(0, 10) },
            { key: 'actions', label: 'Status', render: (r) => acked.has(r.id) ? <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Acknowledged</span> : <button className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" onClick={() => acknowledge.mutate(r.id)}>Acknowledge</button> },
          ]} rows={policies} />
        </Panel>
      </div>
    </div>
  );
}

function ServiceAssets({ serviceRequests }) {
  const qc = useQueryClient();
  const [reqForm, setReqForm] = useState({ request_type: 'certificate', priority: 'normal', subject: '', description: '' });
  const [assetCode, setAssetCode] = useState('');
  const [asset, setAsset] = useState(null);
  const createRequest = useMutation({
    mutationFn: () => hrAdvancedAPI.createServiceRequest(reqForm),
    onSuccess: () => { toast.success('HR request created'); setReqForm({ request_type: 'certificate', priority: 'normal', subject: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-hr-requests'] }); },
  });
  const lookup = useMutation({
    mutationFn: () => essAPI.assetLookup(assetCode),
    onSuccess: (r) => setAsset(r.data.data),
    onError: (e) => toast.error(e?.response?.data?.error || 'Asset not found'),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Raise HR Request" subtitle="Certificates, payroll query, correction, document support" icon={Headphones}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Type"><select className={input} value={reqForm.request_type} onChange={(e) => setReqForm({ ...reqForm, request_type: e.target.value })}><option value="certificate">Certificate / Letter</option><option value="payroll">Payroll Query</option><option value="attendance">Attendance Issue</option><option value="leave">Leave Query</option><option value="documents">Document Correction</option><option value="general">General</option></select></Field>
          <Field title="Priority"><select className={input} value={reqForm.priority} onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
          <Field title="Subject"><input className={input} value={reqForm.subject} onChange={(e) => setReqForm({ ...reqForm, subject: e.target.value })} /></Field>
          <Field title="Description"><input className={input} value={reqForm.description} onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} /></Field>
        </div>
        <button className={`${btn} mt-4 bg-blue-700 text-white`} disabled={!reqForm.subject} onClick={() => createRequest.mutate()}>Create Request</button>
        <div className="mt-5">
          <Table columns={[{ key: 'request_no', label: 'Req No.' }, { key: 'request_type', label: 'Type' }, { key: 'subject', label: 'Subject' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }]} rows={serviceRequests} />
        </div>
      </Panel>
      <Panel title="Asset QR Lookup" subtitle="Scan or enter asset code to view assigned asset" icon={Monitor}>
        <div className="flex gap-2">
          <input className={input} value={assetCode} onChange={(e) => setAssetCode(e.target.value)} placeholder="BCIM-IT-LT-001 / asset serial" />
          <button className={`${btn} bg-blue-700 text-white`} disabled={!assetCode} onClick={() => lookup.mutate()}>Lookup</button>
        </div>
        {asset && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ['Asset Code', asset.asset_code], ['Name', asset.asset_name], ['Type', asset.asset_type],
              ['Status', asset.status], ['Serial', asset.serial_number], ['Project', asset.project_name],
              ['Book Value', `Rs ${Number(asset.book_value || 0).toLocaleString('en-IN')}`],
            ].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">{k}</p><p className="mt-1 text-sm font-black text-slate-950">{v || '-'}</p></div>)}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ManagerDesk() {
  const qc = useQueryClient();
  const leaves = useQuery({ queryKey: ['ess-manager-leaves'], queryFn: () => essAPI.managerLeaveRequests({ status: 'pending' }).then(unwrap), retry: false });
  const corrections = useQuery({ queryKey: ['ess-manager-corrections'], queryFn: () => essAPI.managerCorrections({ status: 'pending' }).then(unwrap), retry: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ess-manager-leaves'] }); qc.invalidateQueries({ queryKey: ['ess-manager-corrections'] }); };
  const leaveAction = useMutation({ mutationFn: ({ id, action }) => essAPI.managerLeaveAction(id, action), onSuccess: refresh });
  const correctionAction = useMutation({ mutationFn: ({ id, action }) => essAPI.managerCorrectionAction(id, action), onSuccess: refresh });
  if (leaves.error?.response?.status === 403 && corrections.error?.response?.status === 403) {
    return <Panel title="Manager Desk" subtitle="Approval access not enabled for your role" icon={Briefcase}><p className="text-sm font-bold text-slate-500">No manager approvals are available for this login.</p></Panel>;
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Leave Approvals" subtitle="Pending team leave requests" icon={CalendarOff}>
        <Table columns={[
          { key: 'employee_name', label: 'Employee' }, { key: 'leave_type_name', label: 'Type' },
          { key: 'from_date', label: 'From', render: (r) => String(r.from_date || '').slice(0, 10) }, { key: 'to_date', label: 'To', render: (r) => String(r.to_date || '').slice(0, 10) },
          { key: 'days', label: 'Days' }, { key: 'actions', label: 'Action', render: (r) => <div className="flex gap-2"><button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => leaveAction.mutate({ id: r.id, action: 'approve' })}>Approve</button><button className="rounded bg-rose-50 px-2 py-1 text-xs font-black text-rose-700" onClick={() => leaveAction.mutate({ id: r.id, action: 'reject' })}>Reject</button></div> },
        ]} rows={leaves.data || []} />
      </Panel>
      <Panel title="Attendance Corrections" subtitle="Pending attendance corrections" icon={CalendarCheck}>
        <Table columns={[
          { key: 'employee_name', label: 'Employee' }, { key: 'attendance_date', label: 'Date', render: (r) => String(r.attendance_date || '').slice(0, 10) },
          { key: 'requested_status', label: 'Status' }, { key: 'reason', label: 'Reason' },
          { key: 'actions', label: 'Action', render: (r) => <div className="flex gap-2"><button className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" onClick={() => correctionAction.mutate({ id: r.id, action: 'approve' })}>Approve</button><button className="rounded bg-rose-50 px-2 py-1 text-xs font-black text-rose-700" onClick={() => correctionAction.mutate({ id: r.id, action: 'reject' })}>Reject</button></div> },
        ]} rows={corrections.data || []} />
      </Panel>
    </div>
  );
}

export default function ESSPortalPage() {
  const now = new Date();
  const [active, setActive] = useState('overview');
  const summary = useQuery({ queryKey: ['ess-summary'], queryFn: () => essAPI.summary({ month: now.getMonth() + 1, year: now.getFullYear() }).then((r) => r.data.data) });
  const userId = summary.data?.profile?.id;
  const notifications = useQuery({ queryKey: ['ess-notifications'], queryFn: () => essAPI.notifications().then(unwrap) });
  const serviceRequests = useQuery({
    queryKey: ['ess-hr-requests', userId],
    queryFn: () => hrAdvancedAPI.listServiceRequests({ user_id: userId }).then(unwrap),
    enabled: Boolean(userId),
  });
  const policies = useQuery({ queryKey: ['ess-policies'], queryFn: () => hrAdvancedAPI.listPolicies({ status: 'published' }).then(unwrap) });
  const leaveTypes = useMemo(() => [], []);
  const balances = useQuery({ queryKey: ['ess-leave-balances-bootstrap'], queryFn: () => essAPI.leaveBalances().then(unwrap) });
  const derivedLeaveTypes = useMemo(() => (balances.data || []).map((b) => ({ id: b.leave_type_id, name: b.leave_type_name })), [balances.data]);
  const tabs = [
    { id: 'overview', label: 'Overview', icon: UserRound },
    { id: 'attendance', label: 'Attendance & Leave', icon: CalendarCheck },
    { id: 'documents', label: 'Payslips & Documents', icon: FolderUp },
    { id: 'service', label: 'Service & Assets', icon: Headphones },
    { id: 'manager', label: 'Manager Desk', icon: Briefcase },
  ];
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-blue-900 bg-[#0A1F5C] px-6 py-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200">Employee Self Service</p>
        <h1 className="mt-1 text-2xl font-black">ESS Portal</h1>
        <p className="mt-1 text-sm font-semibold text-blue-100">Attendance, leave, payslips, documents, policy acknowledgement, HR requests and manager approvals.</p>
      </div>
      <div className="px-6 py-5">
        <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((t) => {
            const Icon = t.icon;
            const selected = active === t.id;
            return <button key={t.id} onClick={() => setActive(t.id)} className={`${btn} ${selected ? 'bg-blue-700 text-white shadow' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{t.label}</button>;
          })}
        </div>
        {active === 'overview' && <Overview summary={summary.data || {}} notifications={notifications.data || []} serviceRequests={serviceRequests.data || []} />}
        {active === 'attendance' && <AttendanceLeave leaveTypes={derivedLeaveTypes.length ? derivedLeaveTypes : leaveTypes} />}
        {active === 'documents' && <PayslipsDocuments policies={policies.data || []} userId={userId} />}
        {active === 'service' && <ServiceAssets serviceRequests={serviceRequests.data || []} />}
        {active === 'manager' && <ManagerDesk />}
      </div>
    </div>
  );
}
