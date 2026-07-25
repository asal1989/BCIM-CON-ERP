import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Fingerprint, Users, UserCheck, UserX, Clock, CalendarOff, Timer } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CY = new Date().getFullYear();
const YEARS = [CY-2, CY-1, CY];

const CATEGORIES = [
  { value: 'all',    label: 'All (Staff + Labour)' },
  { value: 'staff',  label: 'Staff only' },
  { value: 'labour', label: 'Labour / Workers only' },
];

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function dayOfWeek(y, m, d) { return new Date(y, m - 1, d).getDay(); }

const selectCls = {
  border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13,
  background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer',
};
const labelCls = { fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

function KpiTile({ icon: Icon, label, value, accent, bg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', flex: '1 1 150px', minWidth: 150 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={accent} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

export default function MonthlyStatusPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('all');
  const [company, setCompany] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const days = daysInMonth(year, month);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ['monthly-status', year, month, project, category],
    queryFn:  () => hrAttendanceAPI.monthlyReport({ year, month, project_id: project||undefined, category })
                    .then(r => r.data || {}),
    enabled: true,
  });

  const attendanceRows = Array.isArray(apiData?.data) ? apiData.data : Array.isArray(apiData) ? apiData : [];
  const holidays = apiData?.holidays || [];

  const holidaySet = new Set(holidays.map(h => h.date?.slice(0,10)));
  const sundaySet = new Set();
  for (let d = 1; d <= days; d++) {
    if (dayOfWeek(year, month, d) === 0) sundaySet.add(d);
  }

  // Group by employee — each day holds the raw punch In/Out + status + lateness
  const empMap = {};
  attendanceRows.forEach(row => {
    const key = row.emp_id || row.user_id;
    if (!empMap[key]) empMap[key] = {
      emp_id: row.emp_id, name: row.name,
      designation: row.designation, department: row.department,
      company: row.company || '—', row_type: row.row_type,
      days: {},
    };
    const d = new Date(row.attendance_date || row.date);
    const day = d.getDate();
    empMap[key].days[day] = {
      in: row.in_time || null,
      out: row.out_time || null,
      status: (row.attendance_status || '').toLowerCase(),
      lateMin: parseInt(row.late_minutes || 0, 10),
    };
  });
  const allRows = Object.values(empMap);

  const availableCompanies = useMemo(() => {
    const seen = new Set();
    allRows.forEach(r => { if (r.company) seen.add(r.company); });
    return [...seen].sort();
  }, [allRows]);

  const rows = useMemo(() => (
    company ? allRows.filter(r => r.company === company) : allRows
  ), [allRows, company]);

  // KPI totals across the visible rows for the whole month
  const kpis = useMemo(() => {
    let present = 0, absent = 0, leave = 0, halfDay = 0, late = 0;
    rows.forEach(r => {
      for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (holidaySet.has(dateStr) || sundaySet.has(d)) continue;
        const p = r.days[d];
        if (!p || p.status === 'absent' || (!p.in && !p.out && !p.status)) { absent++; continue; }
        if (p.status === 'leave') { leave++; continue; }
        if (p.status === 'half_day') { halfDay++; continue; }
        present++;
        if (p.lateMin > 0) late++;
      }
    });
    return { employees: rows.length, present, absent, leave, halfDay, late };
  }, [rows, days, year, month, holidaySet, sundaySet]);

  function dayHeaderStyle(d) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidaySet.has(dateStr)) return { color:'#7C3AED', fontWeight:800 };
    if (sundaySet.has(d))        return { color:'#94A3B8' };
    return { color:'#475569' };
  }

  function cellState(p, d) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isHoliday = holidaySet.has(dateStr);
    const isSunday  = sundaySet.has(d);
    if (isHoliday) return { bg:'#F5F3FF' };
    if (isSunday)  return { bg:'#F8FAFC' };
    if (!p) return { bg:'#FEF2F2', label:'A', labelColor:'#DC2626' };
    if (p.status === 'absent' || (!p.in && !p.out && !p.status))
      return { bg:'#FEE2E2', label:'A', labelColor:'#B91C1C' };
    if (p.status === 'leave')
      return { bg:'#FEF3C7', label:'L', labelColor:'#B45309' };
    if (p.status === 'half_day')
      return { bg:'#DBEAFE', label:'HD', labelColor:'#1D4ED8' };
    if (p.lateMin > 0)
      return { bg:'#FFEDD5', late:true };
    return { bg:'#F0FDF4' };
  }

  const exportCSV = () => {
    const header = ['Emp ID','Name','Designation','Department','Company'];
    for (let d = 1; d <= days; d++) header.push(`${d} In`, `${d} Out`, `${d} Status`);
    const csvRows = rows.map(r => {
      const row = [r.emp_id, r.name, r.designation||'', r.department||'', r.company||''];
      for (let d = 1; d <= days; d++) {
        const p = r.days[d];
        row.push(p?.in || '', p?.out || '', p?.status || '');
      }
      return row;
    });
    const csv = [header, ...csvRows].map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`monthly-attendance-${year}-${month}.csv`; a.click();
  };

  const thBase = { padding:'6px 4px', textAlign:'center', border:'1px solid #E5E7EB', fontFamily:"'Inter', 'Segoe UI', sans-serif", fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' };
  const tdBase = { padding:'4px 5px', textAlign:'center', border:'1px solid #EEF2F6', fontFamily:"'Inter', 'Segoe UI', sans-serif", fontSize:10.5, whiteSpace:'nowrap', transition:'background 0.1s' };

  const LEGEND = [
    { label:'Present',  bg:'#F0FDF4', border:'#BBF7D0' },
    { label:'Absent',   bg:'#FEE2E2', border:'#FECACA' },
    { label:'Leave',    bg:'#FEF3C7', border:'#FDE68A' },
    { label:'Late-in',  bg:'#FFEDD5', border:'#FED7AA' },
    { label:'Half day', bg:'#DBEAFE', border:'#BFDBFE' },
    { label:'Sunday',   bg:'#F8FAFC', border:'#E2E8F0' },
    { label:'Holiday',  bg:'#F5F3FF', border:'#DDD6FE' },
  ];

  return (
    <div style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#7C3AED,#A78BFA)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(124,58,237,0.25)' }}>
            <Fingerprint size={21} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontWeight:800, fontSize:19, color:'#0F172A', margin:0, letterSpacing:'-0.01em' }}>Monthly Attendance Report</h1>
            <p style={{ margin:'2px 0 0', fontSize:12.5, color:'#64748B' }}>{MONTHS[month-1]} {year} · Raw biometric In/Out grid</p>
          </div>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:7, background:'linear-gradient(135deg,#7C3AED,#8B5CF6)', color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:'0 2px 8px rgba(124,58,237,0.3)' }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:16, flexWrap:'wrap' }}>
        <div>
          <label style={labelCls}>Month</label>
          <select value={month} onChange={e=>setMonth(+e.target.value)} style={selectCls}>
            {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelCls}>Year</label>
          <select value={year} onChange={e=>setYear(+e.target.value)} style={selectCls}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelCls}>Category</label>
          <select value={category} onChange={e=>{setCategory(e.target.value); setCompany('');}} style={{ ...selectCls, fontWeight:700, color:'#7C3AED', borderColor:'#DDD6FE' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelCls}>Company</label>
          <select value={company} onChange={e=>setCompany(e.target.value)} style={{ ...selectCls, minWidth:180 }}>
            <option value=''>All Companies</option>
            {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelCls}>Project</label>
          <select value={project} onChange={e=>setProject(e.target.value)} style={{ ...selectCls, minWidth:180 }}>
            <option value=''>All Projects</option>
            {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI strip */}
      {!isLoading && rows.length > 0 && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <KpiTile icon={Users}      label="Employees"    value={kpis.employees} accent="#3B82F6" bg="#EFF6FF" />
          <KpiTile icon={UserCheck}  label="Present days"  value={kpis.present}   accent="#16A34A" bg="#F0FDF4" />
          <KpiTile icon={UserX}      label="Absent days"   value={kpis.absent}    accent="#DC2626" bg="#FEF2F2" />
          <KpiTile icon={CalendarOff}label="Leave days"     value={kpis.leave}     accent="#B45309" bg="#FFFBEB" />
          <KpiTile icon={Clock}      label="Half days"      value={kpis.halfDay}   accent="#1D4ED8" bg="#EFF6FF" />
          <KpiTile icon={Timer}      label="Late arrivals"  value={kpis.late}      accent="#EA580C" bg="#FFF7ED" />
        </div>
      )}

      {/* Legend */}
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12, flexWrap:'wrap' }}>
        {LEGEND.map(l => (
          <span key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'#475569', fontWeight:600 }}>
            <span style={{ width:12, height:12, borderRadius:4, background:l.bg, border:`1px solid ${l.border}`, display:'inline-block' }} />
            {l.label}
          </span>
        ))}
        {holidays.length > 0 && (
          <span style={{ fontSize:11.5, color:'#7C3AED', fontWeight:600 }}>
            🎉 {holidays.map(h => `${h.holiday_name} (${h.date?.slice(5)})`).join(', ')}
          </span>
        )}
      </div>

      {/* Biometric-style In/Out grid */}
      <div style={{ overflow:'auto', background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', maxHeight:'68vh', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'56px', color:'#94A3B8' }}>
            <div style={{ width:28, height:28, border:'3px solid #EDE9FE', borderTopColor:'#7C3AED', borderRadius:'50%', margin:'0 auto 12px', animation:'spin 0.8s linear infinite' }} />
            Loading attendance data…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'56px', color:'#94A3B8' }}>No attendance data for {MONTHS[month-1]} {year}</div>
        ) : (
          <table style={{ borderCollapse:'collapse', fontSize:10.5, width:'100%' }}>
            <thead>
              <tr>
                <th style={{ ...thBase, position:'sticky', left:0, top:0, background:'#F1F5F9', zIndex:3, minWidth:44 }} rowSpan={2}>Emp ID</th>
                <th style={{ ...thBase, position:'sticky', left:44, top:0, background:'#F1F5F9', zIndex:3, minWidth:160, textAlign:'left' }} rowSpan={2}>Name</th>
                <th style={{ ...thBase, position:'sticky', left:204, top:0, background:'#F1F5F9', zIndex:3, minWidth:120, textAlign:'left' }} rowSpan={2}>Department</th>
                <th style={{ ...thBase, position:'sticky', left:324, top:0, background:'#F1F5F9', zIndex:3, minWidth:140, textAlign:'left' }} rowSpan={2}>Company</th>
                {Array.from({length:days},(_,i)=>{
                  const d = i+1;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const isHoliday = holidaySet.has(dateStr);
                  const isSunday  = sundaySet.has(d);
                  return (
                    <th key={d} colSpan={2} style={{
                      ...thBase, position:'sticky', top:0, zIndex:2, minWidth:78,
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
                      <th style={{ ...thBase, position:'sticky', top:26, background:bg, zIndex:1, minWidth:38, color:'#94A3B8', fontWeight:600 }}>In</th>
                      <th style={{ ...thBase, position:'sticky', top:26, background:bg, zIndex:1, minWidth:38, color:'#94A3B8', fontWeight:600 }}>Out</th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,idx) => (
                <tr key={idx} className="mar-row">
                  <td style={{ ...tdBase, position:'sticky', left:0, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', zIndex:1, fontWeight:600 }}>{r.emp_id}</td>
                  <td style={{ ...tdBase, position:'sticky', left:44, background: idx%2 ? '#FAFAFA' : '#fff', fontWeight:700, color:'#1E293B', textAlign:'left', zIndex:1 }}>{r.name}</td>
                  <td style={{ ...tdBase, position:'sticky', left:204, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', textAlign:'left', zIndex:1 }}>{r.department}</td>
                  <td style={{ ...tdBase, position:'sticky', left:324, background: idx%2 ? '#FAFAFA' : '#fff', color:'#7C3AED', fontWeight:600, textAlign:'left', zIndex:1 }}>{r.company}</td>
                  {Array.from({length:days},(_,i) => {
                    const d = i+1;
                    const p = r.days[d];
                    const cs = cellState(p, d);
                    const rowBg = idx%2 ? '#FAFAFA' : '#fff';
                    const bg = cs.bg || rowBg;

                    if (cs.label) {
                      return (
                        <td key={d} colSpan={2} style={{ ...tdBase, background: bg, color: cs.labelColor, fontWeight:800 }}>
                          {cs.label}
                        </td>
                      );
                    }
                    return (
                      <React.Fragment key={d}>
                        <td
                          title={cs.late ? `Late by ${p.lateMin} min` : undefined}
                          style={{ ...tdBase, background: bg, color: p?.in ? (cs.late ? '#C2410C' : '#16A34A') : '#CBD5E1', fontWeight: cs.late ? 800 : 600, borderLeft: cs.late ? '2px solid #FB923C' : undefined }}
                        >
                          {p?.in || '—'}
                        </td>
                        <td style={{ ...tdBase, background: bg, color: p?.out ? '#DC2626' : '#CBD5E1', fontWeight:600 }}>{p?.out || '—'}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .mar-row:hover td { filter: brightness(0.97); }
      `}</style>
    </div>
  );
}
