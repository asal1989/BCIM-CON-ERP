import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrEsslAPI } from '../../../api/client';
import { Download, ScrollText } from 'lucide-react';

const today = () => new Date().toISOString().slice(0,10);
const DIR_BADGE = { in: ['#D1FAE5','#065F46','IN'], out: ['#FEE2E2','#991B1B','OUT'] };

function DirBadge({ dir }) {
  const [bg, color, label] = DIR_BADGE[(dir||'').toLowerCase()] || ['#F1F5F9','#475569', dir||'-'];
  return <span style={{ background:bg, color, borderRadius:3, padding:'1px 8px', fontWeight:700, fontSize:10, letterSpacing:0.5 }}>{label}</span>;
}

const SOURCE_LABEL = { agent:'Agent', manual_sync:'Manual Sync', essl:'ESSL', essl_agent:'Agent' };

export default function LogRecordsPage() {
  const [from,   setFrom]   = useState(today());
  const [to,     setTo]     = useState(today());
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const limit = 200;

  const { data, isLoading } = useQuery({
    queryKey: ['essl-device-logs', from, to, search, page],
    queryFn:  () => hrEsslAPI.deviceLogs({ from, to, search: search||undefined, limit, page }).then(r => r.data || {}),
    keepPreviousData: true,
  });

  const rows = data?.data || [];

  const exportCSV = () => {
    const header = ['Emp Code','Name','Department','Designation','Swipe Time','Direction','Source'];
    const csvRows = rows.map(r => [
      r.emp_code||'', r.employee_name||'', r.department_name||'', r.designation||'',
      r.swipe_time ? new Date(r.swipe_time).toLocaleString() : '',
      r.direction||'', SOURCE_LABEL[r.source]||r.source||'',
    ]);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `device-logs-${from}-${to}.csv`;
    a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <ScrollText size={22} style={{ color:'#7C3AED' }} />
          <div>
            <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Device Log Records</h1>
            <p style={{ fontSize:11, color:'#94A3B8', margin:0 }}>Raw biometric swipes from ESSL — stored in Postgres</p>
          </div>
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
        <input
          value={search} onChange={e=>{ setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or emp code..."
          style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13, minWidth:200 }}
        />
        {rows.length > 0 && (
          <span style={{ display:'flex', alignItems:'center', fontSize:12, color:'#64748B' }}>
            {rows.length} records {rows.length === limit ? '(showing first '+limit+')' : ''}
          </span>
        )}
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading device logs...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>
            No device logs found for selected date range.<br/>
            <span style={{ fontSize:11 }}>Logs are saved automatically every 5 minutes by the ESSL agent.</span>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['Emp Code','Name','Department','Designation','Swipe Time','Direction','Source'].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign:['Swipe Time','Direction','Source'].includes(h)?'center':'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9', background: i%2===0?'#fff':'#FAFAFA' }}>
                  <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.emp_code||'-'}</td>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.employee_name||<span style={{color:'#CBD5E1'}}>Unknown</span>}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department_name||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.designation||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', color:'#475569', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                    {r.swipe_time ? new Date(r.swipe_time).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }) : '-'}
                  </td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}><DirBadge dir={r.direction} /></td>
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
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
            style={{ padding:'5px 12px', border:'1px solid #CBD5E1', borderRadius:6, background:page===1?'#F8FAFC':'#fff', cursor:page===1?'default':'pointer', fontSize:12 }}>← Prev</button>
          <span style={{ padding:'5px 8px', fontSize:12, color:'#64748B' }}>Page {page}</span>
          <button onClick={()=>setPage(p=>p+1)} disabled={rows.length < limit}
            style={{ padding:'5px 12px', border:'1px solid #CBD5E1', borderRadius:6, background:rows.length<limit?'#F8FAFC':'#fff', cursor:rows.length<limit?'default':'pointer', fontSize:12 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
