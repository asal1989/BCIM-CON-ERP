import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, hrEmployeesAPI, scAPI } from '../../../api/client';
import { Download, CalendarDays } from 'lucide-react';

const CY = new Date().getFullYear();
const YEARS = [CY-2, CY-1, CY];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function YearlySummaryPage() {
  const [year, setYear] = useState(CY);
  const [dept, setDept] = useState('');

  const { data: staffEmps, isLoading: loadingEmps } = useQuery({
    queryKey: ['employees-yearly', year, dept],
    queryFn: () => hrEmployeesAPI.list({ limit: 500, department: dept||undefined }).then(r => r.data?.data || r.data?.employees || r.data || []),
  });

  const { data: scWorkers, isLoading: loadingSC } = useQuery({
    queryKey: ['sc-workers-yearly', year],
    queryFn: () => scAPI.listWorkers({ limit: 1000, status: 'active' }).then(r => r.data?.data || r.data || []),
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['attendance-summary-yearly', year],
    queryFn: () => hrAttendanceAPI.yearlySummary({ year }).then(r => r.data?.data || r.data || {}),
  });

  // Merge staff + SC workers into one list
  const emps = [
    ...(staffEmps||[]).map(e => ({ employee_code: e.employee_code||e.id, name: e.name, department: e.department||e.department_name||'', designation: e.designation||'', type:'staff' })),
    ...(scWorkers||[]).map(w => ({ employee_code: w.worker_code, name: w.worker_name, department: w.sc_name||'SC Workers', designation: w.skill_type||'', type:'labour' })),
  ];

  const isLoading = loadingEmps || loadingSC || loadingSummary;

  const exportCSV = () => {
    const header = ['Emp ID','Name','Department','Designation',...MONTHS,'Total P','Total A','Total L','%Attendance'];
    const rows = (emps||[]).map(e => {
      const mData = summary?.[e.employee_code||e.id] || {};
      const monthVals = MONTHS.map((_,i)=>mData[i+1]?.present||0);
      const totalP = monthVals.reduce((a,b)=>a+b,0);
      const totalA = MONTHS.reduce((s,_,i)=>(mData[i+1]?.absent||0)+s,0);
      const totalL = MONTHS.reduce((s,_,i)=>(mData[i+1]?.leave||0)+s,0);
      const pct = totalP+totalA>0 ? ((totalP/(totalP+totalA))*100).toFixed(1)+'%' : '-';
      return [e.employee_code||'', e.name||'', e.department||'', e.designation||'', ...monthVals, totalP, totalA, totalL, pct];
    });
    const csv = [header,...rows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`yearly-summary-${year}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <CalendarDays size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Yearly Attendance Summary</h1>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <select value={year} onChange={e=>setYear(+e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <input value={dept} onChange={e=>setDept(e.target.value)} placeholder="Filter by department..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : (emps||[]).length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No employees found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>Emp ID</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>Name</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#475569' }}>Dept</th>
                {MONTHS.map(m=>(
                  <th key={m} style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#7C3AED', minWidth:36 }}>{m}</th>
                ))}
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>Total P</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FEE2E2' }}>Total A</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FEF3C7' }}>Total L</th>
                <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#0F766E', background:'#CCFBF1' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {(emps||[]).map((e,idx)=>{
                const mData = summary?.[e.employee_code||e.id]||{};
                const monthVals = MONTHS.map((_,i)=>mData[i+1]?.present||0);
                const totalP = monthVals.reduce((a,b)=>a+b,0);
                const totalA = MONTHS.reduce((s,_,i)=>(mData[i+1]?.absent||0)+s,0);
                const totalL = MONTHS.reduce((s,_,i)=>(mData[i+1]?.leave||0)+s,0);
                const pct = totalP+totalA>0?((totalP/(totalP+totalA))*100).toFixed(0)+'%':'-';
                return (
                  <tr key={idx} style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <td style={{ padding:'6px 10px', color:'#64748B', fontFamily:'monospace' }}>{e.employee_code||'-'}</td>
                    <td style={{ padding:'6px 10px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{e.name}</td>
                    <td style={{ padding:'6px 10px', color:'#64748B' }}>{e.department||'-'}</td>
                    {monthVals.map((v,i)=>(
                      <td key={i} style={{ padding:'5px 8px', textAlign:'center', color: v>0?'#065F46':'#CBD5E1', fontWeight: v>0?700:400 }}>{v||'-'}</td>
                    ))}
                    <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#065F46', background:'#F0FDF4' }}>{totalP}</td>
                    <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#991B1B', background:'#FFF1F2' }}>{totalA}</td>
                    <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#92400E', background:'#FFFBEB' }}>{totalL}</td>
                    <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#0F766E', background:'#F0FDFA' }}>{pct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
