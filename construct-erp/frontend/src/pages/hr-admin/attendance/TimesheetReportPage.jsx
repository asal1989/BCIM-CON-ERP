import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, Filter } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

const STATUS_COLOR = {
  present:  { bg: '#D1FAE5', color: '#065F46' },
  absent:   { bg: '#FEE2E2', color: '#991B1B' },
  leave:    { bg: '#FEF3C7', color: '#92400E' },
  half_day: { bg: '#DBEAFE', color: '#1E40AF' },
  holiday:  { bg: '#EDE9FE', color: '#5B21B6' },
};
const STATUS_LABEL = { present:'P', absent:'A', leave:'L', half_day:'HD', holiday:'H' };

function Pill({ status }) {
  const s = (status || 'absent').toLowerCase();
  const { bg, color } = STATUS_COLOR[s] || STATUS_COLOR.absent;
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}33`,
      borderRadius: 3, padding: '1px 7px', fontWeight: 700,
      fontSize: 10, letterSpacing: 0.5, display: 'inline-block',
    }}>
      {STATUS_LABEL[s] || s.toUpperCase()}
    </span>
  );
}

export default function TimesheetReportPage() {
  const [date, setDate]             = useState(today());
  const [category, setCategory]     = useState('staff');
  const [projectFilter, setProject] = useState('');
  const [rows, setRows]             = useState([]);
  const [summary, setSummary]       = useState({ total:0, present:0, absent:0, leave:0 });
  const [meta, setMeta]             = useState({ companyName:'BCIM', projectName:'', projectCode:'' });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const { data: projectsData } = useQuery({
    queryKey: ['projects-active-ts'],
    queryFn: () => projectAPI.list({ is_active: true }).then(r => r.data),
  });
  const projects = projectsData?.data || [];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await hrAttendanceAPI.timesheetReport({
        date, category,
        project_id: projectFilter || undefined,
      });
      const d = res.data;
      setRows(d.data || []);
      setSummary(d.summary || { total:0, present:0, absent:0, leave:0 });
      setMeta({
        companyName: d.companyName || 'BCIM',
        projectName: d.projectName || '',
        projectCode: d.projectCode || '',
      });
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load timesheet');
    } finally { setLoading(false); }
  }, [date, category, projectFilter]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const headers = ['S.No','EMP ID','Name','Designation','Department','Company','P/A','In Time','Out Time','Late Min','Shift','Location','Emp Status','Reason'];
    const csvRows = rows.map((r, i) => [
      i+1, r.emp_id||'', r.name, r.designation, r.department,
      r.company, r.attendance_status, r.in_time||'', r.out_time||'',
      r.late_minutes||0, r.shift, r.location, r.status, r.reason||'',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const selProject = projects.find(p => p.id === projectFilter);

  return (
    <div style={{ background:'#F8FAFC', minHeight:'100vh' }}>

      {/* ── PRINT STYLES ──────────────────────────────── */}
      <style>{`
        @media print {
          html, body { margin:0; padding:0; background:#fff !important; }
          body * { visibility:hidden !important; }
          #ts-print-root, #ts-print-root * { visibility:visible !important; }
          #ts-print-root { position:absolute !important; left:0; top:0; width:100%; background:#fff; }
          @page { size: A3 landscape; margin: 8mm 10mm; }
          #ts-print-root { font-family: Arial, sans-serif; font-size: 10pt; color: #000; }
          .no-print { display:none !important; }
          .print-only { display:block !important; }
          .print-table { width:100%; border-collapse:collapse; font-size:8.5pt; }
          .print-table th {
            background:#1B3A6B !important; color:#fff !important;
            padding:5px 6px; border:1px solid #1B3A6B;
            text-align:left; font-size:8pt; -webkit-print-color-adjust:exact; print-color-adjust:exact;
          }
          .print-table td { padding:4px 6px; border:1px solid #ccc; vertical-align:middle; }
          .print-table tr:nth-child(even) td { background:#F0F4FF !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .sig-section { page-break-inside:avoid; margin-top:20px; }
        }
        @media screen {
          .print-only { display:none !important; }
          #ts-print-root { display:block; }
        }
      `}</style>

      {/* ── SCREEN TOOLBAR ────────────────────────────── */}
      <div className="no-print" style={{
        background:'#fff', borderBottom:'1px solid #E5E7EB',
        padding:'12px 24px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:'#111827' }}>Daily Timesheet Report</h2>
          <p style={{ margin:0, fontSize:12, color:'#6B7280' }}>
            Attendance record for {fmtDate(date)}
          </p>
        </div>
        <Filter size={14} color="#6B7280"/>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{ border:'1px solid #D1D5DB', borderRadius:6, padding:'5px 10px', fontSize:13 }}/>
        <select value={category} onChange={e=>setCategory(e.target.value)}
          style={{ border:'1px solid #D1D5DB', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value="staff">Staff Only</option>
          <option value="all">All Employees</option>
        </select>
        <select value={projectFilter} onChange={e=>setProject(e.target.value)}
          style={{ border:'1px solid #D1D5DB', borderRadius:6, padding:'5px 10px', fontSize:13, minWidth:160 }}>
          <option value="">All Projects</option>
          {projects.map(p=>(
            <option key={p.id} value={p.id}>
              {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
            </option>
          ))}
        </select>
        <button onClick={load} style={{
          display:'flex', alignItems:'center', gap:5,
          background:'#2563EB', color:'#fff', border:'none',
          borderRadius:6, padding:'6px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
        }}>
          <RefreshCw size={13}/> Refresh
        </button>
        <button onClick={handleExport} style={{
          display:'flex', alignItems:'center', gap:5,
          background:'#F0FDF4', color:'#15803D', border:'1px solid #86EFAC',
          borderRadius:6, padding:'6px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
        }}>
          <Download size={13}/> Export CSV
        </button>
        <button onClick={()=>window.print()} style={{
          display:'flex', alignItems:'center', gap:5,
          background:'#F5F3FF', color:'#7C3AED', border:'1px solid #C4B5FD',
          borderRadius:6, padding:'6px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
        }}>
          <Printer size={13}/> Print
        </button>
      </div>

      {/* ── SCREEN KPI CARDS ──────────────────────────── */}
      <div className="no-print" style={{ padding:'16px 24px 0', display:'flex', gap:12, flexWrap:'wrap' }}>
        {[
          { label:'Total',   val:summary.total,   bg:'#F0F9FF', border:'#BAE6FD', text:'#0369A1' },
          { label:'Present', val:summary.present, bg:'#F0FDF4', border:'#86EFAC', text:'#15803D' },
          { label:'Absent',  val:summary.absent,  bg:'#FEF2F2', border:'#FECACA', text:'#B91C1C' },
          { label:'On Leave',val:summary.leave,   bg:'#FFFBEB', border:'#FDE68A', text:'#B45309' },
        ].map(k=>(
          <div key={k.label} style={{
            background:k.bg, border:`1px solid ${k.border}`,
            borderRadius:8, padding:'10px 20px', minWidth:110, textAlign:'center',
          }}>
            <div style={{ fontSize:24, fontWeight:800, color:k.text }}>{k.val}</div>
            <div style={{ fontSize:11, color:k.text, fontWeight:600, marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── PRINTABLE DOCUMENT ────────────────────────── */}
      <div id="ts-print-root" style={{ padding:'16px 24px 32px' }}>

        {/* ─── PRINT HEADER (hidden on screen, shown on print) ─── */}
        <div className="print-only" style={{
          borderBottom:'3px solid #1B3A6B', paddingBottom:10, marginBottom:12,
        }}>
          {/* Top row: Logo | Title | Company */}
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <img src="/bcim-logo.png" alt="BCIM Logo"
              style={{ height:60, width:'auto', objectFit:'contain', flexShrink:0 }}/>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:9, fontWeight:600, color:'#555', letterSpacing:2, textTransform:'uppercase' }}>
                {meta.companyName}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:'#1B3A6B', letterSpacing:0.5, margin:'2px 0' }}>
                DAILY ATTENDANCE / TIMESHEET REPORT
              </div>
              <div style={{ fontSize:9, color:'#444' }}>
                {meta.projectName
                  ? <>Project: <strong>{meta.projectName}</strong>{meta.projectCode ? ` (${meta.projectCode})` : ''}&emsp;|&emsp;</>
                  : null}
                Date: <strong>{fmtDate(date)}</strong>&emsp;|&emsp;
                Category: <strong>{category === 'staff' ? 'STAFF' : 'ALL EMPLOYEES'}</strong>
              </div>
            </div>
            {/* Summary box */}
            <table style={{ border:'1px solid #1B3A6B', borderCollapse:'collapse', fontSize:8, flexShrink:0 }}>
              <tbody>
                {[
                  ['Total Strength', summary.total],
                  ['Present (P)',    summary.present],
                  ['Absent (A)',     summary.absent],
                  ['On Leave (L)',   summary.leave],
                ].map(([l,v])=>(
                  <tr key={l}>
                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #ccc', borderRight:'1px solid #ccc', fontWeight:600 }}>{l}</td>
                    <td style={{ padding:'3px 10px', borderBottom:'1px solid #ccc', textAlign:'center', fontWeight:700, color:'#1B3A6B' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── LOADING / ERROR (screen only) ─── */}
        {loading && (
          <div className="no-print" style={{ textAlign:'center', padding:48, color:'#6B7280' }}>Loading…</div>
        )}
        {error && (
          <div style={{
            background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8,
            padding:16, color:'#B91C1C', marginBottom:16,
          }}>
            {error}
          </div>
        )}

        {/* ─── TABLE ─── */}
        {!loading && !error && (
          <div style={{ overflowX:'auto' }}>
            <table className="print-table" style={{
              borderCollapse:'collapse', width:'100%', fontSize:12,
              background:'#fff', borderRadius:8, overflow:'hidden',
              boxShadow:'0 1px 6px rgba(0,0,0,0.07)',
            }}>
              <thead>
                <tr style={{ background:'#1B3A6B', color:'#fff' }}>
                  {['S.No','EMP ID','Name','Designation','Department','Company',
                    'P/A','In Time','Out Time','Late\nMin','Shift','Location','Emp Status','Reason',
                  ].map(h=>(
                    <th key={h} style={{
                      padding:'7px 8px', whiteSpace:'pre', textAlign:'left',
                      fontWeight:700, fontSize:11, letterSpacing:0.3,
                      borderRight:'1px solid #2d527a',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ textAlign:'center', padding:40, color:'#6B7280', fontSize:13 }}>
                      No records found for {date}
                    </td>
                  </tr>
                ) : rows.map((r,i)=>(
                  <tr key={r.user_id||i} style={{ background: i%2===0 ? '#fff' : '#F8FAFC' }}>
                    <td style={td}>{i+1}</td>
                    <td style={{ ...td, fontWeight:600, color:'#2563EB' }}>{r.emp_id||'—'}</td>
                    <td style={{ ...td, fontWeight:600, whiteSpace:'nowrap' }}>{r.name}</td>
                    <td style={td}>{r.designation}</td>
                    <td style={td}>{r.department}</td>
                    <td style={td}>{r.company}</td>
                    <td style={{ ...td, textAlign:'center' }}><Pill status={r.attendance_status}/></td>
                    <td style={td}>{r.in_time||'—'}</td>
                    <td style={td}>{r.out_time||'—'}</td>
                    <td style={{ ...td, textAlign:'center', color:r.late_minutes>0?'#DC2626':'#111' }}>
                      {r.late_minutes>0 ? r.late_minutes : '—'}
                    </td>
                    <td style={td}>{r.shift}</td>
                    <td style={td}>{r.location}</td>
                    <td style={td}>
                      <span style={{ fontSize:10, fontWeight:700, color:r.status==='ACTIVE'?'#15803D':'#B91C1C' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ ...td, color:'#6B7280', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.reason||'—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ background:'#EFF6FF', fontWeight:700 }}>
                    <td colSpan={6} style={{ ...td, textAlign:'right', color:'#1E40AF', fontWeight:700 }}>
                      Grand Total
                    </td>
                    <td style={{ ...td, textAlign:'center' }}>
                      <span style={{ color:'#15803D', fontWeight:800 }}>{summary.present}P</span>
                      {' / '}
                      <span style={{ color:'#B91C1C', fontWeight:800 }}>{summary.absent}A</span>
                    </td>
                    <td colSpan={7} style={td}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ─── SIGNATURE SECTION (shown on print, hidden on screen) ─── */}
        <div className="print-only sig-section" style={{
          marginTop:40, borderTop:'1px solid #ccc', paddingTop:16,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:20 }}>
            {[
              { role:'Prepared By', name:'HR Executive', line:true },
              { role:'Verified By', name:'HR Manager / Admin', line:true },
              { role:'Site Incharge', name:'Project Manager', line:true },
              { role:'Approved By', name:'Management / Director', line:true },
            ].map(sig=>(
              <div key={sig.role} style={{ flex:1, textAlign:'center' }}>
                <div style={{
                  borderBottom:'1.5px solid #333', marginBottom:6,
                  height:40,
                }}/>
                <div style={{ fontSize:9, fontWeight:700, color:'#1B3A6B' }}>{sig.role}</div>
                <div style={{ fontSize:8, color:'#555', marginTop:2 }}>{sig.name}</div>
                <div style={{ fontSize:8, color:'#888', marginTop:2 }}>Date: ____________</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:12, fontSize:8, color:'#888' }}>
            This is a system-generated report — {meta.companyName} &nbsp;|&nbsp; Printed on: {new Date().toLocaleString('en-IN')}
          </div>
        </div>

      </div>
    </div>
  );
}

const td = {
  padding:'6px 8px',
  borderBottom:'1px solid #E5E7EB',
  borderRight:'1px solid #F3F4F6',
  color:'#111827',
  fontSize:11,
  verticalAlign:'middle',
};
