// src/components/chat/CallWindow.jsx — Full-screen active call UI.
// Local video in a corner PiP; remote video fills the background.
// Audio-only calls show an avatar instead of remote video.
import { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { Av } from './chatShared';

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function CtrlBtn({ icon: Icon, active, danger, label, onClick }) {
  return (
    <button onClick={onClick} title={label}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1';    e.currentTarget.style.transform = 'scale(1)'; }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        background: danger
          ? 'linear-gradient(135deg,#EF4444,#DC2626)'
          : active
            ? 'rgba(239,68,68,0.25)'
            : 'rgba(255,255,255,0.1)',
        border: active && !danger ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18, padding: '14px 22px', cursor: 'pointer', color: '#fff',
        transition: 'opacity 0.15s, transform 0.15s, background 0.15s',
        minWidth: 72, boxShadow: danger ? '0 6px 20px rgba(239,68,68,0.35)' : 'none',
      }}>
      <Icon size={22} />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{label}</span>
    </button>
  );
}

export default function CallWindow({
  localStream, remoteStream, callInfo, callState,
  isMuted, isCameraOff, isScreenSharing, duration,
  onToggleMute, onToggleCamera, onScreenShare, onEnd,
}) {
  const localRef  = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    if (localRef.current  && localStream)  localRef.current.srcObject  = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const isVideo   = callInfo?.callType === 'video';
  const isActive  = callState === 'active';
  const isCalling = callState === 'calling';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#050a14', display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Main area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Remote video */}
        {isVideo && remoteStream ? (
          <video ref={remoteRef} autoPlay playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          /* Audio-only or waiting — avatar placeholder */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, zIndex: 1 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: 'rgba(34,197,94,0.08)', animation: isActive ? 'avatarPulse 2s ease-in-out infinite' : 'none' }} />
              <Av name={callInfo?.peerName || '?'} size={100} photo={callInfo?.peerPhoto} />
            </div>
            <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' }}>{callInfo?.peerName}</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15 }}>
              {isCalling ? 'Calling…' : isActive ? fmtDuration(duration) : ''}
            </p>
          </div>
        )}

        {/* Duration badge (video active) */}
        {isVideo && isActive && (
          <div style={{ position: 'absolute', top: 18, left: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', color: '#fff', borderRadius: 10, padding: '5px 14px', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>
            {fmtDuration(duration)}
          </div>
        )}

        {/* Peer name badge (video) */}
        {isVideo && callInfo?.peerName && (
          <div style={{ position: 'absolute', top: 18, right: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', color: '#fff', borderRadius: 10, padding: '5px 14px', fontSize: 13, fontWeight: 600 }}>
            {callInfo.peerName}
          </div>
        )}

        {/* Local video PiP */}
        {isVideo && (
          <div style={{
            position: 'absolute', bottom: 28, right: 24,
            width: 176, height: 112, borderRadius: 14, overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.18)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            background: '#0a0a14',
          }}>
            <video ref={localRef} autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isCameraOff ? 'none' : 'block' }} />
            {isCameraOff && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827' }}>
                <VideoOff size={22} color="rgba(255,255,255,0.3)" />
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>You</div>
          </div>
        )}
      </div>

      {/* ── Controls bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: '22px 24px',
        background: 'rgba(5,10,20,0.88)', backdropFilter: 'blur(12px)',
        flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <CtrlBtn icon={isMuted ? MicOff : Mic}               active={isMuted}         label={isMuted ? 'Unmute'  : 'Mute'}     onClick={onToggleMute}   />
        {isVideo && <CtrlBtn icon={isCameraOff ? VideoOff : Video} active={isCameraOff} label={isCameraOff ? 'Cam On'  : 'Cam Off'} onClick={onToggleCamera} />}
        {isVideo && <CtrlBtn icon={isScreenSharing ? MonitorOff : Monitor} active={isScreenSharing} label={isScreenSharing ? 'Stop Share' : 'Share'} onClick={onScreenShare} />}
        <CtrlBtn icon={PhoneOff} danger label="End Call" onClick={onEnd} />
      </div>

      <style>{`@keyframes avatarPulse { 0%,100%{transform:scale(1);opacity:0.08} 50%{transform:scale(1.15);opacity:0.18} }`}</style>
    </div>
  );
}
