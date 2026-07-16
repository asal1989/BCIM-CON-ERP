import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Building2 } from 'lucide-react';

const today = () => new Date().toISOString().slice(0,10);
const firstOfMonth = () => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); };

export default function DepartmentSummaryPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [project, setProject] = useState('');

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const { data, isLoading } = useQuery({
    queryKey: ['dept-summary', from, to, project],
    queryFn:  () => hrAttendanceAPI.deptSummary({ from, to, project_id: project||undefined }).then(r => r.data?.data || r.data || []),
  });

  const rows = Array.isArray(data) ? data : Object.entries(data||{}).map(([dept,v])=>({ department:dept, ...v }));

  const total = rows.reduce((acc,r)=>({ present:(acc.present||0)+(r.present||0), absent:(acc.absent||0)+(r.absent||0), leave:(acc.leave||0)+(r.leave||0), half_day:(acc.half_day||0)+(r.half_day||0), total:(acc.total||0)+(r.total||0) }),{});

  const exportCSV = () => {
    const header = ['Department','Present','Absent','Leave','Half Day','Total','% Attendance'];
    const csvRows = rows.map(r=>{
      const t=(r.present||0)+(r.absent||0)+(r.leave||0)+(r.half_day||0);
      const pct=t>0?(((r.present||0)/t)*100).toFixed(1)+'%':'-';
      return [r.department||'',r.present||0,r.absent||0,r.leave||0,r.half_day||0,r.total||t,pct];
    });
    const csv=[header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`dept-summary-${from}-${to}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Building2 size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Department Attendance Summary</h1>
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

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No data for selected period</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['Department','Present','Absent','Leave','Half Day','Total','% Attendance'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign: h==='Department'?'left':'center', fontWeight:700, color:'#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const t=(r.present||0)+(r.absent||0)+(r.leave||0)+(r.half_day||0);
                const pct=t>0?(((r.present||0)/t)*100).toFixed(1)+'%':'-';
                const pctNum=t>0?(r.present||0)/t*100:0;
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:'#1E293B' }}>{r.department||'-'}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#F0FDF4' }}>{r.present||0}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FFF1F2' }}>{r.absent||0}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FFFBEB' }}>{r.leave||0}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#1E40AF', background:'#EFF6FF' }}>{r.half_day||0}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center', color:'#475569' }}>{r.total||t}</td>
                    <td style={{ padding:'10px 14px', textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                        <div style={{ background:'#E2E8F0', borderRadius:4, width:60, height:6, overflow:'hidden' }}>
                          <div style={{ width:`${pctNum}%`, height:'100%', background: pctNum>=80?'#10B981':pctNum>=60?'#F59E0B':'#EF4444', borderRadius:4 }} />
                        </div>
                        <span style={{ fontWeight:700, color: pctNum>=80?'#065F46':pctNum>=60?'#92400E':'#991B1B' }}>{pct}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#F8FAFC', borderTop:'2px solid #E2E8F0' }}>
                <td style={{ padding:'10px 14px', fontWeight:700, color:'#475569' }}>TOTAL</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#065F46' }}>{total.present||0}</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#991B1B' }}>{total.absent||0}</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#92400E' }}>{total.leave||0}</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#1E40AF' }}>{total.half_day||0}</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#475569' }}>{total.total||0}</td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'#0F766E' }}>
                  {total.total>0?(((total.present||0)/total.total)*100).toFixed(1)+'%':'-'}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
