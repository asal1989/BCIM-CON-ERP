import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../../api/client';
import toast from 'react-hot-toast';

const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); };
const today = () => new Date().toISOString().slice(0,10);

export default function RecalculateAttendancePage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to,   setTo]   = useState(today());
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

  const run = async () => {
    if (!from || !to) { toast.error('Select date range'); return; }
    if (from > to)    { toast.error('From must be before To'); return; }
    setRunning(true); setResult(null);
    try {
      const res = await api.post('/hr-admin/attendance/recalculate', { from, to });
      setResult({ ok: true, ...res.data });
      toast.success('Recalculation complete');
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.error || e.message });
      toast.error('Recalculation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6" style={{ maxWidth: 600 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
        <RefreshCw size={22} style={{ color:'#7C3AED' }} />
        <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Re-calculate Attendance</h1>
      </div>

      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #E2E8F0', padding:24 }}>
        <p style={{ color:'#64748B', fontSize:13, marginBottom:20 }}>
          Recalculate attendance status, late minutes, and summaries for the selected date range.
          Existing records will be updated based on punch-in/out times and shift schedules.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>From Date</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
              style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'7px 10px', fontSize:13, width:'100%' }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>To Date</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)}
              style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'7px 10px', fontSize:13, width:'100%' }} />
          </div>

          <button onClick={run} disabled={running}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, background: running?'#A78BFA':'#7C3AED', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', cursor: running?'not-allowed':'pointer', fontSize:14, fontWeight:700, marginTop:6 }}>
            <RefreshCw size={15} style={{ animation: running?'spin 1s linear infinite':undefined }} />
            {running ? 'Recalculating...' : 'Run Recalculation'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ marginTop:16, background: result.ok?'#F0FDF4':'#FFF1F2', border:`1px solid ${result.ok?'#86EFAC':'#FCA5A5'}`, borderRadius:8, padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: result.ok&&result.updated?8:0 }}>
            {result.ok ? <CheckCircle2 size={18} color="#16A34A"/> : <AlertCircle size={18} color="#DC2626"/>}
            <span style={{ fontWeight:700, color: result.ok?'#166534':'#991B1B', fontSize:14 }}>
              {result.ok ? 'Recalculation successful' : 'Recalculation failed'}
            </span>
          </div>
          {result.ok && result.updated !== undefined && (
            <p style={{ color:'#166534', fontSize:13, margin:0 }}>{result.updated} records updated for {from} → {to}</p>
          )}
          {!result.ok && <p style={{ color:'#991B1B', fontSize:13, margin:0 }}>{result.message}</p>}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
