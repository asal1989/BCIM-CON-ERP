import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Fingerprint } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CY = new Date().getFullYear();
const YEARS = [CY-2, CY-1, CY];

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

// Returns 0=Sun … 6=Sat for day d in month m (1-based) of year y
function dayOfWeek(y, m, d) { return new Date(y, m - 1, d).getDay(); }

export default function MonthlyStatusPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [project, setProject] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const days = daysInMonth(year, month);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ['monthly-status', year, month, project],
    queryFn:  () => hrAttendanceAPI.monthlyReport({ year, month, project_id: project||undefined })
                    .then(r => r.data || {}),
    enabled: true,
  });

  const attendanceRows = Array.isArray(apiData?.data) ? apiData.data : Array.isArray(apiData) ? apiData : [];
  const holidays = apiData?.holidays || [];

  // Build set of holiday dates: "YYYY-MM-DD"
  const holidaySet = new Set(holidays.map(h => h.date?.slice(0,10)));

  // Build set of Sundays in this month
  const sundaySet = new Set();
  for (let d = 1; d <= days; d++) {
    if (dayOfWeek(year, month, d) === 0) sundaySet.add(d);
  }

  // Group by employee — each day holds the raw punch In/Out times
  const empMap = {};
  attendanceRows.forEach(row => {
    const key = row.emp_id || row.user_id;
    if (!empMap[key]) empMap[key] = {
      emp_id: row.emp_id, name: row.name,
      designation: row.designation, department: row.department,
      days: {},
    };
    const d = new Date(row.attendance_date || row.date);
    const day = d.getDate();
    empMap[key].days[day] = { in: row.in_time || null, out: row.out_time || null };
  });
  const rows = Object.values(empMap);

  // Day header — highlight Sundays and holidays
  function dayHeaderStyle(d) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidaySet.has(dateStr)) return { color:'#5B21B6', fontWeight:800 };
    if (sundaySet.has(d))        return { color:'#94A3B8' };
    return { color:'#475569' };
  }

  const exportCSV = () => {
    const header = ['Emp ID','Name','Designation','Department'];
    for (let d = 1; d <= days; d++) header.push(`${d} In`, `${d} Out`);
    const csvRows = rows.map(r => {
      const row = [r.emp_id, r.name, r.designation||'', r.department||''];
      for (let d = 1; d <= days; d++) {
        const p = r.days[d];
        row.push(p?.in || '', p?.out || '');
      }
      return row;
    });
    const csv = [header, ...csvRows].map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`monthly-attendance-${year}-${month}.csv`; a.click();
  };

  const thBase = { padding:'4px 3px', textAlign:'center', border:'1px solid #D9D9D9', fontFamily:'Calibri, Segoe UI, sans-serif', fontSize:10.5, fontWeight:600, whiteSpace:'nowrap' };
  const tdBase = { padding:'3px 4px', textAlign:'center', border:'1px solid #E5E7EB', fontFamily:'Calibri, Segoe UI, sans-serif', fontSize:10.5, whiteSpace:'nowrap' };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Fingerprint size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Monthly Attendance Report</h1>
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
      <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap', fontSize:11 }}>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:10, height:10, background:'#F8FAFC', border:'1px solid #D9D9D9', display:'inline-block' }} /> Sunday
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:10, height:10, background:'#F5F3FF', border:'1px solid #D9D9D9', display:'inline-block' }} /> Holiday
        </span>
        {holidays.length > 0 && (
          <span style={{ color:'#5B21B6' }}>
            {holidays.map(h => `${h.holiday_name} (${h.date?.slice(5)})`).join(', ')}
          </span>
        )}
      </div>

      {/* Biometric-style In/Out grid */}
      <div style={{ overflow:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0', maxHeight:'70vh' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No attendance data for {MONTHS[month-1]} {year}</div>
        ) : (
          <table style={{ borderCollapse:'collapse', fontSize:10.5 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, position:'sticky', left:0, top:0, background:'#F1F5F9', zIndex:3, minWidth:40 }} rowSpan={2}>Emp ID</th>
                <th style={{ ...thBase, position:'sticky', left:40, top:0, background:'#F1F5F9', zIndex:3, minWidth:150, textAlign:'left' }} rowSpan={2}>Name</th>
                <th style={{ ...thBase, position:'sticky', left:190, top:0, background:'#F1F5F9', zIndex:3, minWidth:110, textAlign:'left' }} rowSpan={2}>Department</th>
                {Array.from({length:days},(_,i)=>{
                  const d = i+1;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const isHoliday = holidaySet.has(dateStr);
                  const isSunday  = sundaySet.has(d);
                  return (
                    <th key={d} colSpan={2} style={{
                      ...thBase, position:'sticky', top:0, zIndex:2, minWidth:76,
                      background: isHoliday ? '#EDE9FE' : isSunday ? '#F1F5F9' : '#F8FAFC',
                      ...dayHeaderStyle(d),
                    }}>{String(d).padStart(2,'0')}-{MONTHS[month-1].slice(0,3)}</th>
                  );
                })}
              </tr>
              <tr>
                {Array.from({length:days},(_,i)=>{
                  const d = i+1;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const isHoliday = holidaySet.has(dateStr);
                  const isSunday  = sundaySet.has(d);
                  const bg = isHoliday ? '#F5F3FF' : isSunday ? '#F8FAFC' : '#FCFCFD';
                  return (
                    <React.Fragment key={d}>
                      <th style={{ ...thBase, position:'sticky', top:18, background:bg, zIndex:1, minWidth:38, color:'#94A3B8', fontWeight:600 }}>In</th>
                      <th style={{ ...thBase, position:'sticky', top:18, background:bg, zIndex:1, minWidth:38, color:'#94A3B8', fontWeight:600 }}>Out</th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,idx) => (
                <tr key={idx}>
                  <td style={{ ...tdBase, position:'sticky', left:0, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', zIndex:1 }}>{r.emp_id}</td>
                  <td style={{ ...tdBase, position:'sticky', left:40, background: idx%2 ? '#FAFAFA' : '#fff', fontWeight:600, color:'#1E293B', textAlign:'left', zIndex:1 }}>{r.name}</td>
                  <td style={{ ...tdBase, position:'sticky', left:190, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', textAlign:'left', zIndex:1 }}>{r.department}</td>
                  {Array.from({length:days},(_,i) => {
                    const d = i+1;
                    const p = r.days[d];
                    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const cellBg = holidaySet.has(dateStr) ? '#FBFAFF' : sundaySet.has(d) ? '#FBFCFD' : (idx%2 ? '#FAFAFA' : '#fff');
                    return (
                      <React.Fragment key={d}>
                        <td style={{ ...tdBase, background: cellBg, color: p?.in ? '#16A34A' : '#CBD5E1' }}>{p?.in || '—'}</td>
                        <td style={{ ...tdBase, background: cellBg, color: p?.out ? '#DC2626' : '#CBD5E1' }}>{p?.out || '—'}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
