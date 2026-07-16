// src/components/chat/ScreenShareWindow.jsx — floating preview for the SHARER.
// Shows a small PiP of their own screen + a red laser dot where the viewer's cursor is.
import { useRef, useEffect } from 'react';
import { Monitor, X, MousePointer } from 'lucide-react';

export default function ScreenShareWindow({ screenStream, shareInfo, pointerPos, onStop }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = screenStream || null;
  }, [screenStream]);

  return (
    <div style={{
      position: 'fixed', bottom: 100, left: 20, zIndex: 200,
      width: 300, background: '#0d1117',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
      overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.65)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'rgba(5,10,20,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
          display: 'inline-block', animation: 'ssPulse 2s ease-in-out infinite',
        }} />
        <Monitor size={13} color="#60a5fa" />
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Sharing → {shareInfo?.peerName}
        </span>
        <button onClick={onStop} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', background: 'rgba(239,68,68,0.85)',
          border: 'none', borderRadius: 6, color: '#fff',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>
          <X size={10} /> Stop
        </button>
      </div>

      {/* Preview + laser dot */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />

        {/* Red laser dot at viewer's cursor position */}
        {pointerPos && (
          <div style={{
            position: 'absolute',
            left: `${pointerPos.x * 100}%`,
            top:  `${pointerPos.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: 'rgba(239,68,68,0.9)',
            border: '2px solid #fff',
            boxShadow: '0 0 10px rgba(239,68,68,0.8), 0 0 20px rgba(239,68,68,0.4)',
            pointerEvents: 'none',
            transition: 'left 0.04s linear, top 0.04s linear',
          }} />
        )}

        {!screenStream && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Starting…</p>
          </div>
        )}
      </div>

      {/* Laser pointer legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', background: 'rgba(5,10,20,0.9)',
      }}>
        <MousePointer size={11} color="#60a5fa" />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
          {pointerPos ? `Viewer cursor active` : 'Waiting for viewer cursor…'}
        </span>
        {pointerPos && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', marginLeft: 'auto' }} />
        )}
      </div>

      <style>{`@keyframes ssPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  );
}
