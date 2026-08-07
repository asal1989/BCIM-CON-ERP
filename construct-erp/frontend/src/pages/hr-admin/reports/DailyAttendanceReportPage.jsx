import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Printer, ClipboardList, AlertTriangle } from 'lucide-react';
import { ReportPrintSignature } from '../../../components/reports/ReportPrintKit';

const today     = () => new Date().toISOString().slice(0,10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };
const daysAgo   = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); };

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const fmtDateShort = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Guards against an accidental huge range firing dozens of parallel
// single-day queries — the backend has no range-native endpoint, so a
// multi-date report is N requests, one per date.
const MAX_RANGE_DAYS = 31;

// Local-calendar formatting, not d.toISOString().slice(0,10) — toISOString
// converts to UTC first, which silently shifts every date back by one day
// for any positive UTC offset (IST is +5:30), turning a same-day "range" of
// 29 Jul into 28 Jul for every user in India.
function toISODateLocal(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function dateRange(from, to) {
  const out = [];
  let d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) { out.push(toISODateLocal(d)); d.setDate(d.getDate()+1); }
  return out;
}

const S_COLOR = { present:'#D1FAE5/#065F46', absent:'#FEE2E2/#991B1B', leave:'#FEF3C7/#92400E', half_day:'#DBEAFE/#1E40AF', holiday:'#EDE9FE/#5B21B6' };
function Pill({ s }) {
  const [bg,c] = (S_COLOR[(s||'absent').toLowerCase()]||'#F1F5F9/#475569').split('/');
  return <span style={{ background:bg, color:c, borderRadius:3, padding:'1px 7px', fontWeight:700, fontSize:10, letterSpacing:0.4 }}>{(s||'A').charAt(0).toUpperCase()}</span>;
}

// One project's employee table for a given day — shared by the single-day
// view (projectGroups) and each date section of the multi-date range view
// (dateGroups[].projGroups), so the two never drift out of visual sync.
function ProjectTable({ projName, pRows }) {
  const pPresent = pRows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='present').length;
  const pAbsent  = pRows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='absent').length;
  const isHO = projName === 'Head Office';
  return (
    <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'9px 14px', background: isHO ? '#EEF2FF' : '#F5F3FF',
        borderBottom:'1px solid #E2E8F0', borderRadius:'8px 8px 0 0',
      }}>
        <span style={{ fontWeight:800, fontSize:13, color: isHO ? '#3730A3' : '#5B21B6' }}>
          {isHO ? '🏢 ' : '📍 '}{projName}
        </span>
        <span style={{ fontSize:11.5, color:'#64748B', fontWeight:600 }}>
          {pRows.length} total &nbsp;·&nbsp; <span style={{ color:'#059669' }}>{pPresent} present</span> &nbsp;·&nbsp; <span style={{ color:'#DC2626' }}>{pAbsent} absent</span>
        </span>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
            {['#','Emp ID','Name','Designation','Department','Status','In Time','Out Time','Late (min)'].map(h=>(
              <th key={h} style={{ padding:'9px 12px', textAlign: ['In Time','Out Time','Late (min)','Status'].includes(h)?'center':'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pRows.map((r,i)=>(
            <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
              <td style={{ padding:'7px 12px', color:'#94A3B8', fontSize:11 }}>{i+1}</td>
              <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.emp_id||'-'}</td>
              <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
              <td style={{ padding:'7px 12px', color:'#0F172A', fontWeight:600 }}>{r.designation||'-'}</td>
              <td style={{ padding:'7px 12px', color:'#0F172A', fontWeight:600 }}>{r.department||'-'}</td>
              <td style={{ padding:'7px 12px', textAlign:'center' }}><Pill s={r.attendance_status||r.status} /></td>
              <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.in_time||'-'}</td>
              <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.out_time||'-'}</td>
              <td style={{ padding:'7px 12px', textAlign:'center', color:(r.late_minutes||0)>0?'#DC2626':'#94A3B8', fontWeight:(r.late_minutes||0)>0?700:400 }}>{r.late_minutes||0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body {
    margin:0 !important; padding:0 !important; background:#fff !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  nav, header, footer, aside,
  .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"],
  [class*="topbar"], [class*="Topbar"],
  [class*="navbar"], [class*="Navbar"] {
    display:none !important; width:0 !important; height:0 !important; overflow:hidden !important;
  }
  .print-only { display:block !important; }
  #dar-print-root { padding:0 !important; }
  #dar-table-wrap { overflow:visible !important; border:none !important; }
  #dar-table-wrap table { font-size:10px !important; }
  #dar-table-wrap th { background:#1B3A6B !important; color:#fff !important; }
  .dar-sig-section, .report-sig-section { page-break-inside:avoid !important; margin-top:28px !important; }
}
@media screen {
  .print-only { display:none !important; }
}
`;

export default function DailyAttendanceReportPage() {
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo]     = useState(today());
  const [project, setProject]   = useState('');
  const [category, setCategory] = useState('');

  const isRange = dateFrom !== dateTo;
  const rangeDates = useMemo(() => dateFrom && dateTo && dateFrom <= dateTo ? dateRange(dateFrom, dateTo) : [], [dateFrom, dateTo]);
  const rangeTooLong = rangeDates.length > MAX_RANGE_DAYS;
  const setSingleDate = (d) => { setDateFrom(d); setDateTo(d); };

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  // No range-native endpoint on the backend — fetch each date in the range
  // in parallel via the existing single-day query, then flatten. Each row
  // gets its source date attached so the range view can group by day.
  const { data: reportData, isLoading } = useQuery({
    queryKey: ['daily-att-report', dateFrom, dateTo, project, category],
    enabled: rangeDates.length > 0 && !rangeTooLong,
    queryFn: async () => {
      const results = await Promise.all(rangeDates.map(d =>
        hrAttendanceAPI.timesheetReport({ date: d, project_id: project || undefined, category: category || undefined })
          .then(r => ({ date: d, body: r.data || {} }))
      ));
      const rows = results.flatMap(({ date, body }) => {
        const dRows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        return dRows.map(r => ({ ...r, report_date: date }));
      });
      const last = results[results.length - 1]?.body || {};
      return { data: rows, companyName: last.companyName, projectName: last.projectName };
    },
  });

  const rows = reportData?.data || [];
  const companyName = reportData?.companyName || 'BCIM ENGINEERING PRIVATE LIMITED';
  const projectName = reportData?.projectName || (project ? (projects||[]).find(p=>p.id===project)?.name : '') || '';
  const present  = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='present').length;
  const absent   = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='absent').length;
  const leave    = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='leave').length;
  const half     = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='half_day').length;
  const lateRows = rows.filter(r=>(r.late_minutes||0)>0).sort((a,b)=>(b.late_minutes||0)-(a.late_minutes||0));
  const totalLate = lateRows.reduce((s,r)=>s+(r.late_minutes||0),0);
  const avgLate  = lateRows.length>0 ? Math.round(totalLate/lateRows.length) : 0;

  // Group rows by project (Head Office included as its own group) so a
  // single-day report reads as one section per project.
  const projectGroups = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const key = r.project_name || 'Head Office';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Head Office') return 1;
      if (b === 'Head Office') return -1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // For a multi-date range, date is the primary organising dimension —
  // each date gets its own section, with project sub-groups inside it.
  const dateGroups = useMemo(() => {
    if (!isRange) return [];
    const byDate = new Map();
    rows.forEach(r => {
      const key = r.report_date;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(r);
    });
    return rangeDates
      .filter(d => byDate.has(d))
      .map(d => {
        const dRows = byDate.get(d);
        const byProj = new Map();
        dRows.forEach(r => {
          const key = r.project_name || 'Head Office';
          if (!byProj.has(key)) byProj.set(key, []);
          byProj.get(key).push(r);
        });
        const projGroups = [...byProj.entries()].sort(([a], [b]) => {
          if (a === 'Head Office') return 1;
          if (b === 'Head Office') return -1;
          return a.localeCompare(b);
        });
        return { date: d, rows: dRows, projGroups };
      });
  }, [isRange, rows, rangeDates]);

  const exportCSV = () => {
    const header = ['Date','Project','Emp ID','Name','Designation','Department','Status','In Time','Out Time','Late (min)','Source'];
    const csvRows = rows.map(r=>[r.report_date||dateFrom,r.project_name||'Head Office',r.emp_id||'',r.name||'',r.designation||'',r.department||'',r.attendance_status||r.status||'',r.in_time||'',r.out_time||'',r.late_minutes||0,r.source||'']);
    const csv = [header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = isRange ? `daily-attendance-${dateFrom}_to_${dateTo}.csv` : `daily-attendance-${dateFrom}.csv`;
    a.click();
  };

  return (
    <div id="dar-print-root" className="p-4">
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <ClipboardList size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Daily Attendance Report</h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>window.print()} style={{ display:'flex', alignItems:'center', gap:6, background:'#F1F5F9', color:'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:13 }}>
            <Printer size={14}/> Print
          </button>
          <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            <Download size={14}/> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="no-print" style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:11, color:'#64748B', fontWeight:700 }}>From</label>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e=>setDateFrom(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
          <label style={{ fontSize:11, color:'#64748B', fontWeight:700 }}>To</label>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e=>setDateTo(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setSingleDate(yesterday())} style={{ background: (dateFrom===yesterday()&&dateTo===yesterday())?'#7C3AED':'#F1F5F9', color: (dateFrom===yesterday()&&dateTo===yesterday())?'#fff':'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Yesterday</button>
          <button onClick={()=>setSingleDate(today())} style={{ background: (dateFrom===today()&&dateTo===today())?'#7C3AED':'#F1F5F9', color: (dateFrom===today()&&dateTo===today())?'#fff':'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Today</button>
          <button onClick={()=>{ setDateFrom(daysAgo(6)); setDateTo(today()); }} style={{ background:'#F1F5F9', color:'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Last 7 Days</button>
          <button onClick={()=>{ setDateFrom(monthStart()); setDateTo(today()); }} style={{ background:'#F1F5F9', color:'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>This Month</button>
        </div>
        <select value={project} onChange={e=>setProject(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value=''>All Projects</option>
          {(projects||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={category} onChange={e=>setCategory(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value=''>All Categories</option>
          <option value='staff'>Staff</option>
          <option value='labour'>Labour / SC Workers</option>
        </select>
      </div>

      {rangeTooLong && (
        <div className="no-print" style={{ display:'flex', alignItems:'center', gap:8, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', marginBottom:14, color:'#991B1B', fontSize:13 }}>
          <AlertTriangle size={16}/> Range is {rangeDates.length} days — please pick {MAX_RANGE_DAYS} days or fewer (each day is fetched individually).
        </div>
      )}

      {/* Print letterhead */}
      <div className="print-only" style={{ borderBottom: '3px solid #1B3A6B', paddingBottom: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/bcim-logo.png" alt="BCIM Logo" style={{ height: 54, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
              {companyName}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1B3A6B', letterSpacing: 0.5, margin: '2px 0' }}>
              DAILY ATTENDANCE REPORT
            </div>
            <div style={{ fontSize: 9, color: '#444' }}>
              {projectName ? <>Project: <strong>{projectName}</strong>&emsp;|&emsp;</> : null}
              {isRange
                ? <>Period: <strong>{fmtDateShort(dateFrom)} – {fmtDateShort(dateTo)}</strong> ({rangeDates.length} days)&emsp;|&emsp;</>
                : <>Date: <strong>{fmtDate(dateFrom)}</strong>&emsp;|&emsp;</>}
              Category: <strong>{category === 'staff' ? 'STAFF' : category === 'labour' ? 'LABOUR / SC WORKERS' : 'ALL'}</strong>
            </div>
          </div>
          <table style={{ border: '1px solid #1B3A6B', borderCollapse: 'collapse', fontSize: 8, flexShrink: 0 }}>
            <tbody>
              {[['Total', rows.length], ['Present', present], ['Absent', absent], ['Leave', leave], ['Half Day', half]].map(([l,v]) => (
                <tr key={l}>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #ccc', borderRight: '1px solid #ccc', fontWeight: 600 }}>{l}</td>
                  <td style={{ padding: '3px 10px', borderBottom: '1px solid #ccc', textAlign: 'center', fontWeight: 700, color: '#1B3A6B' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary cards */}
      <div className="no-print" style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        {[['Present', present, '#D1FAE5','#065F46'], ['Absent', absent, '#FEE2E2','#991B1B'], ['On Leave', leave, '#FEF3C7','#92400E'], ['Half Day', half, '#DBEAFE','#1E40AF'], ['Total', rows.length, '#F1F5F9','#475569']].map(([l,v,bg,c])=>(
          <div key={l} style={{ background:bg, borderRadius:8, padding:'10px 18px', minWidth:90, textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:22, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:c, fontWeight:600 }}>{l}</div>
          </div>
        ))}
        {lateRows.length > 0 && (
          <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8, padding:'10px 16px', minWidth:160 }}>
            <div style={{ fontWeight:800, fontSize:18, color:'#C2410C' }}>{lateRows.length} Late</div>
            <div style={{ fontSize:11, color:'#C2410C', fontWeight:600 }}>Avg {avgLate} min · Total {totalLate} min</div>
            <div style={{ marginTop:6, fontSize:10, color:'#92400E', maxHeight:48, overflowY:'auto' }}>
              {lateRows.slice(0,5).map((r,i)=>(
                <div key={i}>{r.name} — {r.late_minutes}m</div>
              ))}
              {lateRows.length>5 && <div>+{lateRows.length-5} more...</div>}
            </div>
          </div>
        )}
      </div>

      <div id="dar-table-wrap" style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>Loading{isRange ? ` ${rangeDates.length} days` : ''}...</div>
        ) : rangeTooLong ? null
        : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
            No attendance data for {isRange ? `${fmtDateShort(dateFrom)} – ${fmtDateShort(dateTo)}` : dateFrom}
          </div>
        ) : isRange ? (
          dateGroups.map(({ date: d, rows: dRows, projGroups }) => {
            const dPresent = dRows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='present').length;
            const dAbsent  = dRows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='absent').length;
            return (
              <div key={d} style={{ border:'1px solid #DDD6FE', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#5B21B6' }}>
                  <span style={{ fontWeight:800, fontSize:13, color:'#fff' }}>📅 {fmtDate(d)}</span>
                  <span style={{ fontSize:11.5, color:'#DDD6FE', fontWeight:600 }}>
                    {dRows.length} total &nbsp;·&nbsp; <span style={{ color:'#A7F3D0' }}>{dPresent} present</span> &nbsp;·&nbsp; <span style={{ color:'#FECACA' }}>{dAbsent} absent</span>
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10, padding:10, background:'#FAF5FF' }}>
                  {projGroups.map(([projName, pRows]) => (
                    <ProjectTable key={projName} projName={projName} pRows={pRows} />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          projectGroups.map(([projName, pRows]) => (
            <ProjectTable key={projName} projName={projName} pRows={pRows} />
          ))
        )}
      </div>

      {/* Signature section (print only) */}
      <ReportPrintSignature companyName={companyName} />
    </div>
  );
}
