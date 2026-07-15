import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, BarChart2 } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CY = new Date().getFullYear();
const YEARS = [CY-2, CY-1, CY];

const STATUS_COLOR = { present:'#D1FAE5', absent:'#FEE2E2', leave:'#FEF3C7', half_day:'#DBEAFE', holiday:'#EDE9FE', late:'#FDE8D8' };
const STATUS_TEXT  = { present:'#065F46', absent:'#991B1B', leave:'#92400E', half_day:'#1E40AF', holiday:'#5B21B6', late:'#9A3412' };
const STATUS_LABEL = { present:'P', absent:'A', leave:'L', half_day:'HD', holiday:'H', late:'LA' };

function Pill({ s }) {
  const key = (s||'absent').toLowerCase();
  return (
    <span style={{ background: STATUS_COLOR[key]||'#F1F5F9', color: STATUS_TEXT[key]||'#475569',
      borderRadius:3, padding:'1px 6px', fontWeight:700, fontSize:10, letterSpacing:0.4 }}>
      {STATUS_LABEL[key]||s||'A'}
    </span>
  );
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

export default function MonthlyStatusPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [project, setProject] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const days = daysInMonth(year, month);

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-status', year, month, project],
    queryFn:  () => hrAttendanceAPI.monthlyReport({ year, month, project_id: project||undefined })
                    .then(r => r.data?.data || r.data || []),
    enabled: true,
  });

  // Group by employee → map of day → status
  const empMap = {};
  (data||[]).forEach(row => {
    const key = row.emp_id || row.user_id;
    if (!empMap[key]) empMap[key] = { emp_id: row.emp_id, name: row.name, designation: row.designation, department: row.department, days: {}, present:0, absent:0, leave:0, half:0 };
    const d = new Date(row.attendance_date || row.date);
    const day = d.getDate();
    const s = (row.attendance_status || row.status || 'absent').toLowerCase();
    empMap[key].days[day] = s;
    if (s==='present') empMap[key].present++;
    else if (s==='absent') empMap[key].absent++;
    else if (s==='leave') empMap[key].leave++;
    else if (s==='half_day') empMap[key].half++;
  });
  const rows = Object.values(empMap);

  const exportCSV = () => {
    const header = ['Emp ID','Name','Designation','Department',...Array.from({length:days},(_,i)=>`${i+1}`),'P','A','L','HD'];
    const csvRows = rows.map(r => [r.emp_id, r.name, r.designation||'', r.department||'',
      ...Array.from({length:days},(_,i) => STATUS_LABEL[(r.days[i+1]||'absent').toLowerCase()]||'A'),
      r.present, r.absent, r.leave, r.half]);
    const csv = [header, ...csvRows].map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`monthly-status-${year}-${month}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <BarChart2 size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Monthly Attendance Status</h1>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <select value={month} onChange={e=>setMonth(+e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(+e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={project} onChange={e=>setProject(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value=''>All Projects</option>
          {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        {Object.entries(STATUS_LABEL).map(([k,v])=>(
          <span key={k} style={{ background:STATUS_COLOR[k]||'#F1F5F9', color:STATUS_TEXT[k]||'#475569', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{v} – {k.replace('_',' ')}</span>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No attendance data for {MONTHS[month-1]} {year}</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                <th style={{ padding:'8px 10px', textAlign:'left', position:'sticky', left:0, background:'#F8FAFC', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>Emp ID</th>
                <th style={{ padding:'8px 10px', textAlign:'left', position:'sticky', left:60, background:'#F8FAFC', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>Name</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>Dept</th>
                {Array.from({length:days},(_,i)=>(
                  <th key={i+1} style={{ padding:'6px 4px', textAlign:'center', fontWeight:700, color:'#475569', minWidth:28 }}>{i+1}</th>
                ))}
                <th style={{ padding:'8px 6px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>P</th>
                <th style={{ padding:'8px 6px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FEE2E2' }}>A</th>
                <th style={{ padding:'8px 6px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FEF3C7' }}>L</th>
                <th style={{ padding:'8px 6px', textAlign:'center', fontWeight:700, color:'#1E40AF', background:'#DBEAFE' }}>HD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,idx) => (
                <tr key={idx} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'6px 10px', position:'sticky', left:0, background:'#fff', color:'#64748B', fontFamily:'monospace' }}>{r.emp_id}</td>
                  <td style={{ padding:'6px 10px', position:'sticky', left:60, background:'#fff', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name}</td>
                  <td style={{ padding:'6px 10px', color:'#64748B', whiteSpace:'nowrap' }}>{r.department}</td>
                  {Array.from({length:days},(_,i) => (
                    <td key={i+1} style={{ padding:'4px 2px', textAlign:'center' }}>
                      {r.days[i+1] ? <Pill s={r.days[i+1]} /> : <span style={{ color:'#CBD5E1', fontSize:10 }}>—</span>}
                    </td>
                  ))}
                  <td style={{ padding:'6px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#F0FDF4' }}>{r.present}</td>
                  <td style={{ padding:'6px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FFF1F2' }}>{r.absent}</td>
                  <td style={{ padding:'6px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FFFBEB' }}>{r.leave}</td>
                  <td style={{ padding:'6px', textAlign:'center', fontWeight:700, color:'#1E40AF', background:'#EFF6FF' }}>{r.half}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
