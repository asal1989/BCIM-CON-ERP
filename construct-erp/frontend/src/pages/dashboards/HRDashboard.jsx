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

// ── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg:       'linear-gradient(135deg, #0A0E27 0%, #0D1128 50%, #0A0E27 100%)',
  card:     'rgba(255,255,255,0.05)',
  cardHover:'rgba(255,255,255,0.08)',
  border:   'rgba(255,255,255,0.1)',
  text:     '#FFFFFF',
  textDim:  '#8B92A8',
  violet:   '#534AB7',
  violetLt: '#7F77DD',
  green:    '#1D9E75',
  amber:    '#BA7517',
  red:      '#E24B4A',
  blue:     '#378ADD',
};

const cardStyle = {
  background: C.card, backdropFilter: 'blur(20px)', border: `1px solid ${C.border}`,
  borderRadius: 12, padding: '1.5rem', position: 'relative', overflow: 'hidden',
};

function MetricCard({ label, value, sub, icon: Icon, loading }) {
  return (
    <div style={{ ...cardStyle, transition: 'all 0.3s ease' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; e.currentTarget.style.transform = 'translateY(-4px)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
        <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ width: 36, height: 36, background: 'rgba(83,74,183,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.violetLt, flexShrink: 0 }}>
          <Icon size={16} />
        </div>
      </div>
      {loading
        ? <div style={{ height: 28, width: 70, background: 'rgba(255,255,255,0.08)', borderRadius: 6 }} />
        : <div style={{ fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{value}</div>}
      {sub && <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, full }) {
  return (
    <div style={{ ...cardStyle, gridColumn: full ? '1 / -1' : undefined }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: '1.25rem' }}>{title}</h3>
      <div style={{ height: 260 }}>{children}</div>
    </div>
  );
}

function TableCard({ title, action, children }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</h3>
        {action}
      </div>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );
}

const th = { padding: '0.7rem 0.6rem', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
const td = { padding: '0.8rem 0.6rem', fontSize: 13, color: C.text, borderBottom: '1px solid rgba(255,255,255,0.05)' };

function Badge({ label, tone }) {
  const map = {
    success: { bg: 'rgba(29,158,117,0.15)', color: C.green,  border: 'rgba(29,158,117,0.3)' },
    warning: { bg: 'rgba(186,117,23,0.15)', color: C.amber,  border: 'rgba(186,117,23,0.3)' },
    danger:  { bg: 'rgba(226,75,74,0.15)',  color: C.red,    border: 'rgba(226,75,74,0.3)' },
    info:    { bg: 'rgba(83,74,183,0.15)',  color: C.violetLt, border: 'rgba(83,74,183,0.3)' },
  };
  const c = map[tone] || map.info;
  return (
    <span style={{ display: 'inline-block', padding: '0.3rem 0.7rem', borderRadius: 6, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {label}
    </span>
  );
}

const EmptyRow = ({ span, text }) => (
  <tr><td colSpan={span} style={{ ...td, textAlign: 'center', color: C.textDim, padding: '1.5rem' }}>{text}</td></tr>
);

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

  const greeting = dayjs().hour() < 12 ? 'Good morning' : dayjs().hour() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ background: C.bg, minHeight: '100%', color: C.text, fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.75rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg,#fff,#B8BFD1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {greeting}, {user?.name?.split(' ')[0] || 'there'} 👋
            </h1>
            <p style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>HR Dashboard — {dayjs().format('dddd, D MMMM YYYY')}</p>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <MetricCard icon={Users}      label="Active Employees"  value={employees.length}                 loading={loadE}  sub="Company-wide" />
          <MetricCard icon={UserCheck}  label="Attendance Rate"   value={`${attendanceRate}%`}              loading={loadA}  sub="This month" />
          <MetricCard icon={CalendarOff} label="Pending Leaves"   value={leaves.length}                     loading={loadL}  sub="Awaiting approval" />
          <MetricCard icon={IndianRupee} label="Payroll Pending"  value={`₹${(payrollPendingAmt/1e5).toFixed(2)}L`} loading={loadP} sub={`${payrollPending.length} employee(s)`} />
          <MetricCard icon={Clock}      label="Overtime Hours"    value={otHoursTotal.toFixed(0)}           loading={loadOT} sub="This month" />
          <MetricCard icon={Ticket}     label="Open HR Requests"  value={pendingRequests.length}            loading={loadReq} sub="Open / in progress" />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <ChartCard title="Daily Attendance (this month)">
            {loadTrend ? null : !trend.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textDim, fontSize: 13 }}>No attendance marked yet this month</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1f3a', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.text }} />
                  <Line type="monotone" dataKey="present" name="Present" stroke={C.violetLt} strokeWidth={2.5} dot={{ r: 3, fill: C.violetLt }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Attendance by Department">
            {loadDept ? null : !depts.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textDim, fontSize: 13 }}>No department data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="department" tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1f3a', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.text }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                  <Bar dataKey="present" name="Present" stackId="a" fill={C.violet} radius={[0,0,0,0]} />
                  <Bar dataKey="absent"  name="Absent"  stackId="a" fill={C.red} radius={[0,0,0,0]} />
                  <Bar dataKey="onLeave" name="On Leave" stackId="a" fill={C.amber} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Department headcount — full width */}
        <div style={{ marginBottom: '1.75rem' }}>
          <ChartCard title="Headcount by Department" full>
            {loadDept ? null : !depts.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textDim, fontSize: 13 }}>No department data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="department" tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1f3a', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.text }} />
                  <Bar dataKey="headcount" name="Employees" fill={C.violetLt} radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Tables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1rem' }}>
          <TableCard title="Department Attendance Summary (this month)">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Department</th>
                <th style={{ ...th, textAlign: 'right' }}>Headcount</th>
                <th style={{ ...th, textAlign: 'right' }}>Present</th>
                <th style={{ ...th, textAlign: 'right' }}>Absent</th>
                <th style={{ ...th, textAlign: 'right' }}>On Leave</th>
              </tr></thead>
              <tbody>
                {!loadDept && !depts.length && <EmptyRow span={5} text="No department data yet" />}
                {depts.map((d, i) => (
                  <tr key={i}>
                    <td style={td}>{d.department}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{d.headcount}</td>
                    <td style={{ ...td, textAlign: 'right', color: C.green, fontWeight: 600 }}>{d.present}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{d.absent}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{d.onLeave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <TableCard title="Open HR Requests"
            action={<Link to="/hr-admin/advanced" style={{ fontSize: 12, color: C.violetLt, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>All <ArrowRight size={12} /></Link>}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Employee</th>
                <th style={th}>Subject</th>
                <th style={th}>Priority</th>
                <th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {!loadReq && !pendingRequests.length && <EmptyRow span={4} text="No open HR requests" />}
                {pendingRequests.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.employee_name || '—'}</td>
                    <td style={td}>{r.subject}</td>
                    <td style={td}>
                      <Badge label={r.priority || 'normal'} tone={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'} />
                    </td>
                    <td style={td}>
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
