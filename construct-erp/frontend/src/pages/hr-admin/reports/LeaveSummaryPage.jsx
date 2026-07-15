import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrLeaveAPI, projectAPI } from '../../../api/client';
import { Download, CalendarOff } from 'lucide-react';

const CY = new Date().getFullYear();
const YEARS = [CY-1, CY];

export default function LeaveSummaryPage() {
  const [year, setYear] = useState(CY);
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leave-balances', year, dept],
    queryFn: () => hrLeaveAPI.getBalances({ year, department: dept||undefined, limit:500 }).then(r => r.data?.data || r.data || []),
  });

  const rows = (Array.isArray(data) ? data : []).filter(r =>
    !search || r.employee_name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.includes(search)
  );

  const leaveTypes = rows.length > 0 ? Object.keys(rows[0]).filter(k => !['id','user_id','employee_code','employee_name','department','designation','year'].includes(k)) : [];

  const exportCSV = () => {
    const header = ['Emp ID','Name','Department','Designation',...leaveTypes];
    const csvRows = rows.map(r=>[r.employee_code||'',r.employee_name||'',r.department||'',r.designation||'',...leaveTypes.map(lt=>r[lt]??'-')]);
    const csv=[header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`leave-summary-${year}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <CalendarOff size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Leave Summary</h1>
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
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No leave data found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Emp ID</th>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Name</th>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Department</th>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Designation</th>
                {leaveTypes.map(lt=>(
                  <th key={lt} style={{ padding:'9px 10px', textAlign:'center', fontWeight:700, color:'#7C3AED', whiteSpace:'nowrap' }}>{lt.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'8px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.employee_code||'-'}</td>
                  <td style={{ padding:'8px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.employee_name||'-'}</td>
                  <td style={{ padding:'8px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                  <td style={{ padding:'8px 12px', color:'#64748B' }}>{r.designation||'-'}</td>
                  {leaveTypes.map(lt=>{
                    const val = r[lt];
                    const isBalance = typeof val === 'object' && val !== null;
                    const avail = isBalance ? (val.available??val.balance??'-') : val??'-';
                    const used  = isBalance ? (val.used??val.taken??'-') : null;
                    return (
                      <td key={lt} style={{ padding:'8px 10px', textAlign:'center' }}>
                        <span style={{ fontWeight:700, color: +avail>0?'#065F46':'#94A3B8' }}>{avail}</span>
                        {used !== null && <span style={{ color:'#94A3B8', fontSize:11 }}> / {used}</span>}
                      </td>
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
