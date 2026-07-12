// src/components/chat/IncomingCallModal.jsx — Overlay shown when a peer calls.
// Ring tone synthesised via Web Audio API (no audio file needed).
import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Av } from './chatShared';

function useRingtone(active) {
  const ctxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) { clearInterval(timerRef.current); return; }

    function ring() {
      try {
        if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime;
        [[t, 880, 0.18], [t + 0.12, 1100, 0.12]].forEach(([start, freq, vol]) => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(vol,    start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.25);
        });
      } catch { /* blocked by browser — silently skip */ }
    }

    ring();
    timerRef.current = setInterval(ring, 2200);
    return () => clearInterval(timerRef.current);
  }, [active]);
}

export default function IncomingCallModal({ callInfo, onAccept, onReject }) {
  useRingtone(!!callInfo);
  if (!callInfo) return null;

  const isVideo = callInfo.callType === 'video';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #1C2333 0%, #0F172A 100%)',
        borderRadius: 28, padding: '44px 36px',
        textAlign: 'center', minWidth: 300, maxWidth: 340,
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        animation: 'callSlideIn 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Pulsing avatar */}
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 20 }}>
          <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '2px solid rgba(34,197,94,0.35)', animation: 'ringPulse 1.4s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '1.5px solid rgba(34,197,94,0.15)', animation: 'ringPulse 1.4s ease-out 0.4s infinite' }} />
          <Av name={callInfo.peerName || '?'} size={84} photo={callInfo.peerPhoto} />
        </div>

        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6, letterSpacing: '0.03em' }}>
          {isVideo ? '📹 Incoming video call' : '📞 Incoming audio call'}
        </p>
        <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 36, lineHeight: 1.2 }}>
          {callInfo.peerName}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          {/* Decline */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={onReject}
              style={{ width: 68, height: 68, borderRadius: '50%', background: '#EF4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 6px 20px rgba(239,68,68,0.4)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
              <PhoneOff size={28} color="#fff" />
            </button>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Decline</span>
          </div>

          {/* Accept */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={onAccept}
              style={{ width: 68, height: 68, borderRadius: '50%', background: '#22C55E', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 6px 20px rgba(34,197,94,0.4)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
              {isVideo ? <Video size={28} color="#fff" /> : <Phone size={28} color="#fff" />}
            </button>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Accept</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes callSlideIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
        @keyframes ringPulse   { 0% { transform:scale(1); opacity:0.8; } 100% { transform:scale(1.5); opacity:0; } }
      `}</style>
    </div>
  );
}
