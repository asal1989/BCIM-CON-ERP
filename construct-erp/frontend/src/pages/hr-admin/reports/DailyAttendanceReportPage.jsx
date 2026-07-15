import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Printer, ClipboardList } from 'lucide-react';

const today     = () => new Date().toISOString().slice(0,10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };

const S_COLOR = { present:'#D1FAE5/#065F46', absent:'#FEE2E2/#991B1B', leave:'#FEF3C7/#92400E', half_day:'#DBEAFE/#1E40AF', holiday:'#EDE9FE/#5B21B6' };
function Pill({ s }) {
  const [bg,c] = (S_COLOR[(s||'absent').toLowerCase()]||'#F1F5F9/#475569').split('/');
  return <span style={{ background:bg, color:c, borderRadius:3, padding:'1px 7px', fontWeight:700, fontSize:10, letterSpacing:0.4 }}>{(s||'A').charAt(0).toUpperCase()}</span>;
}

export default function DailyAttendanceReportPage() {
  const [date, setDate]         = useState(today());
  const [project, setProject]   = useState('');
  const [category, setCategory] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const { data, isLoading } = useQuery({
    queryKey: ['daily-att-report', date, project, category],
    queryFn:  () => hrAttendanceAPI.timesheetReport({ date, project_id:project||undefined, category:category||undefined })
                    .then(r => r.data?.data || r.data || []),
  });

  const rows = Array.isArray(data) ? data : [];
  const present  = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='present').length;
  const absent   = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='absent').length;
  const leave    = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='leave').length;
  const half     = rows.filter(r=>(r.attendance_status||r.status||'').toLowerCase()==='half_day').length;
  const lateRows = rows.filter(r=>(r.late_minutes||0)>0).sort((a,b)=>(b.late_minutes||0)-(a.late_minutes||0));
  const totalLate = lateRows.reduce((s,r)=>s+(r.late_minutes||0),0);
  const avgLate  = lateRows.length>0 ? Math.round(totalLate/lateRows.length) : 0;

  const exportCSV = () => {
    const header = ['Emp ID','Name','Designation','Department','Status','In Time','Out Time','Late (min)','Source'];
    const csvRows = rows.map(r=>[r.emp_id||'',r.name||'',r.designation||'',r.department||'',r.attendance_status||r.status||'',r.in_time||'',r.out_time||'',r.late_minutes||0,r.source||'']);
    const csv = [header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`daily-attendance-${date}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
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
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <button onClick={()=>setDate(yesterday())} style={{ background: date===yesterday()?'#7C3AED':'#F1F5F9', color: date===yesterday()?'#fff':'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Yesterday</button>
        <button onClick={()=>setDate(today())} style={{ background: date===today()?'#7C3AED':'#F1F5F9', color: date===today()?'#fff':'#475569', border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Today</button>
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

      {/* Summary cards */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
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

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No attendance data for {date}</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['#','Emp ID','Name','Designation','Department','Status','In Time','Out Time','Late (min)'].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign: ['In Time','Out Time','Late (min)','Status'].includes(h)?'center':'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'7px 12px', color:'#94A3B8', fontSize:11 }}>{i+1}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.emp_id||'-'}</td>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.designation||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}><Pill s={r.attendance_status||r.status} /></td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.in_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.out_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:(r.late_minutes||0)>0?'#DC2626':'#94A3B8', fontWeight:(r.late_minutes||0)>0?700:400 }}>{r.late_minutes||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
