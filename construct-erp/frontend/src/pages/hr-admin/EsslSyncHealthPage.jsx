import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrEsslAPI } from '../../api/client';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, Radio, Database, Clock, Users } from 'lucide-react';

const STATUS_CFG = {
  alive: { label: 'Agent Alive', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
  stale: { label: 'Agent Stale — no heartbeat recently', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertTriangle },
  never: { label: 'No heartbeat ever received', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: HelpCircle },
};

function fmtAgo(sec) {
  if (sec === null || sec === undefined) return 'never';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m ago`;
  return `${Math.floor(sec/86400)}d ${Math.floor((sec%86400)/3600)}h ago`;
}
function fmtTime(t) {
  if (!t) return '—';
  return new Date(t).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function Card({ icon: Icon, label, value, sub, accent, bg }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 18px', flex:'1 1 180px', minWidth:180 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={16} color={accent} />
        </div>
        <span style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:'#0F172A' }}>{value}</div>
      {sub && <div style={{ fontSize:11.5, color:'#94A3B8', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

export default function EsslSyncHealthPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['essl-health'],
    queryFn: () => hrEsslAPI.health().then(r => r.data),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const status = STATUS_CFG[data?.status] || STATUS_CFG.never;
  const StatusIcon = status.icon;

  return (
    <div style={{ padding:'20px 24px', background:'#F8FAFC', minHeight:'100vh' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#0EA5E9,#38BDF8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(14,165,233,0.25)' }}>
            <Activity size={21} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontWeight:800, fontSize:19, color:'#0F172A', margin:0 }}>ESSL Sync Health</h1>
            <p style={{ margin:'2px 0 0', fontSize:12.5, color:'#64748B' }}>Live status of the local biometric sync agent (essl-agent/sync.js)</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} style={{ display:'flex', alignItems:'center', gap:7, background:'#fff', color:'#374151', border:'1px solid #D1D5DB', borderRadius:9, padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
          <RefreshCw size={14} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign:'center', padding:56, color:'#94A3B8' }}>Loading…</div>
      ) : isError || !data ? (
        <div style={{ textAlign:'center', padding:56, background:'#fff', border:'1px solid #FECACA', borderRadius:12 }}>
          <AlertTriangle size={28} color="#DC2626" style={{ marginBottom:10 }} />
          <div style={{ fontWeight:700, color:'#991B1B', marginBottom:4 }}>Couldn't load sync health</div>
          <div style={{ fontSize:12.5, color:'#94A3B8' }}>{error?.response?.data?.error || error?.message || 'Unknown error'}</div>
        </div>
      ) : (
        <>
          {/* Status banner */}
          <div style={{ display:'flex', alignItems:'center', gap:14, background:status.bg, border:`1.5px solid ${status.border}`, borderRadius:12, padding:'16px 20px', marginBottom:18 }}>
            <StatusIcon size={26} color={status.color} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:15, color:status.color }}>{status.label}</div>
              <div style={{ fontSize:12.5, color:'#475569', marginTop:2 }}>
                Last heartbeat: {fmtAgo(data.heartbeat_age_sec)} ({fmtTime(data.last_heartbeat)})
                {data.last_heartbeat_meta?.tables_found && (
                  <> &nbsp;·&nbsp; Tables: {(data.last_heartbeat_meta.tables_found || []).join(', ') || 'none found'}</>
                )}
              </div>
            </div>
            <div style={{ fontSize:11, color:'#94A3B8' }}>Auto-refreshing every 30s</div>
          </div>

          {/* KPI cards */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
            <Card icon={Radio}    label="Last Heartbeat"   value={fmtAgo(data.heartbeat_age_sec)} sub={fmtTime(data.last_heartbeat)} accent="#0EA5E9" bg="#F0F9FF" />
            <Card icon={Database} label="Last Swipe Data"  value={fmtAgo(data.last_sync_age_sec)} sub={fmtTime(data.last_sync)} accent="#7C3AED" bg="#F5F3FF" />
            <Card icon={Clock}    label="Swipes Today"     value={data.swipes_today} accent="#16A34A" bg="#F0FDF4" />
            <Card icon={Clock}    label="Swipes (24h)"     value={data.swipes_24h} accent="#EA580C" bg="#FFF7ED" />
            <Card icon={Users}    label="Unmatched Codes (7d)" value={data.unmatched_codes_7d.length} sub="employee_code not in ERP" accent="#DC2626" bg="#FEF2F2" />
          </div>

          {/* Two-column: errors + unmatched codes */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:18 }}>
              <h3 style={{ margin:'0 0 12px', fontSize:13, fontWeight:800, color:'#1E293B' }}>Recent Sync Errors</h3>
              {data.recent_errors.length === 0 ? (
                <p style={{ fontSize:12.5, color:'#94A3B8', margin:0 }}>No errors logged.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {data.recent_errors.map((e, i) => (
                    <div key={i} style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:11, color:'#991B1B', fontWeight:700 }}>{fmtTime(e.synced_at)} · {e.from_date} → {e.to_date}</div>
                      <div style={{ fontSize:11.5, color:'#B91C1C', marginTop:2 }}>{e.error_msg}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:18 }}>
              <h3 style={{ margin:'0 0 4px', fontSize:13, fontWeight:800, color:'#1E293B' }}>Unmatched Device Codes (last 7 days)</h3>
              <p style={{ margin:'0 0 12px', fontSize:11.5, color:'#94A3B8' }}>Swiping the device but no matching employee_code in this ERP — could be another site's staff, a resigned employee, or someone genuinely missing.</p>
              {data.unmatched_codes_7d.length === 0 ? (
                <p style={{ fontSize:12.5, color:'#16A34A', margin:0, fontWeight:600 }}>None — every swiping employee matches an ERP record. ✓</p>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #E2E8F0' }}>
                      <th style={{ textAlign:'left', padding:'4px 6px', color:'#64748B', fontWeight:700 }}>Emp Code</th>
                      <th style={{ textAlign:'center', padding:'4px 6px', color:'#64748B', fontWeight:700 }}>Swipes</th>
                      <th style={{ textAlign:'right', padding:'4px 6px', color:'#64748B', fontWeight:700 }}>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unmatched_codes_7d.map((r, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                        <td style={{ padding:'5px 6px', fontFamily:'monospace', color:'#DC2626', fontWeight:700 }}>{r.emp_code}</td>
                        <td style={{ padding:'5px 6px', textAlign:'center', color:'#475569' }}>{r.n}</td>
                        <td style={{ padding:'5px 6px', textAlign:'right', color:'#94A3B8', fontSize:11 }}>{fmtTime(r.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
