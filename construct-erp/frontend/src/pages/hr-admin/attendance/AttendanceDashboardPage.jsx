import React, { useState } from 'react';
import { Users, UserCheck, UserX, Clock, CalendarCheck, TrendingUp, MapPin, BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI } from '../../../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const now = new Date();

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm">
      <div className="p-2.5 rounded-lg" style={{ background: color + '18' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function AttendanceDashboardPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['att-dashboard-summary', month, year],
    queryFn: () => hrAttendanceAPI.summary({ month, year }).then(r => r.data),
  });

  const { data: trendData } = useQuery({
    queryKey: ['att-dashboard-trend', month, year],
    queryFn: () => hrAttendanceAPI.dailyTrend({ month, year }).then(r => r.data),
  });

  const { data: deptData } = useQuery({
    queryKey: ['att-dashboard-dept', month, year],
    queryFn: () => hrAttendanceAPI.deptSummary({ month, year }).then(r => r.data),
  });

  const rows    = summaryData?.data || [];
  const trend   = (trendData?.data || []).map(r => ({
    day:     new Date(r.attendance_date).getDate(),
    Present: parseInt(r.present) || 0,
    Absent:  parseInt(r.absent)  || 0,
    Leave:   parseInt(r.on_leave)|| 0,
  }));
  const depts   = deptData?.data || [];

  const totals = rows.reduce((acc, r) => ({
    total:    acc.total + 1,
    present:  acc.present  + (parseInt(r.present)  || 0),
    absent:   acc.absent   + (parseInt(r.absent)   || 0),
    half_day: acc.half_day + (parseInt(r.half_day) || 0),
    on_leave: acc.on_leave + (parseInt(r.on_leave) || 0),
    late:     acc.late     + (parseInt(r.total_late_minutes) > 0 ? 1 : 0),
  }), { total: 0, present: 0, absent: 0, half_day: 0, on_leave: 0, late: 0 });

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Attendance Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly overview — {MONTHS[month-1]} {year}</p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users}        label="Employees"   value={totals.total}    color="#2563EB" />
        <StatCard icon={UserCheck}    label="Present"     value={totals.present}  color="#10B981" />
        <StatCard icon={UserX}        label="Absent"      value={totals.absent}   color="#EF4444" />
        <StatCard icon={Clock}        label="Late"        value={totals.late}     color="#F59E0B" />
        <StatCard icon={CalendarCheck} label="On Leave"   value={totals.on_leave} color="#8B5CF6" />
        <StatCard icon={TrendingUp}   label="Attend. %"
          value={totals.total && totals.present ? Math.round(totals.present / totals.total * 100) + '%' : '—'}
          color="#0EA5E9" />
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-blue-500" /> Daily Attendance Trend
        </h2>
        {trend.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-300 text-sm border-2 border-dashed border-slate-100 rounded-lg">
            No data for {MONTHS[month-1]} {year}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Present" fill="#10B981" radius={[3,3,0,0]} />
              <Bar dataKey="Absent"  fill="#EF4444" radius={[3,3,0,0]} />
              <Bar dataKey="Leave"   fill="#8B5CF6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Department Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-4">
          <BarChart2 size={14} className="text-emerald-500" /> Department-wise Attendance
        </h2>
        {depts.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-slate-300 text-sm border-2 border-dashed border-slate-100 rounded-lg">
            No department data
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-400 font-bold border-b border-slate-100">
                  <th className="text-left py-2 px-3">Department</th>
                  <th className="text-center py-2 px-3">Headcount</th>
                  <th className="text-center py-2 px-3 text-emerald-600">Present</th>
                  <th className="text-center py-2 px-3 text-red-500">Absent</th>
                  <th className="text-center py-2 px-3 text-blue-600">Leave</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {depts.map(d => (
                  <tr key={d.department_name} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-700">{d.department_name}</td>
                    <td className="py-2 px-3 text-center text-slate-500">{d.headcount}</td>
                    <td className="py-2 px-3 text-center font-bold text-emerald-600">{d.present}</td>
                    <td className="py-2 px-3 text-center font-bold text-red-500">{d.absent}</td>
                    <td className="py-2 px-3 text-center font-bold text-blue-600">{d.on_leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee List */}
      {summaryLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
        </div>
      ) : rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <MapPin size={14} className="text-amber-500" /> Employee Summary — {MONTHS[month-1]} {year}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-400 font-bold border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-2 px-4">Employee</th>
                  <th className="text-left py-2 px-4">Department</th>
                  <th className="text-center py-2 px-3 text-emerald-600">P</th>
                  <th className="text-center py-2 px-3 text-red-500">A</th>
                  <th className="text-center py-2 px-3 text-amber-500">H</th>
                  <th className="text-center py-2 px-3 text-blue-500">L</th>
                  <th className="text-center py-2 px-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.user_id} className="hover:bg-slate-50">
                    <td className="py-2 px-4">
                      <div className="font-semibold text-slate-800">{r.name}</div>
                      {r.employee_code && <div className="text-xs text-slate-400">{r.employee_code}</div>}
                    </td>
                    <td className="py-2 px-4 text-slate-500">{r.department_name || '—'}</td>
                    <td className="py-2 px-3 text-center font-bold text-emerald-600">{r.present}</td>
                    <td className="py-2 px-3 text-center font-bold text-red-500">{r.absent}</td>
                    <td className="py-2 px-3 text-center font-bold text-amber-500">{r.half_day}</td>
                    <td className="py-2 px-3 text-center font-bold text-blue-500">{r.on_leave}</td>
                    <td className="py-2 px-3 text-center text-slate-500">{r.total_marked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
