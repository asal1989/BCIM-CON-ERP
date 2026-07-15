import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, FileBarChart } from 'lucide-react';

const today = () => new Date().toISOString().slice(0,10);
const firstOfMonth = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); };

export default function AttendanceSummaryPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to,   setTo]   = useState(today());
  const [project, setProject] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-summary', from, to, project],
    queryFn:  () => hrAttendanceAPI.summary({ from, to, project_id: project||undefined }).then(r => r.data?.data || r.data || {}),
  });

  const rows = Array.isArray(data) ? data : Object.entries(data||{}).map(([k,v])=>({ label:k, ...v }));

  const exportCSV = () => {
    const header = ['Category','Present','Absent','Leave','Half Day','Total','% Present'];
    const csvRows = rows.map(r=>[r.label||r.department||r.name||'',r.present||0,r.absent||0,r.leave||0,r.half_day||0,r.total||0,r.attendance_pct||'-']);
    const csv = [header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`attendance-summary-${from}-${to}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <FileBarChart size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Attendance Summary Report</h1>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:12, color:'#64748B' }}>From</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 8px', fontSize:13 }} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:12, color:'#64748B' }}>To</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 8px', fontSize:13 }} />
        </div>
        <select value={project} onChange={e=>setProject(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value=''>All Projects</option>
          {(projects||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
          No summary data for the selected period
        </div>
      ) : (
        <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['Category','Present','Absent','Leave','Half Day','Total','% Present'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign: h==='Category'?'left':'center', fontWeight:700, color:'#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const total = (r.present||0)+(r.absent||0)+(r.leave||0)+(r.half_day||0);
                const pct = total>0?(((r.present||0)/total)*100).toFixed(1)+'%':'-';
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#1E293B' }}>{r.label||r.department||r.name||'-'}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#F0FDF4' }}>{r.present||0}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FFF1F2' }}>{r.absent||0}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FFFBEB' }}>{r.leave||0}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#1E40AF', background:'#EFF6FF' }}>{r.half_day||0}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', color:'#475569' }}>{total}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#0F766E' }}>{r.attendance_pct||pct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
