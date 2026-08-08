import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Clock, LogOut } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function OvertimeEarlyExitReportPage() {
  const [searchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo]     = useState(today());
  const [project, setProject]   = useState('');
  const [tab, setTab]           = useState(searchParams.get('type') === 'early_exit' ? 'early_exit' : 'overtime');

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []) });

  const { data, isLoading } = useQuery({
    queryKey: ['ot-ee-report', dateFrom, dateTo, project, tab],
    enabled: !!dateFrom && !!dateTo,
    queryFn: () => hrAttendanceAPI.overtimeEarlyExitReport({ date_from: dateFrom, date_to: dateTo, project_id: project || undefined, type: tab }).then(r => r.data),
  });

  const rows = data?.data || [];
  const summary = data?.summary || {};

  const exportCSV = () => {
    const header = tab === 'overtime'
      ? ['Date','Emp ID','Name','Designation','Department','Project','In Time','Out Time','Overtime (hrs)']
      : ['Date','Emp ID','Name','Designation','Department','Project','In Time','Out Time','Early Exit (min)'];
    const csvRows = rows.map(r => tab === 'overtime'
      ? [r.attendance_date, r.emp_id, r.name, r.designation, r.department, r.project_name, r.in_time, r.out_time, r.overtime_hours]
      : [r.attendance_date, r.emp_id, r.name, r.designation, r.department, r.project_name, r.in_time, r.out_time, r.early_exit_minutes]);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${tab}-register-${dateFrom}_to_${dateTo}.csv`;
    a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tab === 'overtime' ? <Clock size={22} style={{ color: '#7C3AED' }} /> : <LogOut size={22} style={{ color: '#7C3AED' }} />}
          <h1 style={{ fontWeight: 700, fontSize: 18, color: '#1E293B', margin: 0 }}>Overtime & Early Exit Register</h1>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['overtime', 'Overtime'], ['early_exit', 'Early Exit']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ background: tab === id ? '#7C3AED' : '#F1F5F9', color: tab === id ? '#fff' : '#475569', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>From</label>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '5px 10px', fontSize: 13 }} />
          <label style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>To</label>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '5px 10px', fontSize: 13 }} />
        </div>
        <select value={project} onChange={e => setProject(e.target.value)} style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}>
          <option value="">All Projects</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '10px 18px', minWidth: 120, textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#5B21B6' }}>{rows.length}</div>
          <div style={{ fontSize: 11, color: '#5B21B6', fontWeight: 600 }}>Records</div>
        </div>
        {tab === 'overtime' && (
          <div style={{ background: '#ECFDF5', borderRadius: 8, padding: '10px 18px', minWidth: 160, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#065F46' }}>{Number(summary.total_overtime_hours || 0).toFixed(1)}</div>
            <div style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>Total OT Hours</div>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
              {['Date','Emp ID','Name','Designation','Department','Project','In Time','Out Time', tab === 'overtime' ? 'Overtime (hrs)' : 'Early Exit (min)'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>No {tab === 'overtime' ? 'overtime' : 'early exit'} records for this range</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '7px 12px' }}>{r.attendance_date}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#64748B' }}>{r.emp_id || '-'}</td>
                <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '7px 12px' }}>{r.designation}</td>
                <td style={{ padding: '7px 12px' }}>{r.department}</td>
                <td style={{ padding: '7px 12px' }}>{r.project_name}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{r.in_time || '-'}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{r.out_time || '-'}</td>
                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#7C3AED' }}>{tab === 'overtime' ? r.overtime_hours : r.early_exit_minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
