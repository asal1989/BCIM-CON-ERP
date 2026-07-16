// src/components/chat/CallsPane.jsx — call log list with filters, grouped by
// date, with call-back buttons. Extracted from ERPChat.jsx (component split).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, VideoIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { Av } from './chatShared';
import { C, fmtRelTime } from './chatTheme';

function fmtDur(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CALL_STATUS_META = {
  answered:  { label: 'Answered',  color: C.green,   Icon: null },
  cancelled: { label: 'Cancelled', color: C.muted,   Icon: null },
  missed:    { label: 'Missed',    color: '#EF4444', Icon: null },
  rejected:  { label: 'Declined',  color: '#EF4444', Icon: null },
  busy:      { label: 'Busy',      color: C.amber,   Icon: null },
  failed:    { label: 'Failed',    color: '#EF4444', Icon: null },
};

function CallLogRow({ log, currentUserId, onCallBack, employees }) {
  const isOutgoing = log.caller_id === currentUserId;
  const peerName   = isOutgoing ? log.callee_name : log.caller_name;
  const peerId     = isOutgoing ? log.callee_id   : log.caller_id;
  const peer       = employees.find(e => e.id === peerId);
  const meta       = CALL_STATUS_META[log.status] || CALL_STATUS_META.answered;
  const isMissed   = log.status === 'missed' || log.status === 'rejected';

  const DirectionIcon = isOutgoing
    ? PhoneOutgoing
    : isMissed ? PhoneMissed : PhoneIncoming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: `1px solid ${C.borderLight}`,
        background: C.card,
      }}
      onMouseEnter={e => e.currentTarget.style.background = C.bg}
      onMouseLeave={e => e.currentTarget.style.background = C.card}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Av name={peerName} size={44} photo={peer?.profile_photo_url} />
        <div style={{
          position: 'absolute', bottom: 0, right: -2,
          width: 18, height: 18, borderRadius: '50%',
          background: isMissed ? '#FEE2E2' : C.greenBg,
          border: `2px solid ${C.card}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DirectionIcon size={9} color={isMissed ? '#EF4444' : C.green} strokeWidth={2.5} />
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontWeight: 600, fontSize: 14, color: isMissed ? '#EF4444' : C.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{peerName}</span>
          {log.call_type === 'video' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10.5, color: C.muted, background: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 6px',
            }}>
              <VideoIcon size={9} /> Video
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: meta.color, fontWeight: 500 }}>{meta.label}</span>
          {log.duration_secs > 0 && (
            <span style={{ fontSize: 12, color: C.subtle }}>· {fmtDur(log.duration_secs)}</span>
          )}
        </div>
      </div>

      {/* Time + call-back */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: C.subtle }}>{fmtRelTime(log.started_at)}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => onCallBack(peer || { id: peerId, full_name: peerName }, 'audio')}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: C.greenBg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Voice call">
            <Phone size={13} color={C.green} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => onCallBack(peer || { id: peerId, full_name: peerName }, 'video')}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: C.primaryLight, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Video call">
            <Video size={13} color={C.primary} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

export function CallsPane({ currentUserId, employees, startCall, compact = false }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all'); // all | missed | outgoing | incoming

  const loadLogs = useCallback(() => {
    setLoading(true);
    api.get('/chat/call-logs', { params: { limit: 200 } })
      .then(r => setLogs(r.data?.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const filtered = useMemo(() => {
    if (filter === 'all')      return logs;
    if (filter === 'missed')   return logs.filter(l => l.status === 'missed' || l.status === 'rejected');
    if (filter === 'outgoing') return logs.filter(l => l.caller_id === currentUserId);
    if (filter === 'incoming') return logs.filter(l => l.callee_id === currentUserId);
    return logs;
  }, [logs, filter, currentUserId]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = [];
    let lastDate = '';
    for (const log of filtered) {
      const d = new Date(log.started_at);
      const label = (() => {
        const diff = Math.floor((Date.now() - d) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff < 7)  return d.toLocaleDateString([], { weekday: 'long' });
        return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
      })();
      if (label !== lastDate) { groups.push({ type: 'date', label }); lastDate = label; }
      groups.push({ type: 'log', log });
    }
    return groups;
  }, [filtered]);

  const missedCount = logs.filter(l => l.status === 'missed' || l.status === 'rejected').length;

  const onCallBack = useCallback((peer, callType) => {
    if (!peer?.id) return toast.error('Cannot call — user not found');
    startCall(peer, callType).catch(e => toast.error(e.message || 'Could not start call'));
  }, [startCall]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Header */}
      <div style={{ padding: compact ? '10px 14px 8px' : '16px 20px 12px', background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 8 : 12 }}>
          <p style={{ fontSize: 12, color: C.muted }}>{logs.length} call{logs.length !== 1 ? 's' : ''} total</p>
          <motion.button whileTap={{ scale: 0.9 }} onClick={loadLogs}
            style={{
              padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: C.muted,
            }}>
            Refresh
          </motion.button>
        </div>

        {/* Stats row */}
        {!compact && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Total', val: logs.length, color: C.primary },
              { label: 'Answered', val: logs.filter(l => l.status === 'answered').length, color: C.green },
              { label: 'Missed', val: missedCount, color: '#EF4444' },
              { label: 'Outgoing', val: logs.filter(l => l.caller_id === currentUserId).length, color: C.amber },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: C.bg, borderRadius: 10, padding: '8px 10px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color }}>{val}</p>
                <p style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Compact stats */}
        {compact && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'All', val: logs.length, id: 'all', color: C.text },
              { label: `Missed${missedCount > 0 ? ` (${missedCount})` : ''}`, val: null, id: 'missed', color: '#EF4444' },
              { label: 'In', val: null, id: 'incoming', color: C.green },
              { label: 'Out', val: null, id: 'outgoing', color: C.primary },
            ].map(({ label, id, color }) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{
                  flex: 1, padding: '4px 6px', borderRadius: 8, cursor: 'pointer',
                  background: filter === id ? C.primary : C.bg,
                  color: filter === id ? '#fff' : C.muted,
                  fontSize: 11, fontWeight: filter === id ? 700 : 500,
                  border: `1px solid ${filter === id ? C.primary : C.border}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Filter chips (non-compact) */}
        {!compact && (
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'missed', label: `Missed${missedCount > 0 ? ` (${missedCount})` : ''}` },
              { id: 'incoming', label: 'Incoming' },
              { id: 'outgoing', label: 'Outgoing' },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{
                  padding: '4px 14px', borderRadius: 999, cursor: 'pointer',
                  background: filter === id ? C.primary : C.bg,
                  color: filter === id ? '#fff' : C.muted,
                  fontSize: 12.5, fontWeight: filter === id ? 700 : 500,
                  border: `1px solid ${filter === id ? C.primary : C.border}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <motion.div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.primary}` }}
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
          </div>
        )}
        {!loading && grouped.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14, opacity: 0.5 }}>
            <PhoneOff size={48} color={C.muted} />
            <p style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>
              {filter === 'missed' ? 'No missed calls' : 'No call history yet'}
            </p>
            <p style={{ fontSize: 12.5, color: C.subtle }}>
              Voice and video calls appear here after they end
            </p>
          </div>
        )}
        {!loading && grouped.map((item, i) => {
          if (item.type === 'date') return (
            <div key={`d-${i}`} style={{
              padding: '10px 20px 4px', fontSize: 11.5, fontWeight: 700,
              color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em',
              background: C.bg,
            }}>{item.label}</div>
          );
          return (
            <CallLogRow key={item.log.id} log={item.log}
              currentUserId={currentUserId} onCallBack={onCallBack} employees={employees} />
          );
        })}
      </div>
    </div>
  );
}
