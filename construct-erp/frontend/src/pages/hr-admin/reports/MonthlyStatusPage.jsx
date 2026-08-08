import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Fingerprint, Users, UserCheck, UserX, Clock, CalendarOff, Timer, Printer } from 'lucide-react';
import { REPORT_PRINT_CSS_A3_LANDSCAPE, ReportPrintHeader, ReportPrintSignature } from '../../../components/reports/ReportPrintKit';

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

  // A Sunday/holiday is only a "day off" when nobody actually punched in —
  // construction sites routinely work Sundays, and a present punch on an
  // off-day must still count as a worked day instead of being silently
  // dropped just because it falls on the weekly-off/holiday calendar.
  function isOffDay(dateStr, d) { return holidaySet.has(dateStr) || sundaySet.has(d); }
  function workedPresent(p) {
    if (!p) return false;
    if (p.status === 'absent' || p.status === 'leave' || p.status === 'half_day') return false;
    return p.status === 'present' || !!p.in || !!p.out;
  }

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
        const p = r.days[d];
        if (isOffDay(dateStr, d)) {
          if (workedPresent(p)) { present++; if (p.lateMin > 0) late++; }
          continue;
        }
        if (!p || p.status === 'absent' || (!p.in && !p.out && !p.status)) { absent++; continue; }
        if (p.status === 'leave') { leave++; continue; }
        if (p.status === 'half_day') { halfDay++; continue; }
        present++;
        if (p.lateMin > 0) late++;
      }
    });
    return { employees: rows.length, present, absent, leave, halfDay, late };
  }, [rows, days, year, month, holidaySet, sundaySet]);

  // Day-wise headcount for the table's total row — same present/absent
  // rules as the KPI strip above, just broken out per date instead of
  // summed across the whole month.
  const dailyTotals = useMemo(() => {
    const present = new Array(days).fill(0);
    const absent  = new Array(days).fill(0);
    rows.forEach(r => {
      for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const p = r.days[d];
        if (isOffDay(dateStr, d)) {
          if (workedPresent(p)) present[d-1]++;
          continue;
        }
        if (!p || p.status === 'absent' || (!p.in && !p.out && !p.status)) { absent[d-1]++; continue; }
        if (p.status === 'leave' || p.status === 'half_day') continue;
        present[d-1]++;
      }
    });
    return { present, absent };
  }, [rows, days, year, month, holidaySet, sundaySet]);

  // Per-employee monthly totals — the row-end "Total Present / Total
  // Absent" columns. Same rules again, summed across the month per row.
  const rowTotals = useMemo(() => rows.map(r => {
    let present = 0, absent = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const p = r.days[d];
      if (isOffDay(dateStr, d)) {
        if (workedPresent(p)) present++;
        continue;
      }
      if (!p || p.status === 'absent' || (!p.in && !p.out && !p.status)) { absent++; continue; }
      if (p.status === 'leave' || p.status === 'half_day') continue;
      present++;
    }
    return { present, absent };
  }), [rows, days, year, month, holidaySet, sundaySet]);

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
    if ((isHoliday || isSunday) && workedPresent(p))
      return { bg:'#CFFAFE' };
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
    { label:'Worked (Sun/Holiday)', bg:'#CFFAFE', border:'#67E8F9' },
  ];

  return (
    <div style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: '100vh' }}>
      <style>{REPORT_PRINT_CSS_A3_LANDSCAPE}</style>

      {/* Header */}
      <div className="no-print" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#7C3AED,#A78BFA)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(124,58,237,0.25)' }}>
            <Fingerprint size={21} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontWeight:800, fontSize:19, color:'#0F172A', margin:0, letterSpacing:'-0.01em' }}>Monthly Attendance Report</h1>
            <p style={{ margin:'2px 0 0', fontSize:12.5, color:'#64748B' }}>{MONTHS[month-1]} {year} · Raw biometric In/Out grid</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:7, background:'linear-gradient(135deg,#7C3AED,#8B5CF6)', color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:'0 2px 8px rgba(124,58,237,0.3)' }}>
            <Download size={14}/> Export CSV
          </button>
          <button onClick={() => window.print()} style={{ display:'flex', alignItems:'center', gap:7, background:'#1A56DB', color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
            <Printer size={14}/> Print / PDF
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="no-print" style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:16, flexWrap:'wrap' }}>
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
        <div className="no-print" style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <KpiTile icon={Users}      label="Employees"    value={kpis.employees} accent="#3B82F6" bg="#EFF6FF" />
          <KpiTile icon={UserCheck}  label="Present days"  value={kpis.present}   accent="#16A34A" bg="#F0FDF4" />
          <KpiTile icon={UserX}      label="Absent days"   value={kpis.absent}    accent="#DC2626" bg="#FEF2F2" />
          <KpiTile icon={CalendarOff}label="Leave days"     value={kpis.leave}     accent="#B45309" bg="#FFFBEB" />
          <KpiTile icon={Clock}      label="Half days"      value={kpis.halfDay}   accent="#1D4ED8" bg="#EFF6FF" />
          <KpiTile icon={Timer}      label="Late arrivals"  value={kpis.late}      accent="#EA580C" bg="#FFF7ED" />
        </div>
      )}

      {/* Legend */}
      <div className="no-print" style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12, flexWrap:'wrap' }}>
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
      <div id="report-print-root">
        <ReportPrintHeader reportTitle="Monthly Attendance Report" subtitle={`${MONTHS[month-1]} ${year}${company ? ' · ' + company : ''}`} showTimestamp />
      <div className="mar-table-wrap" style={{ overflow:'auto', background:'#fff', borderRadius:12, border:'1px solid #E2E8F0', maxHeight:'68vh', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        {isLoading ? (
          <div className="no-print" style={{ textAlign:'center', padding:'56px', color:'#94A3B8' }}>
            <div style={{ width:28, height:28, border:'3px solid #EDE9FE', borderTopColor:'#7C3AED', borderRadius:'50%', margin:'0 auto 12px', animation:'spin 0.8s linear infinite' }} />
            Loading attendance data…
          </div>
        ) : rows.length === 0 ? (
          <div className="no-print" style={{ textAlign:'center', padding:'56px', color:'#94A3B8' }}>No attendance data for {MONTHS[month-1]} {year}</div>
        ) : (
          <table className="mar-table" style={{ borderCollapse:'collapse', fontSize:10.5, width:'100%' }}>
            <thead>
              <tr>
                <th className="mar-c-emp"  style={{ ...thBase, position:'sticky', left:0, top:0, background:'#F1F5F9', zIndex:3, minWidth:72 }} rowSpan={2}>Emp ID</th>
                <th className="mar-c-name" style={{ ...thBase, position:'sticky', left:72, top:0, background:'#F1F5F9', zIndex:3, minWidth:160, textAlign:'left' }} rowSpan={2}>Name</th>
                <th className="mar-c-dept" style={{ ...thBase, position:'sticky', left:232, top:0, background:'#F1F5F9', zIndex:3, minWidth:120, textAlign:'left' }} rowSpan={2}>Department</th>
                <th className="mar-c-co"   style={{ ...thBase, position:'sticky', left:352, top:0, background:'#F1F5F9', zIndex:3, minWidth:140, textAlign:'left' }} rowSpan={2}>Company</th>
                {Array.from({length:days},(_,i)=>{
                  const d = i+1;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const isHoliday = holidaySet.has(dateStr);
                  const isSunday  = sundaySet.has(d);
                  return (
                    <th key={d} style={{
                      ...thBase, position:'sticky', top:0, zIndex:2, minWidth:78,
                      background: isHoliday ? '#EDE9FE' : isSunday ? '#F1F5F9' : '#F8FAFC',
                      ...dayHeaderStyle(d),
                    }}>{String(d).padStart(2,'0')}-{MONTHS[month-1].slice(0,3)}</th>
                  );
                })}
                <th className="mar-c-sum" style={{ ...thBase, top:0, zIndex:2, minWidth:50, background:'#F0FDF4', color:'#15803D' }} rowSpan={2}>Total<br/>Present</th>
                <th className="mar-c-sum" style={{ ...thBase, top:0, zIndex:2, minWidth:50, background:'#FEF2F2', color:'#B91C1C' }} rowSpan={2}>Total<br/>Absent</th>
              </tr>
              <tr>
                {Array.from({length:days},(_,i)=>{
                  const d = i+1;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const isHoliday = holidaySet.has(dateStr);
                  const isSunday  = sundaySet.has(d);
                  const bg = isHoliday ? '#F5F3FF' : isSunday ? '#F8FAFC' : '#FCFCFD';
                  return (
                    <th key={d} style={{ ...thBase, position:'sticky', top:26, background:bg, zIndex:1, minWidth:78, color:'#94A3B8', fontWeight:600, padding:0 }}>
                      <span className="mar-io">
                        <span className="mar-io-in">In</span>
                        <span className="mar-io-out">Out</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,idx) => (
                <tr key={idx} className="mar-row">
                  <td className="mar-c-emp"  style={{ ...tdBase, position:'sticky', left:0, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', zIndex:1, fontWeight:600 }}>{r.emp_id}</td>
                  <td className="mar-c-name" style={{ ...tdBase, position:'sticky', left:72, background: idx%2 ? '#FAFAFA' : '#fff', fontWeight:700, color:'#1E293B', textAlign:'left', zIndex:1 }}>{r.name}</td>
                  <td className="mar-c-dept" style={{ ...tdBase, position:'sticky', left:232, background: idx%2 ? '#FAFAFA' : '#fff', color:'#64748B', textAlign:'left', zIndex:1 }}>{r.department}</td>
                  <td className="mar-c-co"   style={{ ...tdBase, position:'sticky', left:352, background: idx%2 ? '#FAFAFA' : '#fff', color:'#7C3AED', fontWeight:600, textAlign:'left', zIndex:1 }}>{r.company}</td>
                  {Array.from({length:days},(_,i) => {
                    const d = i+1;
                    const p = r.days[d];
                    const cs = cellState(p, d);
                    const rowBg = idx%2 ? '#FAFAFA' : '#fff';
                    const bg = cs.bg || rowBg;

                    if (cs.label) {
                      return (
                        <td key={d} style={{ ...tdBase, background: bg, color: cs.labelColor, fontWeight:800 }}>
                          {cs.label}
                        </td>
                      );
                    }
                    // In/Out share one column — side by side on screen, stacked
                    // for print so all 31 days fit across the sheet. A/L/HD
                    // cells already carry a status letter (see cs.label
                    // above) — Present days need the same "P" so the print
                    // sheet never shows a bare time with no status attached.
                    return (
                      <td
                        key={d}
                        title={cs.late ? `Late by ${p.lateMin} min` : undefined}
                        style={{ ...tdBase, background: bg, padding:0, borderLeft: cs.late ? '2px solid #FB923C' : undefined }}
                      >
                        <span className="mar-status">P</span>
                        <span className="mar-io">
                          <span className="mar-io-in" style={{ color: p?.in ? (cs.late ? '#C2410C' : '#16A34A') : '#CBD5E1', fontWeight: cs.late ? 800 : 600 }}>{p?.in || '—'}</span>
                          <span className="mar-io-out" style={{ color: p?.out ? '#DC2626' : '#CBD5E1', fontWeight:600 }}>{p?.out || '—'}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="mar-c-sum" style={{ ...tdBase, fontWeight:800, color:'#15803D', background:'#F0FDF4' }}>{rowTotals[idx]?.present ?? 0}</td>
                  <td className="mar-c-sum" style={{ ...tdBase, fontWeight:800, color:'#B91C1C', background:'#FEF2F2' }}>{rowTotals[idx]?.absent ?? 0}</td>
                </tr>
              ))}
            </tbody>
            {/* Total row — day-wise Present/Absent headcount across all
                currently filtered employees, same rules as the KPI strip
                above (holidays/Sundays excluded, Leave/Half-day counted in
                neither). Matches the Muster Roll report's total row. */}
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background:'#F0FDF4', borderTop:'2px solid #BBF7D0' }}>
                  <td colSpan={4} className="mar-c-total-label" style={{ ...tdBase, textAlign:'right', fontWeight:800, color:'#15803D', position:'sticky', left:0, background:'#F0FDF4', zIndex:1 }}>
                    TOTAL PRESENT
                  </td>
                  {dailyTotals.present.map((count, i) => (
                    <td key={i} style={{ ...tdBase, fontWeight:800, color:'#15803D', background:'#F0FDF4' }}>{count}</td>
                  ))}
                  <td className="mar-c-sum" style={{ ...tdBase, fontWeight:800, color:'#15803D', background:'#DCFCE7' }}>{kpis.present}</td>
                  <td className="mar-c-sum" style={{ ...tdBase, background:'#DCFCE7' }} />
                </tr>
                <tr style={{ background:'#FEF2F2', borderTop:'1px solid #FECACA' }}>
                  <td colSpan={4} className="mar-c-total-label" style={{ ...tdBase, textAlign:'right', fontWeight:800, color:'#B91C1C', position:'sticky', left:0, background:'#FEF2F2', zIndex:1 }}>
                    TOTAL ABSENT
                  </td>
                  {dailyTotals.absent.map((count, i) => (
                    <td key={i} style={{ ...tdBase, fontWeight:800, color:'#B91C1C', background:'#FEF2F2' }}>{count}</td>
                  ))}
                  <td className="mar-c-sum" style={{ ...tdBase, background:'#FEE2E2' }} />
                  <td className="mar-c-sum" style={{ ...tdBase, fontWeight:800, color:'#B91C1C', background:'#FEE2E2' }}>{kpis.absent}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
      {!isLoading && rows.length > 0 && <ReportPrintSignature />}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .mar-row:hover td { filter: brightness(0.97); }

        /* One column per day holding both punches: side by side on screen. */
        .mar-io { display:flex; width:100%; }
        .mar-io-in, .mar-io-out {
          flex:1 1 50%; padding:4px 5px; text-align:center; white-space:nowrap;
        }
        .mar-io-out { border-left:1px solid #EEF2F6; }
        /* Present-day status letter — only shown in print (see @media print
           below); on screen the coloured In/Out times already read clearly. */
        .mar-status { display:none; }

        @media print {
          /* Screen scroll box would otherwise clip every row past 68vh. */
          .mar-table-wrap {
            overflow:visible !important; max-height:none !important;
            border:none !important; box-shadow:none !important; border-radius:0 !important;
          }
          /* The grid carries inline min-widths totalling ~2882px. Inline styles
             beat plain stylesheet rules, and browsers clip an over-wide table
             instead of scaling it — so without these !important resets the
             sheet cuts off mid-month no matter how large the paper is. */
          .mar-table {
            width:100% !important; table-layout:fixed !important;
            border-collapse:collapse !important;
          }
          .mar-table thead { display:table-header-group !important; }
          .mar-table tr { page-break-inside:avoid !important; }
          .mar-table th, .mar-table td {
            position:static !important; min-width:0 !important;
            padding:1px 2px !important; font-size:6.5pt !important;
            border:0.5pt solid #4B5563 !important; overflow:hidden !important;
          }
          /* 81mm of fixed columns leaves ~10.4mm per day across A3 landscape. */
          /* Emp IDs are 7 digits — 9mm clipped the last one. */
          .mar-c-emp  { width:13mm !important; }
          .mar-c-name { width:30mm !important; }
          .mar-c-dept { width:17mm !important; }
          .mar-c-co   { width:19mm !important; }
          .mar-c-sum  { width:8mm  !important; }

          /* On screen every column uses a different colour (green In, red
             Out, purple Company, grey placeholders) to carry meaning
             visually — on a black & white/low-toner office printer those
             all render as faint grey and become unreadable. Force solid
             black text everywhere in print instead. Medium weight (500),
             not full bold: bold at this small a print font size, combined
             with the tinted cell backgrounds, previously turned the whole
             sheet into an illegible dark smudge — but plain "normal" (400)
             weight printed too faint to read on office printers, so this
             is the middle ground: dark and legible without smudging. */
          .mar-table th, .mar-table td, .mar-io-in, .mar-io-out, .mar-status {
            color:#000 !important; font-weight:500 !important;
            -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
          }
          .mar-table th { font-weight:700 !important; }

          /* Stack the punches so a day needs one column, not two. */
          .mar-io { display:block !important; }
          .mar-io-in, .mar-io-out {
            display:block !important; padding:0 1px !important;
            font-size:6.5pt !important; line-height:1.25 !important;
          }
          .mar-io-out { border-left:none !important; border-top:0.5pt solid #6B7280 !important; }
          /* Present days had no status letter at all (only A/L/HD did) —
             stack a "P" above In/Out so every cell states its status. */
          .mar-status {
            display:block !important; font-size:6pt !important; line-height:1.1 !important;
            font-weight:700 !important; padding:0 1px !important; border-bottom:0.5pt solid #6B7280 !important;
          }
        }
      `}</style>
    </div>
  );
}
