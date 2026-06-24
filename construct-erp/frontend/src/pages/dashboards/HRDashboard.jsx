import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Users, UserCheck, CalendarOff, IndianRupee, Clock, Ticket, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import {
  hrEmployeesAPI, hrAttendanceAPI, hrPayrollAPI, hrLeaveAPI, hrShiftsAPI, hrAdvancedAPI,
} from '../../api/client';
import useAuthStore from '../../store/authStore';
import { Theme, PageHeader, KpiCard } from '../../theme';

function ChartCard({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5" style={{ borderColor: Theme.borderSoft }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: Theme.textDark }}>{title}</h3>
        {action}
      </div>
      <div style={{ height: 260 }}>{children}</div>
    </div>
  );
}

function TableCard({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: Theme.borderSoft }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: Theme.borderSoft }}>
        <h3 className="text-sm font-medium" style={{ color: Theme.textDark }}>{title}</h3>
        {action}
      </div>
      <div className="p-4 overflow-x-auto">{children}</div>
    </div>
  );
}

const th = 'px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] text-slate-700 border-t border-slate-50';

function Badge({ label, tone = 'slate' }) {
  const map = {
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger:  'bg-red-50 text-red-600',
    info:    'bg-blue-50 text-blue-700',
    slate:   'bg-slate-100 text-slate-500',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${map[tone] || map.slate}`}>{label}</span>;
}

const EmptyRow = ({ span, text }) => (
  <tr><td colSpan={span} className="text-center text-sm text-slate-400 py-8">{text}</td></tr>
);

const CHART_LINE  = '#3b82f6';
const CHART_BAR_1 = '#1a3a6b';
const CHART_GRID  = '#e2e8f0';
const CHART_TICK  = '#94a3b8';

export default function HRDashboard() {
  const { user } = useAuthStore();
  const month = dayjs().month() + 1;
  const year  = dayjs().year();

  const { data: empData, isLoading: loadE } = useQuery({
    queryKey: ['hr-dash-employees'],
    queryFn: () => hrEmployeesAPI.list({ employment_status: 'active' }).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });
  const employees = Array.isArray(empData) ? empData : [];

  const { data: attData, isLoading: loadA } = useQuery({
    queryKey: ['hr-dash-attendance', month, year],
    queryFn: () => hrAttendanceAPI.summary({ month, year }).then(r => r.data?.data ?? r.data ?? []),
  });
  const attRows = Array.isArray(attData) ? attData : [];
  const presentTotal = attRows.reduce((s, r) => s + parseInt(r.present || 0), 0);
  const markedTotal   = attRows.reduce((s, r) => s + parseInt(r.total_marked || 0), 0);
  const attendanceRate = markedTotal > 0 ? ((presentTotal / markedTotal) * 100).toFixed(1) : '0.0';

  const { data: leaves = [], isLoading: loadL } = useQuery({
    queryKey: ['hr-dash-leaves'],
    queryFn: () => hrLeaveAPI.listRequests({ status: 'pending' }).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: payrollData, isLoading: loadP } = useQuery({
    queryKey: ['hr-dash-payroll', month, year],
    queryFn: () => hrPayrollAPI.list({ month, year }).then(r => r.data?.data ?? []),
  });
  const payroll = Array.isArray(payrollData) ? payrollData : [];
  const payrollPending = payroll.filter(p => p.status !== 'paid');
  const payrollPendingAmt = payrollPending.reduce((s, p) => s + parseFloat(p.net_pay || 0), 0);

  const { data: otData, isLoading: loadOT } = useQuery({
    queryKey: ['hr-dash-overtime', month, year],
    queryFn: () => hrShiftsAPI.overtime({ month, year }).then(r => r.data?.data ?? r.data ?? []),
  });
  const otRows = Array.isArray(otData) ? otData : [];
  const otHoursTotal = otRows.reduce((s, r) => s + parseFloat(r.ot_hours || 0), 0);

  const { data: reqData, isLoading: loadReq } = useQuery({
    queryKey: ['hr-dash-requests'],
    queryFn: () => hrAdvancedAPI.listServiceRequests({}).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });
  const pendingRequests = (Array.isArray(reqData) ? reqData : []).filter(r => ['open', 'in_progress'].includes(r.status));

  const { data: trendData, isLoading: loadTrend } = useQuery({
    queryKey: ['hr-dash-trend', month, year],
    queryFn: () => hrAttendanceAPI.dailyTrend({ month, year }).then(r => r.data?.data ?? []),
  });
  const trend = (Array.isArray(trendData) ? trendData : []).map(d => ({
    date: dayjs(d.attendance_date).format('D MMM'),
    present: parseInt(d.present || 0),
  }));

  const { data: deptData, isLoading: loadDept } = useQuery({
    queryKey: ['hr-dash-dept-summary', month, year],
    queryFn: () => hrAttendanceAPI.deptSummary({ month, year }).then(r => r.data?.data ?? []),
  });
  const depts = (Array.isArray(deptData) ? deptData : []).map(d => ({
    department: d.department_name,
    headcount: parseInt(d.headcount || 0),
    present: parseInt(d.present || 0),
    absent: parseInt(d.absent || 0),
    onLeave: parseInt(d.on_leave || 0),
  }));

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100%' }}>
      <PageHeader
        title={`Good ${dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={`HR Dashboard — ${dayjs().format('dddd, D MMMM YYYY')}`}
        breadcrumbs={[{ label: 'Overview' }, { label: 'HR Dashboard' }]}
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard icon={Users}       label="Active Employees" value={loadE ? '…' : employees.length}              color="blue"    sub="Company-wide" />
          <KpiCard icon={UserCheck}   label="Attendance Rate"  value={loadA ? '…' : `${attendanceRate}%`}           color="emerald" sub="This month" />
          <KpiCard icon={CalendarOff} label="Pending Leaves"   value={loadL ? '…' : leaves.length}                  color="amber"   sub="Awaiting approval" />
          <KpiCard icon={IndianRupee} label="Payroll Pending"  value={loadP ? '…' : `₹${(payrollPendingAmt/1e5).toFixed(2)}L`} color="orange" sub={`${payrollPending.length} employee(s)`} />
          <KpiCard icon={Clock}       label="Overtime Hours"   value={loadOT ? '…' : otHoursTotal.toFixed(0)}       color="slate"   sub="This month" />
          <KpiCard icon={Ticket}      label="Open HR Requests" value={loadReq ? '…' : pendingRequests.length}       color="red"     sub="Open / in progress" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Daily Attendance (this month)">
            {loadTrend ? null : !trend.length ? (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">No attendance marked yet this month</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: `1px solid ${Theme.borderSoft}` }} />
                  <Line type="monotone" dataKey="present" name="Present" stroke={CHART_LINE} strokeWidth={2.5} dot={{ r: 3, fill: CHART_LINE }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Attendance by Department">
            {loadDept ? null : !depts.length ? (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">No department data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="department" tick={{ fill: CHART_TICK, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: `1px solid ${Theme.borderSoft}` }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: Theme.textMuted }} />
                  <Bar dataKey="present" name="Present"  stackId="a" fill="#34d399" />
                  <Bar dataKey="absent"  name="Absent"   stackId="a" fill="#f87171" />
                  <Bar dataKey="onLeave" name="On Leave" stackId="a" fill="#fbbf24" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Department headcount — full width */}
        <ChartCard title="Headcount by Department">
          {loadDept ? null : !depts.length ? (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">No department data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={depts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="department" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: `1px solid ${Theme.borderSoft}` }} />
                <Bar dataKey="headcount" name="Employees" fill={CHART_BAR_1} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TableCard title="Department Attendance Summary (this month)">
            <table className="w-full text-sm">
              <thead><tr>
                <th className={th}>Department</th>
                <th className={`${th} text-right`}>Headcount</th>
                <th className={`${th} text-right`}>Present</th>
                <th className={`${th} text-right`}>Absent</th>
                <th className={`${th} text-right`}>On Leave</th>
              </tr></thead>
              <tbody>
                {!loadDept && !depts.length && <EmptyRow span={5} text="No department data yet" />}
                {depts.map((d, i) => (
                  <tr key={i}>
                    <td className={td}>{d.department}</td>
                    <td className={`${td} text-right`}>{d.headcount}</td>
                    <td className={`${td} text-right font-semibold text-emerald-700`}>{d.present}</td>
                    <td className={`${td} text-right`}>{d.absent}</td>
                    <td className={`${td} text-right`}>{d.onLeave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <TableCard title="Open HR Requests"
            action={<Link to="/hr-admin/advanced" className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">All <ArrowRight className="w-3 h-3" /></Link>}>
            <table className="w-full text-sm">
              <thead><tr>
                <th className={th}>Employee</th>
                <th className={th}>Subject</th>
                <th className={th}>Priority</th>
                <th className={th}>Status</th>
              </tr></thead>
              <tbody>
                {!loadReq && !pendingRequests.length && <EmptyRow span={4} text="No open HR requests" />}
                {pendingRequests.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.employee_name || '—'}</td>
                    <td className={td}>{r.subject}</td>
                    <td className={td}>
                      <Badge label={r.priority || 'normal'} tone={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'} />
                    </td>
                    <td className={td}>
                      <Badge label={r.status === 'in_progress' ? 'In Progress' : 'Open'} tone={r.status === 'in_progress' ? 'info' : 'warning'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </div>
      </div>
    </div>
  );
}
