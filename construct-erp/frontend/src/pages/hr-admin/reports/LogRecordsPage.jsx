import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, ScrollText } from 'lucide-react';

const today = () => new Date().toISOString().slice(0,10);

const STATUS_BADGE = { present:'#D1FAE5/#065F46', absent:'#FEE2E2/#991B1B', leave:'#FEF3C7/#92400E', half_day:'#DBEAFE/#1E40AF', holiday:'#EDE9FE/#5B21B6', late:'#FDE8D8/#9A3412' };

function Badge({ status }) {
  const key = (status||'absent').toLowerCase();
  const [bg,color] = (STATUS_BADGE[key]||'#F1F5F9/#475569').split('/');
  return <span style={{ background:bg, color, borderRadius:3, padding:'1px 7px', fontWeight:700, fontSize:10, letterSpacing:0.4, display:'inline-block' }}>{key.toUpperCase()}</span>;
}

const SOURCE_LABEL = { essl_agent:'ESSL', essl:'ESSL', manual:'Manual', regularization:'Regularization', bulk:'Bulk' };

export default function LogRecordsPage() {
  const [from, setFrom] = useState(today());
  const [to,   setTo]   = useState(today());
  const [project, setProject] = useState('');
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 100;

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-log', from, to, project, dept, page],
    queryFn: () => hrAttendanceAPI.list({ from, to, project_id: project||undefined, department: dept||undefined, page, limit }).then(r => r.data || {}),
  });

  const rows = (Array.isArray(data) ? data : data?.data || data?.records || [])
    .filter(r => !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.includes(search));

  const exportCSV = () => {
    const header = ['Emp Code','Name','Department','Designation','Date','Status','In Time','Out Time','Late Min','Source','Remarks'];
    const csvRows = rows.map(r=>[r.employee_code||'',r.name||'',r.department||'',r.designation||'',r.attendance_date||r.date||'',r.status||'',r.in_time||'',r.out_time||'',r.late_minutes||0,SOURCE_LABEL[r.source]||r.source||'',r.remarks||'']);
    const csv=[header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`log-records-${from}-${to}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <ScrollText size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Attendance Log Records</h1>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:12, color:'#64748B' }}>From</label>
          <input type="date" value={from} onChange={e=>{ setFrom(e.target.value); setPage(1); }} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 8px', fontSize:13 }} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:12, color:'#64748B' }}>To</label>
          <input type="date" value={to} onChange={e=>{ setTo(e.target.value); setPage(1); }} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 8px', fontSize:13 }} />
        </div>
        <select value={project} onChange={e=>{ setProject(e.target.value); setPage(1); }} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value=''>All Projects</option>
          {(projects||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={dept} onChange={e=>setDept(e.target.value)} placeholder="Department..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No log records found for selected date range</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['Emp Code','Name','Department','Date','Status','In Time','Out Time','Late (min)','Source'].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign: h==='Emp Code'||h==='Name'||h==='Department'?'left':'center', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.employee_code||r.emp_id||'-'}</td>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#64748B', whiteSpace:'nowrap' }}>{r.attendance_date||r.date||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}><Badge status={r.status||r.attendance_status} /></td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.in_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace' }}>{r.out_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color: (r.late_minutes||0)>0?'#DC2626':'#94A3B8', fontWeight:(r.late_minutes||0)>0?700:400 }}>{r.late_minutes||0}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}>
                    <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:4, padding:'2px 7px', fontSize:10, fontWeight:600 }}>
                      {SOURCE_LABEL[r.source]||r.source||'-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ padding:'5px 12px', border:'1px solid #CBD5E1', borderRadius:6, background: page===1?'#F8FAFC':'#fff', cursor: page===1?'default':'pointer', fontSize:12 }}>← Prev</button>
          <span style={{ padding:'5px 8px', fontSize:12, color:'#64748B' }}>Page {page}</span>
          <button onClick={()=>setPage(p=>p+1)} disabled={rows.length < limit} style={{ padding:'5px 12px', border:'1px solid #CBD5E1', borderRadius:6, background: rows.length<limit?'#F8FAFC':'#fff', cursor: rows.length<limit?'default':'pointer', fontSize:12 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
