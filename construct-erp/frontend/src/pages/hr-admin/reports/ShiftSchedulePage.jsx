import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrEmployeesAPI } from '../../../api/client';
import { Download, Clock } from 'lucide-react';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const SHIFT_COLORS = {
  'General':  { bg:'#DBEAFE', color:'#1E40AF' },
  'Morning':  { bg:'#D1FAE5', color:'#065F46' },
  'Evening':  { bg:'#FEF3C7', color:'#92400E' },
  'Night':    { bg:'#EDE9FE', color:'#5B21B6' },
  'Off':      { bg:'#F1F5F9', color:'#94A3B8' },
};

function ShiftBadge({ shift }) {
  const { bg, color } = SHIFT_COLORS[shift] || { bg:'#F1F5F9', color:'#64748B' };
  return <span style={{ background:bg, color, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{shift||'—'}</span>;
}

export default function ShiftSchedulePage() {
  const [dept, setDept]     = useState('');
  const [search, setSearch] = useState('');
  const [weekOf, setWeekOf] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().slice(0,10);
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees-shifts', dept],
    queryFn: () => hrEmployeesAPI.list({ limit:500, department:dept||undefined }).then(r => r.data?.data || r.data?.employees || r.data || []),
  });

  const rows = (Array.isArray(data) ? data : []).filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.includes(search)
  );

  const exportCSV = () => {
    const header = ['Emp Code','Name','Department','Shift',...DAYS];
    const csvRows = rows.map(r=>[r.employee_code||'',r.name||'',r.department||'',r.shift_name||r.shift||'General',...DAYS.map(()=>r.shift_name||r.shift||'General')]);
    const csv=[header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`shift-schedule-${weekOf}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Clock size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Employee Shift Scheduler</h1>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:12, color:'#64748B' }}>Week of</label>
          <input type="date" value={weekOf} onChange={e=>setWeekOf(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 8px', fontSize:13 }} />
        </div>
        <input value={dept} onChange={e=>setDept(e.target.value)} placeholder="Filter by department..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No employees found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Emp Code</th>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Name</th>
                <th style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569' }}>Department</th>
                <th style={{ padding:'9px 12px', textAlign:'center', fontWeight:700, color:'#475569' }}>Shift</th>
                {DAYS.map(d=>(
                  <th key={d} style={{ padding:'9px 10px', textAlign:'center', fontWeight:700, color:'#7C3AED', minWidth:48 }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const shift = r.shift_name || r.shift || 'General';
                const offDay = r.week_off || 'Sun';
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.employee_code||'-'}</td>
                    <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
                    <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                    <td style={{ padding:'7px 12px', textAlign:'center' }}><ShiftBadge shift={shift}/></td>
                    {DAYS.map(d=>(
                      <td key={d} style={{ padding:'5px 10px', textAlign:'center' }}>
                        <ShiftBadge shift={d===offDay?'Off':shift} />
                      </td>
                    ))}
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
