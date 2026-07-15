import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Download, Shuffle } from 'lucide-react';

const today = () => new Date().toISOString().slice(0,10);

const S_COLOR = { present:'#D1FAE5/#065F46', absent:'#FEE2E2/#991B1B', leave:'#FEF3C7/#92400E', half_day:'#DBEAFE/#1E40AF' };
function Pill({ s }) {
  const [bg,c] = (S_COLOR[(s||'absent').toLowerCase()]||'#F1F5F9/#475569').split('/');
  return <span style={{ background:bg, color:c, borderRadius:3, padding:'1px 7px', fontWeight:700, fontSize:10 }}>{(s||'absent').replace('_',' ').toUpperCase()}</span>;
}

export default function RandomCheckReportPage() {
  const [date, setDate]       = useState(today());
  const [project, setProject] = useState('');
  const [samplePct, setSamplePct] = useState(20);
  const [sample, setSample]   = useState(null);

  const { data: projects } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data||r.data||[]) });

  const { data, isLoading } = useQuery({
    queryKey: ['random-check-pool', date, project],
    queryFn:  () => hrAttendanceAPI.timesheetReport({ from:date, to:date, project_id:project||undefined }).then(r => r.data?.data || r.data || []),
  });

  const pool = Array.isArray(data) ? data : [];

  const generateSample = useCallback(() => {
    const n = Math.max(1, Math.round(pool.length * samplePct / 100));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setSample(shuffled.slice(0, n));
  }, [pool, samplePct]);

  const displayRows = sample || [];

  const exportCSV = () => {
    const header = ['#','Emp ID','Name','Department','Status','In Time','Out Time'];
    const csvRows = displayRows.map((r,i)=>[i+1,r.emp_id||'',r.name||'',r.department||'',r.attendance_status||r.status||'',r.in_time||'',r.out_time||'']);
    const csv=[header,...csvRows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=`random-check-${date}.csv`; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Shuffle size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Random Check Report</h1>
        </div>
        {displayRows.length > 0 && (
          <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            <Download size={14}/> Export CSV
          </button>
        )}
      </div>

      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #E2E8F0', padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Date</label>
            <input type="date" value={date} onChange={e=>{ setDate(e.target.value); setSample(null); }} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'6px 10px', fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Project</label>
            <select value={project} onChange={e=>{ setProject(e.target.value); setSample(null); }} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'6px 10px', fontSize:13 }}>
              <option value=''>All Projects</option>
              {(projects||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Sample Size</label>
            <select value={samplePct} onChange={e=>setSamplePct(+e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'6px 10px', fontSize:13 }}>
              {[10,20,25,30,50].map(p=><option key={p} value={p}>{p}% of staff</option>)}
            </select>
          </div>
          <button onClick={generateSample} disabled={isLoading || pool.length === 0}
            style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', cursor: isLoading||pool.length===0?'not-allowed':'pointer', fontSize:13, fontWeight:700 }}>
            <Shuffle size={14}/> {sample ? 'Re-randomize' : 'Generate Sample'}
          </button>
        </div>
        {!isLoading && pool.length > 0 && (
          <p style={{ margin:'12px 0 0', fontSize:12, color:'#64748B' }}>
            Pool: <strong>{pool.length}</strong> employees · Sample: <strong>{Math.round(pool.length * samplePct / 100)}</strong> employees ({samplePct}%)
          </p>
        )}
        {isLoading && <p style={{ margin:'12px 0 0', fontSize:12, color:'#94A3B8' }}>Loading attendance pool...</p>}
      </div>

      {!sample ? (
        <div style={{ textAlign:'center', padding:'50px', color:'#94A3B8', background:'#fff', borderRadius:8, border:'1px dashed #CBD5E1' }}>
          <Shuffle size={40} style={{ marginBottom:12, opacity:0.3 }} />
          <p style={{ margin:0 }}>Click "Generate Sample" to randomly select employees for attendance verification</p>
        </div>
      ) : (
        <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #E2E8F0', background:'#FAFAFF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#7C3AED', fontSize:13 }}>Random Sample — {displayRows.length} employees selected</span>
            <span style={{ fontSize:12, color:'#64748B' }}>Date: {date}</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['#','Emp ID','Name','Department','Designation','Status','In Time','Out Time','Verified'].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign: ['In Time','Out Time','Status','Verified'].includes(h)?'center':'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'7px 12px', color:'#94A3B8', fontSize:11 }}>{i+1}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.emp_id||'-'}</td>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.designation||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}><Pill s={r.attendance_status||r.status} /></td>
                  <td style={{ padding:'7px 12px', textAlign:'center', fontFamily:'monospace', color:'#475569' }}>{r.in_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center', fontFamily:'monospace', color:'#475569' }}>{r.out_time||'-'}</td>
                  <td style={{ padding:'7px 12px', textAlign:'center' }}>
                    <input type="checkbox" style={{ accentColor:'#7C3AED', width:14, height:14 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
