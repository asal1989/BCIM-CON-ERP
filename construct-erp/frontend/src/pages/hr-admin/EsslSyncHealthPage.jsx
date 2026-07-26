import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrEsslAPI } from '../../api/client';
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, Radio, Database, Clock,
  Users, Monitor, WifiOff, Sparkles, ChevronRight, Search, MapPin, Fingerprint, ShieldAlert,
} from 'lucide-react';

const STATUS_CFG = {
  alive: { label: 'Agent Alive', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
  stale: { label: 'Agent Stale — no heartbeat recently', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertTriangle },
  never: { label: 'No heartbeat ever received', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: HelpCircle },
};

function fmtAgo(sec) {
  if (sec === null || sec === undefined) return 'never';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ago`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h ago`;
}
function fmtTime(t) {
  if (!t) return '—';
  return new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
const initials = (s) => (s || '?').trim().split(/[\s-]+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// ── Premium gradient-icon KPI card ─────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, gradient }) {
  return (
    <div className="essl-kpi-card" style={{
      background: '#fff', border: '1px solid #EEF2F7', borderRadius: 16, padding: '16px 18px',
      flex: '1 1 190px', minWidth: 190, boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        boxShadow: '0 6px 14px -4px rgba(15,23,42,0.25)',
      }}>
        <Icon size={18} color="#fff" />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 7 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#B0B9C6', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const selectCls = {
  border: '1px solid #E2E8F0', borderRadius: 9, padding: '8px 12px', fontSize: 12.5,
  background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer', fontWeight: 600,
};
const labelCls = { fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' };

export default function EsslSyncHealthPage() {
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['essl-health'],
    queryFn: () => hrEsslAPI.health().then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: deviceData, refetch: refetchDevices, isFetching: devicesFetching } = useQuery({
    queryKey: ['essl-devices'],
    queryFn: () => hrEsslAPI.getDevices().then(r => r.data),
    refetchInterval: 30000,
  });
  const devices = deviceData?.data || [];

  const locations = useMemo(() => [...new Set(devices.map(d => d.location).filter(Boolean))].sort(), [devices]);

  const filteredDevices = useMemo(() => devices.filter(d => {
    if (locationFilter && d.location !== locationFilter) return false;
    if (statusFilter === 'online' && !d.online) return false;
    if (statusFilter === 'offline' && d.online) return false;
    if (search && !`${d.name} ${d.serial_number} ${d.location}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [devices, locationFilter, statusFilter, search]);

  const status = STATUS_CFG[data?.status] || STATUS_CFG.never;
  const StatusIcon = status.icon;

  const handleRefreshAll = () => { refetch(); refetchDevices(); };
  const busy = isFetching || devicesFetching;

  return (
    <div style={{ background: 'radial-gradient(1200px 400px at 20% -10%, #EFF4FF 0%, #F8FAFC 55%)', minHeight: '100vh' }}>
      <style>{`
        .essl-kpi-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(15,23,42,0.09); }
        .essl-btn:hover { transform: translateY(-1px); }
        .essl-row:hover td { background: #F8FAFF !important; }
        .essl-select-wrap select:focus, .essl-select-wrap input:focus { outline: 2px solid #93C5FD; outline-offset: 1px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ padding: '22px 24px 24px' }}>
        {/* ── Hero banner ─────────────────────────────────────────────── */}
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 20,
          background: 'linear-gradient(120deg,#0B1739 0%,#132A63 45%,#1A56DB 100%)',
          padding: '24px 28px', marginBottom: 20, boxShadow: '0 18px 40px -12px rgba(11,23,57,0.45)',
        }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.35),transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -80, left: '30%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,0.18),transparent 70%)' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                <Fingerprint size={24} color="#fff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginBottom: 3, fontWeight: 600 }}>
                  <span>HR Admin</span><ChevronRight size={11} /><span>Biometric</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99, padding: '2px 8px', color: '#BFDBFE', fontSize: 10, fontWeight: 800, letterSpacing: '0.03em' }}>
                    <Sparkles size={10} /> LIVE
                  </span>
                </div>
                <h1 style={{ fontWeight: 800, fontSize: 22, color: '#fff', margin: 0, letterSpacing: '-0.015em' }}>ESSL Sync Health</h1>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.68)' }}>
                  Live status of the local biometric sync agent (essl-agent/sync.js) · auto-refreshing every 30s
                </p>
              </div>
            </div>

            {!isLoading && data && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: status.color === '#16A34A' ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.10)', border: `1px solid ${status.color === '#16A34A' ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.2)'}`, borderRadius: 14, padding: '10px 20px', backdropFilter: 'blur(4px)' }}>
                <StatusIcon size={22} color={status.color === '#16A34A' ? '#4ADE80' : '#fff'} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{status.label}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', fontWeight: 600, marginTop: 2 }}>Last heartbeat {fmtAgo(data.heartbeat_age_sec)}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', display: 'flex', gap: 9, marginTop: 20 }}>
            <button className="essl-btn" onClick={handleRefreshAll} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '9px 15px', cursor: busy ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.10)', color: '#fff', transition: 'transform 0.12s ease' }}>
              <RefreshCw size={13} style={{ animation: busy ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#94A3B8' }}>Loading…</div>
        ) : isError || !data ? (
          <div style={{ textAlign: 'center', padding: 56, background: '#fff', border: '1px solid #FECACA', borderRadius: 16 }}>
            <AlertTriangle size={28} color="#DC2626" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>Couldn't load sync health</div>
            <div style={{ fontSize: 12.5, color: '#94A3B8' }}>{error?.response?.data?.error || error?.message || 'Unknown error'}</div>
          </div>
        ) : (
          <>
            {/* ── KPI cards ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <KpiCard icon={Radio}    label="Last Heartbeat"       value={fmtAgo(data.heartbeat_age_sec)} sub={fmtTime(data.last_heartbeat)} gradient="linear-gradient(135deg,#0EA5E9,#38BDF8)" />
              <KpiCard icon={Database} label="Last Swipe Data"      value={fmtAgo(data.last_sync_age_sec)} sub={fmtTime(data.last_sync)} gradient="linear-gradient(135deg,#7C3AED,#A78BFA)" />
              <KpiCard icon={Clock}    label="Swipes Today"         value={data.swipes_today} gradient="linear-gradient(135deg,#16A34A,#4ADE80)" />
              <KpiCard icon={Clock}    label="Swipes (24h)"         value={data.swipes_24h} gradient="linear-gradient(135deg,#EA580C,#FB923C)" />
              <KpiCard icon={ShieldAlert} label="Unmatched Codes (7d)" value={data.unmatched_codes_7d.length} sub="employee_code not in ERP" gradient="linear-gradient(135deg,#DC2626,#F87171)" />
              <KpiCard icon={Monitor}  label="Online Devices"       value={deviceData?.online ?? '—'} gradient="linear-gradient(135deg,#0D9488,#2DD4BF)" />
              <KpiCard icon={WifiOff}  label="Offline Devices"      value={deviceData?.offline ?? '—'} gradient="linear-gradient(135deg,#B91C1C,#EF4444)" />
            </div>

            {/* ── Biometric devices panel ─────────────────────────────────── */}
            <div style={{ background: '#fff', border: '1px solid #E7ECF3', borderRadius: 16, marginBottom: 18, boxShadow: '0 2px 8px rgba(15,23,42,0.03)', overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Biometric Devices</h3>
                    <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#94A3B8' }}>Reported by the agent every tick from the ESSL "Devices" table — online if pinged within 5 minutes.</p>
                  </div>
                  <div className="essl-select-wrap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device…"
                        style={{ ...selectCls, cursor: 'text', paddingLeft: 28, width: 150 }} />
                    </div>
                    <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={selectCls}>
                      <option value="">All Locations</option>
                      {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectCls}>
                      <option value="">All Status</option>
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredDevices.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#94A3B8', margin: 0, padding: '30px 20px', textAlign: 'center' }}>
                  {devices.length === 0 ? 'No device status data yet — waiting for the agent\'s next tick.' : 'No devices match the current filters.'}
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Device</th>
                        <th style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Serial No.</th>
                        <th style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Location</th>
                        <th style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Last Ping</th>
                        <th style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDevices.map(d => (
                        <tr className="essl-row" key={d.device_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                                background: d.online ? 'linear-gradient(135deg,#0D9488,#2DD4BF)' : 'linear-gradient(135deg,#94A3B8,#CBD5E1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10.5, fontWeight: 800, color: '#fff',
                              }}>{initials(d.name)}</div>
                              <span style={{ fontWeight: 700, color: '#1E293B' }}>{d.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 16px', color: '#64748B', fontFamily: 'monospace', fontSize: 11.5 }}>{d.serial_number || '—'}</td>
                          <td style={{ padding: '10px 16px', color: '#64748B' }}>
                            {d.location ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} color="#94A3B8" />{d.location}</span> : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: '#94A3B8', fontSize: 11 }}>{fmtTime(d.last_ping)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
                              padding: '4px 10px', borderRadius: 99,
                              background: d.online ? '#F0FDF4' : '#FEF2F2', color: d.online ? '#16A34A' : '#DC2626',
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.online ? '#16A34A' : '#DC2626' }} />
                              {d.online ? 'Online' : 'Offline'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Two-column: errors + unmatched codes ────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: '#fff', border: '1px solid #E7ECF3', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>Recent Sync Errors</h3>
                {data.recent_errors.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: '#94A3B8', margin: 0 }}>No errors logged.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.recent_errors.map((e, i) => (
                      <div key={i} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700 }}>{fmtTime(e.synced_at)} · {e.from_date} → {e.to_date}</div>
                        <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 2 }}>{e.error_msg}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#fff', border: '1px solid #E7ECF3', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>Unmatched Device Codes (last 7 days)</h3>
                <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#94A3B8' }}>Swiping the device but no matching employee_code in this ERP — could be another site's staff, a resigned employee, or someone genuinely missing.</p>
                {data.unmatched_codes_7d.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: '#16A34A', margin: 0, fontWeight: 600 }}>None — every swiping employee matches an ERP record. ✓</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ textAlign: 'left', padding: '5px 6px', color: '#64748B', fontWeight: 700 }}>Emp Code</th>
                        <th style={{ textAlign: 'center', padding: '5px 6px', color: '#64748B', fontWeight: 700 }}>Swipes</th>
                        <th style={{ textAlign: 'right', padding: '5px 6px', color: '#64748B', fontWeight: 700 }}>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.unmatched_codes_7d.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 6px', fontFamily: 'monospace', color: '#DC2626', fontWeight: 700 }}>{r.emp_code}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: '#475569' }}>{r.n}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: '#94A3B8', fontSize: 11 }}>{fmtTime(r.last_seen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
